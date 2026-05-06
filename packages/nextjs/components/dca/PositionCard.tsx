"use client";

import { useEffect, useMemo, useState } from "react";
import { Address as AddressComp } from "@scaffold-ui/components";
import { parseUnits } from "viem";
import { base } from "viem/chains";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useWriteAndOpen } from "~~/hooks/scaffold-eth/useWriteAndOpen";
import {
  MAX_SLIPPAGE_BPS,
  USDC_DECIMALS,
  epochToDate,
  formatBps,
  formatClawd,
  formatCountdown,
  formatUsdc,
  intervalLabel,
} from "~~/utils/dca";
import { notification } from "~~/utils/scaffold-eth";

type PositionTuple = readonly [
  `0x${string}`, // owner
  bigint, // usdcBalance
  bigint, // clawdAccrued
  bigint, // amountPerSwap
  bigint, // intervalInEpochs
  bigint, // lastExecutedEpoch
  bigint, // slippageBps
  boolean, // active
];

type PositionCardProps = {
  positionId: bigint;
};

const useCurrentEpoch = () => {
  const { data } = useScaffoldReadContract({
    contractName: "CLAWDdca",
    functionName: "currentEpoch",
    watch: true,
  });
  return data as bigint | undefined;
};

const useNow = (intervalMs: number) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
};

