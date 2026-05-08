"use client";

import Image from "next/image";
import Link from "next/link";
import { Address as AddressComp } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { base } from "viem/chains";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import { PositionCard } from "~~/components/dca/PositionCard";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { CLAWD_ADDRESS, USDC_ADDRESS, formatClawd, formatUsdc } from "~~/utils/dca";

const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const Home: NextPage = () => {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== base.id;

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    chainId: base.id,
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: clawdBalance } = useReadContract({
    address: CLAWD_ADDRESS,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    chainId: base.id,
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: positionIds, isLoading } = useScaffoldReadContract({
    contractName: "CLAWDdca",
    functionName: "getPositionsByOwner",
    args: [address],
    watch: true,
  });

  const ids = (positionIds as readonly bigint[] | undefined) ?? [];

  return (
    <div className="max-w-5xl w-full mx-auto px-4 py-10 sm:py-14 flex flex-col gap-8">
      <header className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight my-0">
          Stack <span className="text-[color:var(--ink-orange-60)]">CLAWD</span> on autopilot
        </h1>
        <p className="opacity-70 max-w-xl mx-auto my-0 text-base sm:text-lg leading-relaxed">
          USDC in. CLAWD out. Permissionless keepers run your DCA on Base — every 3h, daily, weekly, or your call.
        </p>
      </header>

      <div className="swap-card max-w-md w-full mx-auto flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-semibold">Stack CLAWD</span>
          {isConnected && address ? (
            <span className="text-xs opacity-70 flex items-center gap-1.5">
              <span className="opacity-60 uppercase tracking-wide">Connected</span>
              <AddressComp address={address} format="short" size="xs" chain={base} />
            </span>
          ) : (
            <span className="text-xs opacity-60">Connect your wallet to view balances</span>
          )}
        </div>

        <div className="token-panel">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs opacity-60 uppercase tracking-wide">You deposit</span>
            <span className="text-xs opacity-60 tabular">Wallet: ${formatUsdc(usdcBalance as bigint | undefined)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-3xl font-semibold opacity-50 tabular">0.00</div>
            <div className="token-chip">
              <span className="inline-flex w-6 h-6 rounded-full bg-[color:var(--ink-blue-10)] text-[color:var(--ink-blue-70)] text-[10px] font-bold items-center justify-center ring-1 ring-[color:var(--ink-blue-30)]">
                $
              </span>
              <span>USDC</span>
            </div>
          </div>
        </div>

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

        <div className="token-panel">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs opacity-60 uppercase tracking-wide">You receive</span>
            <span className="text-xs opacity-60 tabular">
              Wallet: {formatClawd(clawdBalance as bigint | undefined)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-3xl font-semibold opacity-50 tabular">0.00</div>
            <div className="token-chip">
              <span className="relative inline-block w-6 h-6 rounded-full overflow-hidden ring-1 ring-[color:var(--ink-orange-60)] bg-white">
                <Image src="/clawd-original.jpg" alt="CLAWD" fill sizes="24px" className="object-cover" />
              </span>
              <span>CLAWD</span>
            </div>
          </div>
        </div>

        {wrongNetwork ? (
          <button
            className="btn btn-warning btn-block"
            disabled={isSwitching}
            onClick={() => switchChain({ chainId: base.id })}
          >
            {isSwitching ? <span className="loading loading-spinner loading-xs" /> : null}
            Switch to Base
          </button>
        ) : (
          <Link href="/create" className="btn btn-primary btn-block btn-lg">
            + New Position
          </Link>
        )}

        <Link href="/stats" className="btn btn-ghost btn-block btn-sm">
          View Engine Stats
        </Link>
      </div>

      <details className="rounded-2xl border border-[color:var(--ink-gray-40)] bg-base-100 overflow-hidden" open>
        <summary className="cursor-pointer p-4 sm:p-5 font-semibold text-base flex items-center gap-2">
          <span className="chip">How it works</span>
          <span className="opacity-60 text-sm font-normal">3 steps</span>
        </summary>
        <ol className="list-decimal list-inside p-4 sm:p-5 pt-0 space-y-2 text-sm opacity-90">
          <li>
            <strong>Create a position.</strong> Deposit USDC and choose a strategy (every 3 hours, daily, weekly, or
            custom).
          </li>
          <li>
            <strong>Keepers do the work.</strong> Permissionless community keepers execute your DCA swaps on schedule.
            They earn 0.39% per swap.
          </li>
          <li>
            <strong>Withdraw any time.</strong> Pull out accumulated CLAWD whenever. Close the position to get any
            remaining USDC + CLAWD.
          </li>
        </ol>
      </details>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold my-0 tracking-tight">Your Positions</h2>
          <Link href="/create" className="btn btn-primary btn-sm">
            + New Position
          </Link>
        </div>

        {!isConnected && (
          <div className="card">
            <div className="card-body items-center text-center py-10">
              <p className="opacity-70 my-0">Connect your wallet to see your DCA positions.</p>
            </div>
          </div>
        )}

        {isConnected && isLoading && (
          <div className="text-center opacity-70 py-6">
            <span className="loading loading-spinner loading-md" />
          </div>
        )}

        {isConnected && !isLoading && ids.length === 0 && (
          <div className="card">
            <div className="card-body items-center text-center gap-3 py-10">
              <p className="opacity-70 my-0">No positions yet — create your first DCA position.</p>
              <Link href="/create" className="btn btn-primary btn-sm">
                Create Position
              </Link>
            </div>
          </div>
        )}

        {isConnected && !isLoading && ids.length > 0 && (
          <div className="flex flex-col gap-4">
            {ids.map(id => (
              <PositionCard key={id.toString()} positionId={id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;
