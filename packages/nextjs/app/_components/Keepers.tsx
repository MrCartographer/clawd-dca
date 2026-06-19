"use client";

import { useEffect, useMemo, useState } from "react";
import { Address as AddressComp } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { WalletStrip } from "~~/components/dca/WalletStrip";
import { useScaffoldEventHistory, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useWriteAndOpen } from "~~/hooks/scaffold-eth/useWriteAndOpen";
import {
  BPS_DENOMINATOR,
  CLAWDDCA_ADDRESS,
  DEPLOYED_ON_BLOCK,
  KEEPER_FEE_BPS,
  formatUsdc,
  intervalLabel,
} from "~~/utils/dca";
import { notification } from "~~/utils/scaffold-eth";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";

type RipePosition = {
  positionId: bigint;
  owner: `0x${string}`;
  targetToken: `0x${string}`;
  amountPerSwap: bigint;
  intervalInEpochs: bigint;
  lastExecutedEpoch: bigint;
  active: boolean;
};

const KeepersPage: NextPage = () => {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== base.id;
  const publicClient = usePublicClient({ chainId: base.id });
  const { writeAndOpen } = useWriteAndOpen();

  const { writeContractAsync: writeDca } = useScaffoldWriteContract({
    contractName: "CLAWDdca",
  });

  // Get all PositionCreated events ever emitted to enumerate every position.
  // For an L2 with 2s blocks this is a lot of getLogs hits; we anchor at the
  // deploy block to keep it bounded.
  const { data: createdEvents, isLoading: eventsLoading } = useScaffoldEventHistory({
    contractName: "CLAWDdca",
    eventName: "PositionCreated",
    fromBlock: DEPLOYED_ON_BLOCK,
    watch: true,
    blocksBatchSize: 50_000,
  });

  const allIds = useMemo<bigint[]>(() => {
    if (!createdEvents) return [];
    const ids = new Set<string>();
    for (const log of createdEvents) {
      const id = (log as any).args?.positionId as bigint | undefined;
      if (id !== undefined) ids.add(id.toString());
    }
    return Array.from(ids).map(s => BigInt(s));
  }, [createdEvents]);

  const { data: currentEpoch } = useScaffoldReadContract({
    contractName: "CLAWDdca",
    functionName: "currentEpoch",
    watch: true,
  });

  const { data: burnFeeBalance } = useScaffoldReadContract({
    contractName: "CLAWDdca",
    functionName: "burnFeeBalance",
    watch: true,
  });

  const [positionRows, setPositionRows] = useState<RipePosition[]>([]);
  const [posLoading, setPosLoading] = useState(false);

  useEffect(() => {
    if (!publicClient || allIds.length === 0) {
      setPositionRows([]);
      return;
    }
    let cancelled = false;
    setPosLoading(true);
    (async () => {
      // v3 position tuple: address owner, address targetToken, bytes swapPath,
      //   uint256 usdcBalance, uint256 tokenAccrued, uint256 amountPerSwap,
      //   uint256 intervalInEpochs, uint256 lastExecutedEpoch, uint256 slippageBps,
      //   bool active
      const dcaAbi = [
        {
          type: "function",
          name: "positions",
          inputs: [{ type: "uint256" }],
          outputs: [
            { type: "address" },
            { type: "address" },
            { type: "bytes" },
            { type: "uint256" },
            { type: "uint256" },
            { type: "uint256" },
            { type: "uint256" },
            { type: "uint256" },
            { type: "uint256" },
            { type: "bool" },
          ],
          stateMutability: "view",
        },
      ] as const;

      try {
        const results = await Promise.all(
          allIds.map(id =>
            publicClient.readContract({
              address: CLAWDDCA_ADDRESS,
              abi: dcaAbi,
              functionName: "positions",
              args: [id],
            }),
          ),
        );
        if (cancelled) return;
        const rows: RipePosition[] = results
          .map((r: any, i): RipePosition | null => {
            const [owner, targetToken, , , , amountPerSwap, intervalInEpochs, lastExecutedEpoch, , active] =
              r as readonly [
                `0x${string}`,
                `0x${string}`,
                `0x${string}`,
                bigint,
                bigint,
                bigint,
                bigint,
                bigint,
                bigint,
                boolean,
              ];
            if (!active) return null;
            return {
              positionId: allIds[i],
              owner,
              targetToken,
              amountPerSwap,
              intervalInEpochs,
              lastExecutedEpoch,
              active,
            };
          })
          .filter((x): x is RipePosition => x !== null);
        setPositionRows(rows);
      } catch (e) {
        console.error("Failed to fetch positions for keepers view", e);
      } finally {
        if (!cancelled) setPosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, allIds]);

  const ripeCandidates = useMemo(() => {
    if (currentEpoch === undefined) return [];
    return positionRows.filter(p => (currentEpoch as bigint) >= p.lastExecutedEpoch + p.intervalInEpochs);
  }, [positionRows, currentEpoch]);

  // Filter out positions whose executeDCA would revert (e.g. created against a dead pool tier).
  // Without this filter, the table shows "ripe" positions that nobody can actually execute, and
  // the per-position Execute button shows "reverted" error toasts on every click — bad UX.
  const [executableIds, setExecutableIds] = useState<Set<string>>(new Set());
  const [executableChecking, setExecutableChecking] = useState(false);

  useEffect(() => {
    if (!publicClient || ripeCandidates.length === 0) {
      setExecutableIds(new Set());
      return;
    }
    let cancelled = false;
    setExecutableChecking(true);
    (async () => {
      const v3ExecuteAbi = [
        {
          type: "function",
          name: "executeDCA",
          stateMutability: "nonpayable",
          inputs: [{ name: "positionId", type: "uint256" }],
          outputs: [{ name: "tokenReceived", type: "uint256" }],
        },
      ] as const;
      const results = await Promise.all(
        ripeCandidates.map(async p => {
          try {
            // simulate as the position owner — any caller works since executeDCA is permissionless
            await publicClient.simulateContract({
              address: CLAWDDCA_ADDRESS,
              abi: v3ExecuteAbi,
              functionName: "executeDCA",
              args: [p.positionId],
              account: p.owner,
            });
            return p.positionId.toString();
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setExecutableIds(new Set(results.filter((x): x is string => x !== null)));
      setExecutableChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, ripeCandidates]);

  // The list shown to keepers — only the actually-executable ripe positions.
  const ripePositions = useMemo(
    () => ripeCandidates.filter(p => executableIds.has(p.positionId.toString())),
    [ripeCandidates, executableIds],
  );

  const blockedCount = ripeCandidates.length - ripePositions.length;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [burnBusy, setBurnBusy] = useState(false);

  const handleExecuteBurn = async () => {
    setBurnBusy(true);
    try {
      await writeAndOpen(() =>
        writeDca({
          functionName: "executeBurn",
        }),
      );
      notification.success("CLAWD burn executed!");
    } catch (e) {
      const msg = getParsedErrorWithAllAbis(e, base.id);
      notification.error(msg);
    } finally {
      setBurnBusy(false);
    }
  };

  const handleExecute = async (positionId: bigint) => {
    setBusyId(positionId.toString());
    try {
      await writeAndOpen(() =>
        writeDca({
          functionName: "executeDCA",
          args: [positionId],
        }),
      );
      notification.success(`Executed position #${positionId.toString()}`);
    } catch (e) {
      const msg = getParsedErrorWithAllAbis(e, base.id);
      notification.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const burnBalanceUsdc = (burnFeeBalance as bigint | undefined) ?? 0n;
  const burnEnabled = burnBalanceUsdc > 0n;

  return (
    <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14 flex flex-col gap-8 mount">
      <header className="flex flex-col gap-3 text-center">
        <span className="chip">Keeper network</span>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.025em]">Permissionless execution</h1>
        <p className="text-[color:var(--text-1)] max-w-2xl mx-auto">
          Anyone can run ripe DCA swaps and earn <span className="text-[color:var(--text-0)] font-medium">10 bps</span>{" "}
          per execution. A separate <span className="text-[color:var(--text-0)] font-medium">10 bps</span> accrues for
          CLAWD burns — trigger them whenever the pot is worth it.
        </p>
      </header>

      <WalletStrip />

      {/* CLAWD BURN HERO */}
      <div className="surface-elev p-6 sm:p-7 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">CLAWD Burn</h2>
              <span className="chip chip-orange">Permissionless</span>
            </div>
            <p className="text-sm text-[color:var(--text-2)] my-0">
              Swap accrued USDC burn fees for CLAWD and send to{" "}
              <a
                href="https://basescan.org/address/0x000000000000000000000000000000000000dEaD"
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                0xdead
              </a>
              .
            </p>
          </div>
          {isConnected && wrongNetwork ? (
            <button
              className="btn btn-warning btn-sm"
              disabled={isSwitching}
              onClick={() => switchChain({ chainId: base.id })}
            >
              Switch to Base
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={!isConnected || !burnEnabled || burnBusy || wrongNetwork}
              onClick={handleExecuteBurn}
            >
              {burnBusy ? <span className="loading loading-spinner loading-xs" /> : null}
              {burnEnabled ? "🔥 Execute burn" : "Nothing to burn yet"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-[color:var(--line-soft)]">
          <Metric label="Accrued burn pot" value={`$${formatUsdc(burnBalanceUsdc)}`} mono />
          <Metric label="Burn rate" value="10 bps / swap" />
          <Metric label="Destination" value="0x…dEaD" mono />
        </div>
      </div>

      {/* RIPE POSITIONS */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Ripe positions</h2>
            <span className="chip">{ripePositions.length} ready</span>
          </div>
          {/* Batch execution intentionally not exposed here: the deployed v3 executeBatch re-enters via an
              external self-call, so msg.sender becomes the contract and the keeper fee is paid to the
              contract instead of the caller. Keepers should execute positions individually below until a
              fixed contract is redeployed. */}
        </div>

        {(eventsLoading || posLoading || executableChecking) && (
          <div className="flex flex-col gap-2">
            <div className="shimmer h-12 w-full rounded-lg" />
            <div className="shimmer h-12 w-full rounded-lg opacity-70" />
          </div>
        )}

        {!eventsLoading && !posLoading && !executableChecking && ripePositions.length === 0 && (
          <div className="surface p-8 text-center text-[color:var(--text-2)]">
            {blockedCount > 0
              ? `No executable positions right now (${blockedCount} ripe but blocked by dead pools).`
              : "No ripe positions — check back in a few minutes."}
          </div>
        )}

        {!executableChecking && blockedCount > 0 && ripePositions.length > 0 && (
          <div className="text-[11px] text-[color:var(--text-3)]">
            {blockedCount} other ripe position{blockedCount === 1 ? "" : "s"} hidden — they revert at execute time
            (likely a dead pool tier).
          </div>
        )}

        {ripePositions.length > 0 && (
          <div className="surface overflow-x-auto">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Owner</th>
                  <th>Target</th>
                  <th>Per swap</th>
                  <th>Cadence</th>
                  <th>Reward</th>
                  <th className="text-right" />
                </tr>
              </thead>
              <tbody>
                {ripePositions.map(p => {
                  const reward = (p.amountPerSwap * KEEPER_FEE_BPS) / BPS_DENOMINATOR;
                  return (
                    <tr key={p.positionId.toString()}>
                      <td className="font-medium">#{p.positionId.toString()}</td>
                      <td>
                        <AddressComp address={p.owner} format="short" size="xs" chain={base} />
                      </td>
                      <td>
                        <a
                          href={`https://basescan.org/token/${p.targetToken}`}
                          target="_blank"
                          rel="noreferrer"
                          className="link tabular text-xs"
                        >
                          {`${p.targetToken.slice(0, 6)}…${p.targetToken.slice(-4)}`}
                        </a>
                      </td>
                      <td>${formatUsdc(p.amountPerSwap)}</td>
                      <td className="text-[color:var(--text-1)]">{intervalLabel(p.intervalInEpochs)}</td>
                      <td className="text-[color:var(--clawd)] font-medium">${formatUsdc(reward)}</td>
                      <td className="text-right">
                        <button
                          className="btn btn-xs btn-primary"
                          disabled={!isConnected || wrongNetwork || busyId === p.positionId.toString()}
                          onClick={() => handleExecute(p.positionId)}
                        >
                          {busyId === p.positionId.toString() ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : null}
                          Execute
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const Metric = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-2)] font-medium">{label}</span>
    <span className={`text-base font-semibold ${mono ? "tabular" : ""} text-[color:var(--text-0)]`}>{value}</span>
  </div>
);

export default KeepersPage;