export const PositionCard = ({ positionId }: PositionCardProps) => {
  const { address: connectedAddress } = useAccount();
  const currentEpoch = useCurrentEpoch();
  const now = useNow(1000);

  const { data: position, refetch } = useScaffoldReadContract({
    contractName: "CLAWDdca",
    functionName: "positions",
    args: [positionId],
    watch: true,
  });

  const { writeContractAsync: writeDca } = useScaffoldWriteContract({
    contractName: "CLAWDdca",
  });
  const { writeAndOpen } = useWriteAndOpen();

  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [slippageBusy, setSlippageBusy] = useState(false);
  const [slippageInput, setSlippageInput] = useState<string>("");

  const tuple = position as PositionTuple | undefined;

  const owner = tuple?.[0];
  const usdcBalance = tuple?.[1];
  const clawdAccrued = tuple?.[2];
  const amountPerSwap = tuple?.[3];
  const intervalInEpochs = tuple?.[4];
  const lastExecutedEpoch = tuple?.[5];
  const slippageBps = tuple?.[6];
  const active = tuple?.[7];

  const isOwner = owner && connectedAddress && owner.toLowerCase() === connectedAddress.toLowerCase();

  const executionsRemaining = useMemo(() => {
    if (!usdcBalance || !amountPerSwap || amountPerSwap === 0n) return 0n;
    return usdcBalance / amountPerSwap;
  }, [usdcBalance, amountPerSwap]);

  const nextExecutionDate = useMemo(() => {
    if (!currentEpoch || lastExecutedEpoch === undefined || intervalInEpochs === undefined) return null;
    const targetEpoch = lastExecutedEpoch + intervalInEpochs;
    return epochToDate(currentEpoch, targetEpoch);
  }, [currentEpoch, lastExecutedEpoch, intervalInEpochs]);

  const isRipe = useMemo(() => {
    if (!nextExecutionDate) return false;
    return nextExecutionDate.getTime() <= now;
  }, [nextExecutionDate, now]);

  const countdownSeconds = useMemo(() => {
    if (!nextExecutionDate) return 0;
    return Math.max(0, Math.floor((nextExecutionDate.getTime() - now) / 1000));
  }, [nextExecutionDate, now]);

  const estimatedEndDate = useMemo(() => {
    if (!currentEpoch || !intervalInEpochs || executionsRemaining === 0n || lastExecutedEpoch === undefined) {
      return null;
    }
    // Final swap will land at lastExecutedEpoch + intervalInEpochs * executionsRemaining
    const finalEpoch = lastExecutedEpoch + intervalInEpochs * executionsRemaining;
    return epochToDate(currentEpoch, finalEpoch);
  }, [currentEpoch, lastExecutedEpoch, intervalInEpochs, executionsRemaining]);

  const handleWithdraw = async () => {
    if (withdrawBusy) return;
    setWithdrawBusy(true);
    try {
      await writeAndOpen(() =>
        writeDca({
          functionName: "withdrawCLAWD",
          args: [positionId],
        }),
      );
      notification.success(`Withdrew CLAWD from position #${positionId}`);
      refetch();
    } catch (e) {
      // Error toast already fired by SE2 simulate-and-notify path.
      console.error(e);
    } finally {
      setWithdrawBusy(false);
    }
  };

  const handleClose = async () => {
    if (closeBusy) return;
    if (!confirm(`Close position #${positionId}? Remaining USDC and CLAWD will be returned to you.`)) {
      return;
    }
    setCloseBusy(true);
    try {
      await writeAndOpen(() =>
        writeDca({
          functionName: "closePosition",
          args: [positionId],
        }),
      );
      notification.success(`Closed position #${positionId}`);
      refetch();
    } catch (e) {
      console.error(e);
    } finally {
      setCloseBusy(false);
    }
  };

  const handleTopUp = async () => {
    if (topUpBusy) return;
    if (!topUpAmount || Number(topUpAmount) <= 0) {
      notification.error("Enter a USDC amount > 0");
      return;
    }
    setTopUpBusy(true);
    try {
      const amt = parseUnits(topUpAmount, USDC_DECIMALS);
      await writeAndOpen(() =>
        writeDca({
          functionName: "topUpPosition",
          args: [positionId, amt],
        }),
      );
      notification.success(`Topped up position #${positionId}`);
      setTopUpAmount("");
      setTopUpOpen(false);
      refetch();
    } catch (e) {
      console.error(e);
    } finally {
      setTopUpBusy(false);
    }
  };

  const handleSlippage = async () => {
    if (slippageBusy) return;
    const pct = Number(slippageInput);
    if (Number.isNaN(pct) || pct <= 0 || pct > 10) {
      notification.error("Slippage must be > 0 and <= 10%");
      return;
    }
    const bps = BigInt(Math.round(pct * 100));
    if (bps > MAX_SLIPPAGE_BPS) {
      notification.error("Slippage too high");
      return;
    }
    setSlippageBusy(true);
    try {
      await writeAndOpen(() =>
        writeDca({
          functionName: "setSlippageTolerance",
          args: [positionId, bps],
        }),
      );
      notification.success(`Slippage updated for position #${positionId}`);
      setSlippageInput("");
      refetch();
    } catch (e) {
      console.error(e);
    } finally {
      setSlippageBusy(false);
    }
  };

  if (!tuple) {
    return (
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <span className="loading loading-spinner loading-sm" /> Loading position #{positionId.toString()}…
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h3 className="card-title text-lg my-0">Position #{positionId.toString()}</h3>
            <span className={`badge badge-sm ${active ? "badge-success" : "badge-ghost"}`}>
              {active ? "Active" : "Inactive"}
            </span>
            {isRipe && active && <span className="badge badge-sm badge-warning">Ripe</span>}
          </div>
          {!isOwner && owner && (
            <div className="text-xs opacity-70 flex items-center gap-1">
              owner:
              <AddressComp address={owner} format="short" size="xs" chain={base} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="opacity-70 text-xs">USDC remaining</div>
            <div className="font-semibold">${formatUsdc(usdcBalance)}</div>
          </div>
          <div>
            <div className="opacity-70 text-xs">CLAWD accrued</div>
            <div className="font-semibold">{formatClawd(clawdAccrued)}</div>
          </div>
          <div>
            <div className="opacity-70 text-xs">Amount per swap</div>
            <div className="font-semibold">${formatUsdc(amountPerSwap)}</div>
          </div>
          <div>
            <div className="opacity-70 text-xs">Cadence</div>
            <div className="font-semibold">{intervalLabel(intervalInEpochs ?? 0n)}</div>
          </div>
          <div>
            <div className="opacity-70 text-xs">Next execution</div>
            <div className="font-semibold">{active ? formatCountdown(countdownSeconds) : "—"}</div>
          </div>
          <div>
            <div className="opacity-70 text-xs">Executions left</div>
            <div className="font-semibold">{executionsRemaining.toString()}</div>
          </div>
          <div>
            <div className="opacity-70 text-xs">Estimated end</div>
            <div className="font-semibold">{estimatedEndDate ? estimatedEndDate.toLocaleDateString() : "—"}</div>
          </div>
          <div>
            <div className="opacity-70 text-xs">Slippage</div>
            <div className="font-semibold">{formatBps(slippageBps)}</div>
          </div>
        </div>

        {isOwner && active && (
          <div className="flex flex-wrap gap-2 mt-2">
            {clawdAccrued !== undefined && clawdAccrued > 0n && (
              <button className="btn btn-sm btn-primary" disabled={withdrawBusy} onClick={handleWithdraw}>
                {withdrawBusy ? <span className="loading loading-spinner loading-xs" /> : null}
                Withdraw CLAWD
              </button>
            )}
            <button className="btn btn-sm" disabled={topUpBusy} onClick={() => setTopUpOpen(prev => !prev)}>
              Top Up USDC
            </button>
            <button className="btn btn-sm btn-error btn-outline" disabled={closeBusy} onClick={handleClose}>
              {closeBusy ? <span className="loading loading-spinner loading-xs" /> : null}
              Close Position
            </button>
          </div>
        )}

        {isOwner && active && topUpOpen && (
          <div className="bg-base-200 rounded-lg p-3 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs opacity-70">USDC amount to top up</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={topUpAmount}
                onChange={e => setTopUpAmount(e.target.value)}
                placeholder="100.00"
                className="input input-bordered input-sm w-full"
              />
            </div>
            <button className="btn btn-sm btn-primary" disabled={topUpBusy} onClick={handleTopUp}>
              {topUpBusy ? <span className="loading loading-spinner loading-xs" /> : null}
              Top Up
            </button>
            <button className="btn btn-sm btn-ghost" disabled={topUpBusy} onClick={() => setTopUpOpen(false)}>
              Cancel
            </button>
            <p className="text-xs opacity-60 w-full">
              You must approve USDC to the DCA contract first if you haven&apos;t already (the call will revert
              otherwise).
            </p>
          </div>
        )}

        {isOwner && active && (
          <div className="bg-base-200 rounded-lg p-3 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs opacity-70">Adjust slippage (max 10%)</label>
              <input
                type="number"
                min="0.01"
                max="10"
                step="0.01"
                value={slippageInput}
                onChange={e => setSlippageInput(e.target.value)}
                placeholder={`current: ${formatBps(slippageBps)}`}
                className="input input-bordered input-sm w-full"
              />
            </div>
            <button className="btn btn-sm" disabled={slippageBusy} onClick={handleSlippage}>
              {slippageBusy ? <span className="loading loading-spinner loading-xs" /> : null}
              Save Slippage
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
