"use client";

import { useMemo, useState } from "react";
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

  // Re-read allowance once approve confirms.
  if (approveConfirmed && approveTxHash) {
    refetchAllowance();
    resetApprove();
  }

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
    <div className="max-w-3xl w-full mx-auto px-4 py-8 flex flex-col gap-6">
      <header className="flex flex-col gap-1 text-center">
        <h1 className="text-3xl font-bold my-0">Create a DCA Position</h1>
        <p className="opacity-80 my-0">Pick a strategy, deposit USDC, and let keepers stack CLAWD for you.</p>
      </header>

      <WalletStrip />

      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body gap-4">
          <div>
            <h2 className="text-lg font-bold my-0 mb-2">Strategy</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {INTERVAL_PRESETS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPresetKey(p.key)}
                  className={`btn btn-sm h-auto py-2 flex flex-col items-center text-xs whitespace-normal ${
                    presetKey === p.key ? "btn-primary" : "btn-ghost border border-base-300"
                  }`}
                >
                  <span className="font-bold">{p.label}</span>
                  <span className="opacity-70 normal-case">{p.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm opacity-80">Total USDC to DCA</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={totalUsdc}
                onChange={e => setTotalUsdc(e.target.value)}
                placeholder="500.00"
                className="input input-bordered w-full"
              />
              <div className="text-xs opacity-60 mt-1">
                Wallet balance: ${formatUsdc(usdcBalance as bigint | undefined)}
              </div>
            </div>
            <div>
              <label className="text-sm opacity-80">Amount per swap (USDC)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountPerSwap}
                onChange={e => setAmountPerSwap(e.target.value)}
                placeholder="25.00"
                className="input input-bordered w-full"
              />
            </div>
          </div>

          {presetKey === "custom" && (
            <div>
              <label className="text-sm opacity-80">Interval (in epochs)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={customInterval}
                onChange={e => setCustomInterval(e.target.value)}
                className="input input-bordered w-full"
              />
              <div className="text-xs opacity-60 mt-1">1 epoch = 3 hours. {intervalLabel(intervalEpochs)}.</div>
            </div>
          )}

          <div>
            <label className="text-sm opacity-80">Slippage tolerance (%)</label>
            <input
              type="number"
              min="0.01"
              max="10"
              step="0.01"
              value={slippagePct}
              onChange={e => setSlippagePct(e.target.value)}
              className="input input-bordered w-full"
            />
            <div className="text-xs opacity-60 mt-1">
              Default {formatBps(DEFAULT_SLIPPAGE_BPS)}, max {formatBps(MAX_SLIPPAGE_BPS)}.
              {slippageChanged && " (will be applied after creation)"}
            </div>
          </div>

          <div className="bg-base-200 rounded-lg p-3 text-sm space-y-1">
            <div>
              <span className="opacity-70">≈ Executions:</span>{" "}
              <span className="font-semibold">{numExecutions.toString()}</span>
            </div>
            <div>
              <span className="opacity-70">≈ Cadence:</span>{" "}
              <span className="font-semibold">{intervalLabel(intervalEpochs)}</span>
            </div>
            <div>
              <span className="opacity-70">≈ Runs until:</span>{" "}
              <span className="font-semibold">{estimatedEnd ? estimatedEnd.toLocaleString() : "—"}</span>
            </div>
            <div className="text-xs opacity-60 pt-1">
              Per-swap CLAWD output is determined live by the Uniswap V3 pool — first execution will reveal actual
              amounts on Basescan.
            </div>
          </div>

          {!isConnected && (
            <button className="btn btn-primary" disabled>
              Connect wallet to create
            </button>
          )}

          {isConnected && wrongNetwork && (
            <button
              className="btn btn-warning"
              disabled={isSwitching}
              onClick={() => switchChain({ chainId: base.id })}
            >
              {isSwitching ? <span className="loading loading-spinner loading-xs" /> : null}
              Switch to Base
            </button>
          )}

          {isConnected && !wrongNetwork && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  className="btn btn-secondary"
                  disabled={
                    !needsApproval || insufficientBalance || isApproving || approveConfirming || totalUsdcRaw === 0n
                  }
                  onClick={handleApprove}
                >
                  {(isApproving || approveConfirming) && <span className="loading loading-spinner loading-xs" />}
                  {needsApproval ? "1. Approve USDC" : "1. USDC Approved ✓"}
                </button>
                <button
                  className="btn btn-primary"
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
    </div>
  );
};

export default CreatePage;
