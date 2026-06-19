"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { NextPage } from "next";
import { decodeEventLog, encodePacked, isAddress, parseUnits } from "viem";
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
  COMMON_WETH_TARGET_FEES,
  DEFAULT_SLIPPAGE_BPS,
  DEFAULT_USDC_WETH_FEE,
  EPOCH_DURATION_SECONDS,
  INTERVAL_PRESETS,
  MAX_SLIPPAGE_BPS,
  MIN_AMOUNT_PER_SWAP_USDC,
  TOKEN_PRESETS,
  USDC_ADDRESS,
  USDC_DECIMALS,
  WETH_ADDRESS,
  formatBps,
  formatUsdc,
  intervalLabel,
} from "~~/utils/dca";
import { notification } from "~~/utils/scaffold-eth";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";

const erc20Abi = [
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
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
] as const;

// Uniswap V3 QuoterV2 on Base. v3 contract pre-approves the swap router for unlimited USDC,
// but we can still check pool liquidity off-chain by calling QuoterV2 with the same path the
// contract will build at create time. quoteExactInput is non-view (revert-pattern), so we use
// simulateContract — failing simulation = the pool doesn't exist or has zero liquidity.
const QUOTER_ADDRESS = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as const;
const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInput",
    stateMutability: "nonpayable",
    inputs: [
      { name: "path", type: "bytes" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { name: "initializedTicksCrossedList", type: "uint32[]" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

// Build the V3 path the same way the contract does in createPositionViaWETH:
//   USDC == target          → single hop USDC/fee/target  (impossible here, USDC is blocked as target)
//   target == WETH          → single hop USDC/fee/WETH
//   else                    → two hops USDC/fee1/WETH/fee2/target
const buildPath = (target: string, usdcWethFee: number, wethTargetFee: number): `0x${string}` => {
  if (target.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
    return encodePacked(["address", "uint24", "address"], [USDC_ADDRESS, usdcWethFee, WETH_ADDRESS]);
  }
  return encodePacked(
    ["address", "uint24", "address", "uint24", "address"],
    [USDC_ADDRESS, usdcWethFee, WETH_ADDRESS, wethTargetFee, target as `0x${string}`],
  );
};

const dcaAbiForEvent = [
  {
    type: "event",
    name: "PositionCreated",
    inputs: [
      { name: "positionId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "targetToken", type: "address", indexed: true },
      { name: "totalUSDC", type: "uint256", indexed: false },
      { name: "amountPerSwap", type: "uint256", indexed: false },
      { name: "intervalInEpochs", type: "uint256", indexed: false },
      { name: "slippageBps", type: "uint256", indexed: false },
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

  // ──────────────────────────────── form state ────────────────────────────────
  const [presetKey, setPresetKey] = useState<(typeof INTERVAL_PRESETS)[number]["key"]>("daily");
  const [totalUsdc, setTotalUsdc] = useState("");
  const [amountPerSwap, setAmountPerSwap] = useState("");
  const [customInterval, setCustomInterval] = useState("8");
  const [slippagePct, setSlippagePct] = useState(String(Number(DEFAULT_SLIPPAGE_BPS) / 100));

  // target token: start with CLAWD (first preset) preselected.
  const [tokenPresetIdx, setTokenPresetIdx] = useState(0);
  const [customTokenAddr, setCustomTokenAddr] = useState("");
  const [wethTargetFee, setWethTargetFee] = useState<number>(
    TOKEN_PRESETS[0].defaultWethFee ?? COMMON_WETH_TARGET_FEES[1].fee,
  );

  const isCustomToken = tokenPresetIdx === -1;
  const selectedPreset = !isCustomToken ? TOKEN_PRESETS[tokenPresetIdx] : null;
  const targetTokenAddr = (isCustomToken ? customTokenAddr : selectedPreset?.address) ?? "";
  const validTargetAddr = isAddress(targetTokenAddr) && targetTokenAddr.toLowerCase() !== USDC_ADDRESS.toLowerCase();

  // Fetch the symbol for a custom token address — UX nicety.
  const { data: customSymbol } = useReadContract({
    address: validTargetAddr && isCustomToken ? (targetTokenAddr as `0x${string}`) : undefined,
    abi: erc20Abi,
    functionName: "symbol",
    chainId: base.id,
    query: { enabled: validTargetAddr && isCustomToken },
  });
  const tokenSymbol = isCustomToken ? (customSymbol as string | undefined) : selectedPreset?.symbol;

  const preset = INTERVAL_PRESETS.find(p => p.key === presetKey)!;
  const intervalEpochs = useMemo(() => {
    if (preset.key === "custom") {
      const n = Number(customInterval);
      if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) return BigInt(n);
      return 0n;
    }
    return BigInt(preset.intervalInEpochs);
  }, [preset, customInterval]);

  // ──────────────────────────────── balances + allowance ────────────────────────────────
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    chainId: base.id,
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    chainId: base.id,
    args: address ? [address, CLAWDDCA_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  // ──────────────────────────────── parse + validate ────────────────────────────────
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

  const slippageValid = slippageBps > 0n && slippageBps <= MAX_SLIPPAGE_BPS;
  const amountTooSmall = amountPerSwapRaw > 0n && amountPerSwapRaw < MIN_AMOUNT_PER_SWAP_USDC;
  const insufficientBalance = totalUsdcRaw > 0n && usdcBalance !== undefined && totalUsdcRaw > (usdcBalance as bigint);
  const needsApproval = totalUsdcRaw > 0n && usdcAllowance !== undefined && totalUsdcRaw > (usdcAllowance as bigint);

  // ──────────────────────────────── fee-tier validity (quoter preflight) ────────────────────────────────
  // For each WETH→target fee tier candidate, run QuoterV2.quoteExactInput off-chain. If a tier reverts,
  // the pool doesn't exist or has zero liquidity → flag it so we never let users create a position that
  // can't execute. The user fell into exactly this trap on position #0 with the 0.05% CLAWD/WETH tier.
  // Recompute whenever the target token or the probe amount changes. Use amountPerSwapRaw if set, else
  // a 1 USDC probe (smallest creatable position) — gas-free static call either way.
  const probeAmount = amountPerSwapRaw > 0n ? amountPerSwapRaw : MIN_AMOUNT_PER_SWAP_USDC;
  type TierProbe = { fee: number; valid: boolean; expectedOut?: bigint; checking: boolean };
  const [tierProbes, setTierProbes] = useState<TierProbe[]>(
    COMMON_WETH_TARGET_FEES.map(({ fee }) => ({ fee, valid: false, checking: false })),
  );
  // Track whether the user has manually overridden the auto-selected tier on this target.
  const [userPickedTier, setUserPickedTier] = useState(false);

  useEffect(() => {
    if (!publicClient || !validTargetAddr) return;
    let cancelled = false;
    setTierProbes(prev => prev.map(p => ({ ...p, checking: true })));
    // If target is WETH itself, only the USDC→WETH hop matters — single-hop is always 0.05% and known good.
    const isWeth = targetTokenAddr.toLowerCase() === WETH_ADDRESS.toLowerCase();
    if (isWeth) {
      (async () => {
        const path = buildPath(targetTokenAddr, DEFAULT_USDC_WETH_FEE, 0);
        try {
          const r = await publicClient.simulateContract({
            address: QUOTER_ADDRESS,
            abi: QUOTER_ABI,
            functionName: "quoteExactInput",
            args: [path, probeAmount],
          });
          if (!cancelled) {
            setTierProbes([{ fee: 0, valid: true, expectedOut: r.result[0] as bigint, checking: false }]);
          }
        } catch {
          if (!cancelled) setTierProbes([{ fee: 0, valid: false, checking: false }]);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      const results = await Promise.all(
        COMMON_WETH_TARGET_FEES.map(async ({ fee }) => {
          const path = buildPath(targetTokenAddr, DEFAULT_USDC_WETH_FEE, fee);
          try {
            const r = await publicClient.simulateContract({
              address: QUOTER_ADDRESS,
              abi: QUOTER_ABI,
              functionName: "quoteExactInput",
              args: [path, probeAmount],
            });
            return { fee, valid: true, expectedOut: r.result[0] as bigint, checking: false } as TierProbe;
          } catch {
            return { fee, valid: false, checking: false } as TierProbe;
          }
        }),
      );
      if (!cancelled) setTierProbes(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, validTargetAddr, targetTokenAddr, probeAmount]);

  // Auto-pick the best (highest output) valid tier when target changes, unless the user explicitly picked.
  useEffect(() => {
    setUserPickedTier(false); // reset when target switches
  }, [targetTokenAddr]);
  useEffect(() => {
    if (userPickedTier) return;
    const valid = tierProbes.filter(p => p.valid);
    if (valid.length === 0) return;
    // Best tier = highest expectedOut (deepest pool for our probe amount).
    const best = valid.reduce((a, b) => ((b.expectedOut ?? 0n) > (a.expectedOut ?? 0n) ? b : a));
    if (best.fee !== wethTargetFee) setWethTargetFee(best.fee);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierProbes, userPickedTier]);

  const currentTierProbe = tierProbes.find(p => p.fee === wethTargetFee);
  const tierInvalid =
    targetTokenAddr.toLowerCase() !== WETH_ADDRESS.toLowerCase() &&
    !!currentTierProbe &&
    !currentTierProbe.checking &&
    !currentTierProbe.valid;
  const anyTierValid = tierProbes.some(p => p.valid);
  const stillProbing = tierProbes.some(p => p.checking);

  // ──────────────────────────────── approve ────────────────────────────────
  const {
    writeContractAsync: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
    reset: resetApprove,
  } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  const [approveCooldown, setApproveCooldown] = useState(false);
  const [waitingForAllowance, setWaitingForAllowance] = useState(false);

  const handleApprove = async () => {
    try {
      await writeAndOpen(() =>
        writeApprove({
          address: USDC_ADDRESS,
          abi: erc20Abi,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveConfirmed, approveTxHash]);

  // ──────────────────────────────── create position ────────────────────────────────
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
    if (amountTooSmall) {
      notification.error("Amount per swap must be at least 1 USDC.");
      return;
    }
    if (!validTargetAddr) {
      notification.error("Pick a target token (or enter a valid address that isn't USDC).");
      return;
    }
    if (!slippageValid) {
      notification.error("Slippage must be > 0% and ≤ 10%.");
      return;
    }
    setPostCreateBusy(true);
    let createdId: bigint | undefined;
    try {
      // v3 has two creation paths:
      //  - createPosition(... swapPath): caller provides the raw Uniswap V3 path
      //  - createPositionViaWETH(... usdcWethFee, wethTargetFee): contract builds the path
      // We use the WETH-router helper by default. It single-hops to WETH when the target IS
      // WETH, otherwise two hops USDC → WETH → target. Covers ~all interesting Base tokens.
      const txHash = await writeAndOpen(() =>
        writeDca({
          functionName: "createPositionViaWETH",
          args: [
            totalUsdcRaw,
            amountPerSwapRaw,
            intervalEpochs,
            targetTokenAddr as `0x${string}`,
            DEFAULT_USDC_WETH_FEE,
            wethTargetFee,
            slippageBps,
          ],
        }),
      );

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
            // not our event
          }
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

  // ──────────────────────────────── render ────────────────────────────────
  return (
    <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14 flex flex-col gap-8 mount">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.025em]">Create a DCA position</h1>
        <p className="text-[color:var(--text-1)] max-w-lg mx-auto">
          USDC in, any Base token out. Pick a target, a cadence, and a budget — keepers handle the rest.
        </p>
      </header>

      <WalletStrip />

      <div className="surface-elev p-6 sm:p-7 flex flex-col gap-7">
        {/* target token */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[color:var(--text-2)]">Target token</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TOKEN_PRESETS.map((t, i) => {
              const active = tokenPresetIdx === i;
              return (
                <button
                  key={t.address}
                  type="button"
                  onClick={() => {
                    setTokenPresetIdx(i);
                    if (t.defaultWethFee) setWethTargetFee(t.defaultWethFee);
                  }}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    active
                      ? "border-[color:var(--clawd-line)] bg-[color:var(--clawd-soft)]"
                      : "border-[color:var(--line)] bg-[color:var(--surface-1)] hover:border-[color:var(--line-strong)]"
                  }`}
                >
                  <div
                    className={`font-semibold text-sm ${
                      active ? "text-[color:var(--clawd)]" : "text-[color:var(--text-0)]"
                    }`}
                  >
                    {t.symbol}
                  </div>
                  <div className="text-[11px] text-[color:var(--text-2)] mt-0.5">{t.name}</div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setTokenPresetIdx(-1)}
              className={`text-left p-3 rounded-xl border transition-all col-span-2 sm:col-span-1 ${
                isCustomToken
                  ? "border-[color:var(--clawd-line)] bg-[color:var(--clawd-soft)]"
                  : "border-[color:var(--line)] bg-[color:var(--surface-1)] hover:border-[color:var(--line-strong)]"
              }`}
            >
              <div
                className={`font-semibold text-sm ${
                  isCustomToken ? "text-[color:var(--clawd)]" : "text-[color:var(--text-0)]"
                }`}
              >
                Custom
              </div>
              <div className="text-[11px] text-[color:var(--text-2)] mt-0.5">Paste any address</div>
            </button>
          </div>
          {isCustomToken && (
            <div className="flex flex-col gap-1.5">
              <input
                type="text"
                value={customTokenAddr}
                onChange={e => setCustomTokenAddr(e.target.value.trim())}
                placeholder="0x... target token address on Base"
                className="input input-md w-full tabular text-sm"
              />
              <div className="text-[11px] text-[color:var(--text-3)]">
                {customTokenAddr && !isAddress(customTokenAddr)
                  ? "Not a valid address."
                  : customTokenAddr.toLowerCase() === USDC_ADDRESS.toLowerCase()
                    ? "Target cannot be USDC."
                    : tokenSymbol
                      ? `Detected symbol: ${tokenSymbol}`
                      : "Token must have USDC liquidity on Uniswap V3 (via WETH)."}
              </div>
            </div>
          )}
          {/* WETH→target fee tier — hide when target IS WETH (single-hop, no choice) */}
          {targetTokenAddr.toLowerCase() !== WETH_ADDRESS.toLowerCase() && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[color:var(--text-2)]">WETH → {tokenSymbol ?? "target"} pool fee</label>
              <div className="grid grid-cols-3 gap-2">
                {COMMON_WETH_TARGET_FEES.map(({ fee, label }) => {
                  const active = wethTargetFee === fee;
                  const probe = tierProbes.find(p => p.fee === fee);
                  const valid = probe?.valid === true;
                  const checking = probe?.checking === true;
                  const dead = probe && !probe.valid && !probe.checking;
                  return (
                    <button
                      key={fee}
                      type="button"
                      disabled={dead}
                      onClick={() => {
                        setWethTargetFee(fee);
                        setUserPickedTier(true);
                      }}
                      className={`p-2 rounded-lg border text-xs text-left transition-all relative ${
                        active && valid
                          ? "border-[color:var(--clawd-line)] bg-[color:var(--clawd-soft)] text-[color:var(--text-0)]"
                          : dead
                            ? "border-[color:var(--line-soft)] bg-[color:var(--surface-1)] text-[color:var(--text-3)] opacity-50 cursor-not-allowed"
                            : "border-[color:var(--line)] bg-[color:var(--surface-1)] text-[color:var(--text-2)] hover:border-[color:var(--line-strong)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>{label}</span>
                        {checking && <span className="loading loading-spinner loading-xs opacity-60" />}
                        {!checking && valid && (
                          <span className="text-[color:var(--good)] font-bold" title="Pool has liquidity">
                            ✓
                          </span>
                        )}
                        {!checking && dead && (
                          <span className="text-[color:var(--text-3)]" title="No pool / no liquidity">
                            —
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {stillProbing && (
                <div className="text-[11px] text-[color:var(--text-3)]">Checking pool liquidity…</div>
              )}
              {!stillProbing && !anyTierValid && validTargetAddr && (
                <div className="text-[11px] text-[color:var(--bad)]">
                  No Uniswap V3 pool found via WETH for this token. Try a different target or use a token with USDC/WETH liquidity.
                </div>
              )}
              {!stillProbing && anyTierValid && tierInvalid && (
                <div className="text-[11px] text-[color:var(--bad)]">
                  The selected tier has no pool. Pick one of the ✓ tiers above.
                </div>
              )}
              {!stillProbing && anyTierValid && !tierInvalid && (
                <div className="text-[11px] text-[color:var(--text-3)]">
                  Best tier auto-selected. ✓ = pool has liquidity, — = no pool.
                </div>
              )}
            </div>
          )}
        </section>

        {/* strategy */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[color:var(--text-2)]">Strategy</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {INTERVAL_PRESETS.map(p => {
              const isActive = presetKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPresetKey(p.key)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    isActive
                      ? "border-[color:var(--clawd-line)] bg-[color:var(--clawd-soft)]"
                      : "border-[color:var(--line)] bg-[color:var(--surface-1)] hover:border-[color:var(--line-strong)]"
                  }`}
                >
                  <div
                    className={`font-semibold text-sm ${
                      isActive ? "text-[color:var(--clawd)]" : "text-[color:var(--text-0)]"
                    }`}
                  >
                    {p.label}
                  </div>
                  <div className="text-[11px] text-[color:var(--text-2)] mt-0.5">{p.description}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* amounts */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[color:var(--text-2)]">Amounts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[color:var(--text-2)]">Total USDC to DCA</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={totalUsdc}
                onChange={e => setTotalUsdc(e.target.value)}
                placeholder="500.00"
                className="input input-md w-full text-base font-medium tabular"
              />
              <div className="text-[11px] text-[color:var(--text-3)]">
                Wallet: ${formatUsdc(usdcBalance as bigint | undefined)}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[color:var(--text-2)]">Amount per swap (min 1 USDC)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amountPerSwap}
                onChange={e => setAmountPerSwap(e.target.value)}
                placeholder="25.00"
                className="input input-md w-full text-base font-medium tabular"
              />
              <div className="text-[11px] text-[color:var(--text-3)]">
                {amountTooSmall ? "Must be at least 1 USDC." : "Deducted each cadence interval."}
              </div>
            </div>
          </div>
        </section>

        {presetKey === "custom" && (
          <section className="flex flex-col gap-1.5">
            <label className="text-xs text-[color:var(--text-2)]">Interval (in 3-hour epochs)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={customInterval}
              onChange={e => setCustomInterval(e.target.value)}
              className="input input-md w-full tabular"
            />
            <div className="text-[11px] text-[color:var(--text-3)]">
              1 epoch = 3 hours · {intervalLabel(intervalEpochs)}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-1.5">
          <label className="text-xs text-[color:var(--text-2)]">Slippage tolerance</label>
          <div className="relative">
            <input
              type="number"
              min="0.01"
              max="10"
              step="0.01"
              value={slippagePct}
              onChange={e => setSlippagePct(e.target.value)}
              className="input input-md w-full pr-8 tabular"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)] text-sm">%</span>
          </div>
          <div className="text-[11px] text-[color:var(--text-3)]">
            Default {formatBps(DEFAULT_SLIPPAGE_BPS)} · max {formatBps(MAX_SLIPPAGE_BPS)}
          </div>
        </section>

        {/* summary */}
        <section className="surface-2 p-4 flex flex-col gap-2.5 text-sm">
          <SummaryRow label="Target" value={tokenSymbol ? `${tokenSymbol} (${validTargetAddr ? "✓" : "—"})` : "—"} />
          <SummaryRow label="Executions" value={numExecutions.toString()} />
          <SummaryRow label="Cadence" value={intervalLabel(intervalEpochs)} />
          <SummaryRow label="Runs until" value={estimatedEnd ? estimatedEnd.toLocaleString() : "—"} />
          <SummaryRow label="Fees per swap" value="10bps keeper · 10bps protocol · 10bps burn (30bps total)" />
          <p className="text-[11px] text-[color:var(--text-3)] pt-1 m-0">
            Per-swap output is set live by the Uniswap V3 pool. Burn fee always converts USDC→CLAWD and sends to{" "}
            <code className="px-1 rounded bg-[color:var(--surface-3)]">0xdead</code> — every DCA contributes to CLAWD
            deflation, regardless of target.
          </p>
        </section>

        {/* CTA */}
        {!isConnected && (
          <button className="btn btn-primary btn-lg" disabled>
            Connect wallet to create
          </button>
        )}

        {isConnected && wrongNetwork && (
          <button
            className="btn btn-warning btn-lg"
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
                className="btn btn-soft btn-lg"
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
                {needsApproval ? "1. Approve USDC" : "1. USDC approved ✓"}
              </button>
              <button
                className="btn btn-primary btn-lg"
                disabled={
                  needsApproval ||
                  insufficientBalance ||
                  isCreating ||
                  postCreateBusy ||
                  amountTooSmall ||
                  !validTargetAddr ||
                  !slippageValid ||
                  tierInvalid ||
                  stillProbing ||
                  totalUsdcRaw === 0n ||
                  amountPerSwapRaw === 0n ||
                  intervalEpochs === 0n
                }
                onClick={handleCreate}
              >
                {(isCreating || postCreateBusy) && <span className="loading loading-spinner loading-xs" />}
                {tierInvalid ? "Pick a valid pool tier" : stillProbing ? "Checking liquidity…" : "2. Create position"}
              </button>
            </div>
            {insufficientBalance && (
              <p className="text-[color:var(--bad)] text-xs my-0">Not enough USDC in your wallet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-[color:var(--text-2)] text-xs uppercase tracking-[0.08em]">{label}</span>
    <span className="font-medium tabular text-right">{value}</span>
  </div>
);

export default CreatePage;
