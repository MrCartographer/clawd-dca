"use client";

import { useEffect, useMemo, useState } from "react";
import { Address as AddressComp } from "@scaffold-ui/components";
import { base } from "viem/chains";
import { useAccount, useReadContract } from "wagmi";
import { useScaffoldEventHistory, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useWriteAndOpen } from "~~/hooks/scaffold-eth/useWriteAndOpen";
import {
  CLAWDDCA_ADDRESS,
  DEPLOYED_ON_BLOCK,
  epochToDate,
  formatBps,
  formatCountdown,
  formatToken,
  formatUsdc,
  intervalLabel,
  shortAddress,
} from "~~/utils/dca";
import { notification } from "~~/utils/scaffold-eth";

// v3 position tuple: 10 fields (vs v2's 8). Order matches the ABI signature.
type PositionTuple = readonly [
  `0x${string}`, // owner
  `0x${string}`, // targetToken
  `0x${string}`, // swapPath (bytes)
  bigint, // usdcBalance
  bigint, // tokenAccrued
  bigint, // amountPerSwap
  bigint, // intervalInEpochs
  bigint, // lastExecutedEpoch
  bigint, // slippageBps
  boolean, // active
];

const erc20MetaAbi = [
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
] as const;

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
  const { address: connectedAddress, chain } = useAccount();
  const wrongNetwork = chain !== undefined && chain.id !== base.id;
  const currentEpoch = useCurrentEpoch();
  const now = useNow(1000);

  const { data: position, refetch } = useScaffoldReadContract({
    contractName: "CLAWDdca",
    functionName: "positions",
    args: [positionId],
    watch: true,
  });

  const { data: executedEvents } = useScaffoldEventHistory({
    contractName: "CLAWDdca",
    eventName: "PositionExecuted",
    fromBlock: DEPLOYED_ON_BLOCK,
    watch: true,
    blocksBatchSize: 50_000,
  });

  const { writeContractAsync: writeDca } = useScaffoldWriteContract({
    contractName: "CLAWDdca",
  });
  const { writeAndOpen } = useWriteAndOpen();

  const [closeBusy, setCloseBusy] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  const tuple = position as PositionTuple | undefined;
  const owner = tuple?.[0];
  const targetToken = tuple?.[1];
  // tuple?.[2] is the swapPath bytes — useful for advanced display only
  const usdcBalance = tuple?.[3];
  const tokenAccrued = tuple?.[4];
  const amountPerSwap = tuple?.[5];
  const intervalInEpochs = tuple?.[6];
  const lastExecutedEpoch = tuple?.[7];
  const slippageBps = tuple?.[8];
  const active = tuple?.[9];

  // Resolve target token symbol + decimals
  const tokenAddrValid = !!targetToken && targetToken !== "0x0000000000000000000000000000000000000000";
  const { data: tokenSymbol } = useReadContract({
    address: tokenAddrValid ? targetToken : undefined,
    abi: erc20MetaAbi,
    functionName: "symbol",
    chainId: base.id,
    query: { enabled: tokenAddrValid },
  });
  const { data: tokenDecimals } = useReadContract({
    address: tokenAddrValid ? targetToken : undefined,
    abi: erc20MetaAbi,
    functionName: "decimals",
    chainId: base.id,
    query: { enabled: tokenAddrValid },
  });
  const decimalsNum = typeof tokenDecimals === "number" ? tokenDecimals : 18;
  const symbol = (tokenSymbol as string | undefined) ?? "TOKEN";

  const isOwner = owner && connectedAddress && owner.toLowerCase() === connectedAddress.toLowerCase();
  const hasToken = tokenAccrued !== undefined && tokenAccrued > 0n;
  const fullySettled = active === false && (tokenAccrued ?? 0n) === 0n;

  const executionsRemaining = useMemo(() => {
    if (!usdcBalance || !amountPerSwap || amountPerSwap === 0n) return 0n;
    return usdcBalance / amountPerSwap;
  }, [usdcBalance, amountPerSwap]);

  // total USDC swapped through THIS position so far (from PositionExecuted history)
  const totalUsdcSpent = useMemo(() => {
    if (!executedEvents) return 0n;
    let sum = 0n;
    for (const ev of executedEvents) {
      const args = (ev as any).args as { positionId?: bigint; amountSwapped?: bigint } | undefined;
      if (!args) continue;
      if (args.positionId !== positionId) continue;
      if (typeof args.amountSwapped === "bigint") sum += args.amountSwapped;
    }
    return sum;
  }, [executedEvents, positionId]);

  const executionsCompleted = useMemo(() => {
    if (!amountPerSwap || amountPerSwap === 0n) return 0n;
    return totalUsdcSpent / amountPerSwap;
  }, [totalUsdcSpent, amountPerSwap]);

  const totalCommitted = useMemo(() => {
    if (!usdcBalance) return totalUsdcSpent;
    return (usdcBalance as bigint) + totalUsdcSpent;
  }, [usdcBalance, totalUsdcSpent]);

  const progressPct = useMemo(() => {
    if (totalCommitted === 0n) return 0;
    const bp = (totalUsdcSpent * 10000n) / totalCommitted;
    const pct = Number(bp) / 100;
    if (Number.isNaN(pct)) return 0;
    return Math.min(100, Math.max(0, pct));
  }, [totalUsdcSpent, totalCommitted]);

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

  const handleWithdraw = async () => {
    if (withdrawBusy) return;
    setWithdrawBusy(true);
    try {
      await refetch();
      await writeAndOpen(() =>
        writeDca({
          functionName: "withdrawToken",
          args: [positionId],
        }),
      );
      notification.success(`Withdrew ${symbol} from position #${positionId}`);
      refetch();
    } catch (e) {
      console.error(e);
    } finally {
      setWithdrawBusy(false);
    }
  };

  const handleClose = async () => {
    if (closeBusy) return;
    if (!confirm(`Close position #${positionId}? Remaining USDC and ${symbol} will be returned to you.`)) {
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

  if (!tuple) {
    return (
      <div className="shimmer h-32 w-full rounded-2xl" aria-label={`Loading position #${positionId.toString()}`} />
    );
  }

  const statusChip = (() => {
    if (fullySettled) return <span className="chip chip-muted">Settled</span>;
    if (!active) return <span className="chip chip-muted">Inactive</span>;
    if (isRipe)
      return (
        <span className="chip chip-orange">
          <span className="dot dot-pulse" /> Ripe
        </span>
      );
    return (
      <span className="chip chip-good">
        <span className="dot" /> Active
      </span>
    );
  })();

  return (
    <div className="surface-elev p-5 sm:p-6 flex flex-col gap-5">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h3 className="text-lg font-semibold tracking-tight">Position #{positionId.toString()}</h3>
          {statusChip}
          <span className="chip">→ {symbol}</span>
        </div>
        {!isOwner && owner && (
          <div className="text-xs text-[color:var(--text-2)] flex items-center gap-1.5">
            <span>owner</span>
            <AddressComp address={owner} format="short" size="xs" chain={base} />
          </div>
        )}
      </div>

      {/* metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 tabular">
        <Metric label="USDC remaining" value={`$${formatUsdc(usdcBalance)}`} />
        <Metric label={`${symbol} accrued`} value={formatToken(tokenAccrued, decimalsNum)} accent={hasToken} />
        <Metric label="Per swap" value={`$${formatUsdc(amountPerSwap)}`} />
        <Metric label="Cadence" value={intervalLabel(intervalInEpochs ?? 0n)} />
        <Metric label="Next execution" value={active ? formatCountdown(countdownSeconds) : "—"} />
        <Metric label="Executions left" value={executionsRemaining.toString()} />
        <Metric label="Slippage" value={formatBps(slippageBps)} />
        <Metric
          label="Completed"
          value={`${executionsCompleted.toString()} swap${executionsCompleted === 1n ? "" : "s"}`}
        />
      </div>

      {/* target token address line */}
      <div className="text-[11px] text-[color:var(--text-3)] flex items-center gap-2 -mt-2">
        <span>Target</span>
        <a href={`https://basescan.org/token/${targetToken}`} target="_blank" rel="noreferrer" className="link tabular">
          {shortAddress(targetToken)}
        </a>
      </div>

      {/* progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-[color:var(--text-2)]">
          <span>Lifetime progress</span>
          <span className="tabular font-medium text-[color:var(--text-1)]">{progressPct.toFixed(1)}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* actions */}
      {isOwner && !fullySettled && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            className="btn btn-sm btn-primary"
            disabled={withdrawBusy || wrongNetwork || !hasToken}
            onClick={handleWithdraw}
            title={hasToken ? "" : `No ${symbol} accrued to withdraw`}
          >
            {withdrawBusy ? <span className="loading loading-spinner loading-xs" /> : null}
            {hasToken ? `Withdraw ${formatToken(tokenAccrued, decimalsNum)} ${symbol}` : "Nothing to withdraw"}
          </button>
          {active && (
            <button
              className="btn btn-sm btn-ghost text-[color:var(--bad)]"
              disabled={closeBusy || wrongNetwork}
              onClick={handleClose}
            >
              {closeBusy ? <span className="loading loading-spinner loading-xs" /> : null}
              Close
            </button>
          )}
          {!active && hasToken && (
            <a
              href={`https://basescan.org/address/${CLAWDDCA_ADDRESS}#writeContract`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-ghost text-xs"
              title="If the in-app withdraw fails for any reason, call withdrawToken directly on Basescan."
            >
              ↗ Withdraw on Basescan
            </a>
          )}
        </div>
      )}

      {isOwner && fullySettled && (
        <div className="text-xs text-[color:var(--text-2)] border-t border-[color:var(--line-soft)] pt-3">
          This position is fully wound down — no USDC balance, no accrued {symbol}.
        </div>
      )}
    </div>
  );
};

const Metric = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-2)] font-medium">{label}</span>
    <span
      className={`text-[15px] font-semibold tabular ${
        accent ? "text-[color:var(--clawd)]" : "text-[color:var(--text-0)]"
      }`}
    >
      {value}
    </span>
  </div>
);
