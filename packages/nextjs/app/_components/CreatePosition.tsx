"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { NextPage } from "next";
import { decodeEventLog, parseUnits } from "viem";
import { base } from "viem/chains";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { WalletStrip } from "~~/components/dca/WalletStrip";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useWriteAndOpen } from "~~/hooks/scaffold-eth/useWriteAndOpen";
import {
  CLAWDDCA_ADDRESS,
  DEFAULT_SLIPPAGE_BPS,
  EPOCH_DURATION_SECONDS,
  INTERVAL_PRESETS,
  MAX_SLIPPAGE_BPS,
  USDC_ADDRESS,
  USDC_DECIMALS,
  formatBps,
  formatUsdc,
  intervalLabel,
} from "~~/utils/dca";
import { notification } from "~~/utils/scaffold-eth";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";

const usdcAbi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const dcaAbiForEvent = [
  {
    type: "event",
    name: "PositionCreated",
    inputs: [
      { name: "positionId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "amountPerSwap", type: "uint256", indexed: false },
      { name: "intervalInEpochs", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

const CreatePage: NextPage = () => {
  const router = useRouter();
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeAndOpen } = useWriteAndOpen();
  const wrongNetwork = isConnected && chainId !== base.id;
  const publicClient = usePublicClient({ chainId: base.id });

  const [presetKey, setPresetKey] = useState<(typeof INTERVAL_PRESETS)[number]["key"]>("daily");
  const [totalUsdc, setTotalUsdc] = useState("");
  const [amountPerSwap, setAmountPerSwap] = useState("");
  const [customInterval, setCustomInterval] = useState("8");
  const [slippagePct, setSlippagePct] = useState(String(Number(DEFAULT_SLIPPAGE_BPS) / 100));

  const preset = INTERVAL_PRESETS.find(p => p.key === presetKey)!;
  const intervalEpochs = useMemo(() => {
    if (preset.key === "custom") {
      const n = Number(customInterval);
      if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) return BigInt(n);
      return 0n;
    }
    return BigInt(preset.intervalInEpochs);
  }, [preset, customInterval]);

  // ---------------- balances + allowance ----------------
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: "balanceOf",
    chainId: base.id,
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: "allowance",
    chainId: base.id,
    args: address ? [address, CLAWDDCA_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  // ---------------- parse inputs ----------------
  const totalUsdcRaw = useMemo(() => {
    if (!totalUsdc || Number(totalUsdc) <= 0) return 0n;
    try {
      return parseUnits(totalUsdc, USDC_DECIMALS);
    } catch {
      return 0n;
    }
  }, [totalUsdc]);

  const amountPerSwapRaw = useMemo(() => {
    if (!amountPerSwap || Number(amountPerSwap) <= 0) return 0n;
    try {
      return parseUnits(amountPerSwap, USDC_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amountPerSwap]);

  const numExecutions = useMemo(() => {
    if (totalUsdcRaw === 0n || amountPerSwapRaw === 0n) return 0n;
    return totalUsdcRaw / amountPerSwapRaw;
  }, [totalUsdcRaw, amountPerSwapRaw]);

  const estimatedEnd = useMemo(() => {
    if (numExecutions === 0n || intervalEpochs === 0n) return null;
    const seconds = Number(numExecutions * intervalEpochs) * EPOCH_DURATION_SECONDS;
    return new Date(Date.now() + seconds * 1000);
  }, [numExecutions, intervalEpochs]);

  const slippageBps = useMemo(() => {
    const pct = Number(slippagePct);
    if (Number.isNaN(pct) || pct <= 0) return 0n;
    return BigInt(Math.round(pct * 100));
  }, [slippagePct]);

  const slippageChanged = slippageBps !== DEFAULT_SLIPPAGE_BPS && slippageBps > 0n && slippageBps <= MAX_SLIPPAGE_BPS;

  const insufficientBalance = totalUsdcRaw > 0n && usdcBalance !== undefined && totalUsdcRaw > (usdcBalance as bigint);
  const needsApproval = totalUsdcRaw > 0n && usdcAllowance !== undefined && totalUsdcRaw > (usdcAllowance as bigint);

  // ---------------- approve ----------------
  const {
    writeContractAsync: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
    reset: resetApprove,
  } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // Cooldown / waiting flags — keep the Approve button disabled from click → confirm
  // → cooldown → cached allowance reflects the new approval. Without these the
  // button is briefly clickable in the window between the receipt landing and
  // wagmi's cached allowance value updating, which permits a duplicate approve tx.
  const [approveCooldown, setApproveCooldown] = useState(false);
  const [waitingForAllowance, setWaitingForAllowance] = useState(false);

  const handleApprove = async () => {
    try {
      await writeAndOpen(() =>
        writeApprove({
          address: USDC_ADDRESS,
          abi: usdcAbi,
          functionName: "approve",
          args: [CLAWDDCA_ADDRESS, totalUsdcRaw],
          chainId: base.id,
        }),
      );
    } catch (e) {
      const msg = getParsedErrorWithAllAbis(e, base.id);
      notification.error(msg);
    }
  };

  // Once the approve tx confirms, poll the allowance until the cached value
  // catches up (or we hit a max-attempts ceiling), THEN drop the cooldown flags
  // and reset the write hook. This must live in useEffect — calling
  // refetchAllowance / setState during render is a React anti-pattern (it can
  // trigger "Cannot update a component while rendering a different component"
  // warnings and tight re-render loops).
  useEffect(() => {
    if (!approveConfirmed || !approveTxHash) return;
    setApproveCooldown(true);
    setWaitingForAllowance(true);
    let attempts = 0;
    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      attempts++;
      const result = await refetchAllowance();
      const fresh = (result?.data as bigint | undefined) ?? (usdcAllowance as bigint | undefined) ?? 0n;
      if (fresh >= totalUsdcRaw || attempts > 20) {
        clearInterval(interval);
        if (!cancelled) {
          setWaitingForAllowance(false);
          setApproveCooldown(false);
          resetApprove();
        }
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // We intentionally depend only on the confirmation signal — re-running this
    // effect on every allowance/totalUsdcRaw change would restart the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveConfirmed, approveTxHash]);

  // ---------------- create position ----------------
  const { writeContractAsync: writeDca, isPending: isCreating } = useScaffoldWriteContract({
    contractName: "CLAWDdca",
  });
  const [postCreateBusy, setPostCreateBusy] = useState(false);

  const handleCreate = async () => {
    if (totalUsdcRaw === 0n || amountPerSwapRaw === 0n || intervalEpochs === 0n) {
      notification.error("Fill in total USDC, amount per swap, and interval.");
      return;
    }
    if (amountPerSwapRaw > totalUsdcRaw) {
      notification.error("Amount per swap must be ≤ total USDC.");
      return;
    }
    setPostCreateBusy(true);
    let createdId: bigint | undefined;
    try {
      const txHash = await writeAndOpen(() =>
        writeDca({
          functionName: "createPosition",
          args: [totalUsdcRaw, amountPerSwapRaw, intervalEpochs],
        }),
      );
      // SE2's writeContractAsync returns the tx hash; wait for receipt to mine the
      // PositionCreated event so we can pick out the position ID.
      if (typeof txHash === "string" && publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== CLAWDDCA_ADDRESS.toLowerCase()) continue;
          try {
            const decoded = decodeEventLog({
              abi: dcaAbiForEvent,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "PositionCreated") {
              createdId = (decoded.args as any).positionId as bigint;
              break;
            }
          } catch {
            // not the event we want
          }
        }
      }

      // Apply non-default slippage AFTER creation if user changed it.
      if (slippageChanged && createdId !== undefined) {
        try {
          await writeAndOpen(() =>
            writeDca({
              functionName: "setSlippageTolerance",
              args: [createdId!, slippageBps],
            }),
          );
        } catch (e) {
          // Non-fatal — position is created either way; just warn.
          console.error("setSlippageTolerance failed", e);
          notification.error("Position created but slippage update failed — adjust on the Dashboard.");
        }
      }

      notification.success(
        createdId !== undefined ? `Position #${createdId.toString()} created!` : "Position created!",
      );
      router.push("/");
    } catch (e) {
      const msg = getParsedErrorWithAllAbis(e, base.id);
      notification.error(msg);
    } finally {
      setPostCreateBusy(false);
    }
  };

  // ---------------- render ----------------
  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-10 sm:py-14 flex flex-col gap-6">
      <header className="flex flex-col gap-1.5 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight my-0">Create a DCA Position</h1>
        <p className="opacity-70 my-0 text-base">Pick a strategy, deposit USDC, and let keepers stack CLAWD for you.</p>
      </header>

      <WalletStrip />

      <div className="swap-card flex flex-col gap-3">
        {/* "From" token panel — USDC in */}
        <div className="token-panel">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs opacity-60 uppercase tracking-wide">You deposit</span>
            <span className="text-xs opacity-60 tabular">Wallet: ${formatUsdc(usdcBalance as bigint | undefined)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={totalUsdc}
              onChange={e => setTotalUsdc(e.target.value)}
              placeholder="0.00"
              className="tabular"
            />
            <div className="token-chip">
              <span className="inline-block w-6 h-6 rounded-full bg-[color:var(--ink-blue-10)] text-[color:var(--ink-blue-70)] text-[10px] font-bold flex items-center justify-center ring-1 ring-[color:var(--ink-blue-30)]">
                $
              </span>
              <span>USDC</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {[25, 100, 500].map(v => (
              <button
                type="button"
                key={v}
                onClick={() => setTotalUsdc(String(v))}
                className="text-xs px-2 py-1 rounded-full border border-[color:var(--ink-gray-40)] hover:bg-[color:var(--ink-blue-10)] transition-colors"
              >
                ${v}
              </button>
            ))}
            {usdcBalance !== undefined && (usdcBalance as bigint) > 0n && (
              <button
                type="button"
                onClick={() => setTotalUsdc(formatUsdc(usdcBalance as bigint).replace(/,/g, ""))}
                className="text-xs px-2 py-1 rounded-full border border-[color:var(--ink-gray-40)] hover:bg-[color:var(--ink-blue-10)] transition-colors"
              >
                Max
              </button>
            )}
          </div>
        </div>

        {/* "Down arrow" between tokens — Uniswap-style midpoint */}
        <div className="flex items-center justify-center -my-4 z-10">
          <div className="w-10 h-10 rounded-full bg-base-100 border border-[color:var(--ink-gray-40)] flex items-center justify-center shadow-sm text-[color:var(--ink-blue-70)]">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* "To" token panel — CLAWD out (chunked per swap) */}
        <div className="token-panel">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs opacity-60 uppercase tracking-wide">Each swap buys CLAWD with</span>
            <span className="text-xs opacity-60 tabular">
              ≈ {numExecutions.toString()} swap{numExecutions === 1n ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amountPerSwap}
              onChange={e => setAmountPerSwap(e.target.value)}
              placeholder="0.00"
              className="tabular"
            />
            <div className="token-chip">
              <span className="relative inline-block w-6 h-6 rounded-full overflow-hidden ring-1 ring-[color:var(--ink-orange-60)] bg-white">
                <Image src="/clawd-original.jpg" alt="CLAWD" fill sizes="24px" className="object-cover" />
              </span>
              <span>USDC → CLAWD</span>
            </div>
          </div>
        </div>

        {/* Strategy selector — pill chips */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Cadence</span>
            <span className="text-xs opacity-60">{intervalLabel(intervalEpochs)}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {INTERVAL_PRESETS.map(p => {
              const active = presetKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPresetKey(p.key)}
                  className={`rounded-2xl px-3 py-2.5 text-left transition-all border ${
                    active
                      ? "bg-[color:var(--ink-blue-10)] border-[color:var(--ink-blue-70)] text-[color:var(--ink-blue-100)] shadow-sm"
                      : "bg-base-100 border-[color:var(--ink-gray-40)] hover:border-[color:var(--ink-gray-60)]"
                  }`}
                >
                  <div className="text-sm font-semibold leading-tight">{p.label}</div>
                  <div className="text-[11px] opacity-70 leading-snug mt-0.5">{p.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom interval (only if "custom" preset chosen) */}
        {presetKey === "custom" && (
          <div className="mt-1">
            <label className="text-xs opacity-70 uppercase tracking-wide">Interval (epochs)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={customInterval}
              onChange={e => setCustomInterval(e.target.value)}
              className="input input-bordered w-full mt-1"
            />
            <div className="text-xs opacity-60 mt-1">1 epoch = 3 hours. {intervalLabel(intervalEpochs)}.</div>
          </div>
        )}

        {/* Advanced — slippage */}
        <details className="mt-1 rounded-2xl border border-[color:var(--ink-gray-40)] bg-base-100">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold flex items-center justify-between">
            <span>Advanced settings</span>
            <span className="text-xs opacity-60 tabular">Slippage {slippagePct}%</span>
          </summary>
          <div className="px-4 pb-4">
            <label className="text-xs opacity-70 uppercase tracking-wide">Slippage tolerance (%)</label>
            <input
              type="number"
              min="0.01"
              max="10"
              step="0.01"
              value={slippagePct}
              onChange={e => setSlippagePct(e.target.value)}
              className="input input-bordered w-full mt-1"
            />
            <div className="text-xs opacity-60 mt-1.5">
              Default {formatBps(DEFAULT_SLIPPAGE_BPS)}, max {formatBps(MAX_SLIPPAGE_BPS)}.
              {slippageChanged && " (will be applied after creation)"}
            </div>
          </div>
        </details>

        {/* Summary */}
        <div className="rounded-2xl border border-[color:var(--ink-gray-40)] bg-[color:var(--ink-brown-10)] p-4 text-sm space-y-1.5 tabular">
          <div className="flex justify-between">
            <span className="opacity-60">Executions</span>
            <span className="font-semibold">{numExecutions.toString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">Cadence</span>
            <span className="font-semibold">{intervalLabel(intervalEpochs)}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">Runs until</span>
            <span className="font-semibold">{estimatedEnd ? estimatedEnd.toLocaleString() : "—"}</span>
          </div>
          <p className="text-xs opacity-60 pt-2 my-0 leading-relaxed font-normal">
            Per-swap CLAWD output is determined live by the Uniswap V3 pool — first execution will reveal actual amounts
            on Basescan.
          </p>
        </div>

        {/* CTA */}
        {!isConnected && (
          <button className="btn btn-primary btn-lg w-full mt-1" disabled>
            Connect wallet to create
          </button>
        )}

        {isConnected && wrongNetwork && (
          <button
            className="btn btn-warning btn-lg w-full mt-1"
            disabled={isSwitching}
            onClick={() => switchChain({ chainId: base.id })}
          >
            {isSwitching ? <span className="loading loading-spinner loading-xs" /> : null}
            Switch to Base
          </button>
        )}

        {isConnected && !wrongNetwork && (
          <div className="flex flex-col gap-2 mt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                className="btn btn-lg"
                disabled={
                  !needsApproval ||
                  insufficientBalance ||
                  isApproving ||
                  approveConfirming ||
                  approveCooldown ||
                  waitingForAllowance ||
                  totalUsdcRaw === 0n
                }
                onClick={handleApprove}
              >
                {(isApproving || approveConfirming || approveCooldown || waitingForAllowance) && (
                  <span className="loading loading-spinner loading-xs" />
                )}
                {needsApproval ? "1. Approve USDC" : "1. USDC Approved ✓"}
              </button>
              <button
                className="btn btn-primary btn-lg"
                disabled={
                  needsApproval ||
                  insufficientBalance ||
                  isCreating ||
                  postCreateBusy ||
                  totalUsdcRaw === 0n ||
                  amountPerSwapRaw === 0n ||
                  intervalEpochs === 0n
                }
                onClick={handleCreate}
              >
                {(isCreating || postCreateBusy) && <span className="loading loading-spinner loading-xs" />}
                2. Create Position
              </button>
            </div>
            {insufficientBalance && <p className="text-error text-xs my-0">Not enough USDC in your wallet.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatePage;
