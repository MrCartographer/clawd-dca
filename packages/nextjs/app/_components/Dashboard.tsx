"use client";

import Image from "next/image";
import Link from "next/link";
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
    <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-16 flex flex-col gap-12 mount">
      {/* hero */}
      <header className="flex flex-col items-center text-center">
        <p className="text-[color:var(--text-1)] max-w-xl text-base sm:text-lg leading-relaxed">
          Deposit USDC, choose any Base token, set a cadence. Keepers run the DCA. Every swap quietly burns CLAWD
          forever.
        </p>
      </header>

      {/* swap-style hero card */}
      <div className="swap-card max-w-md w-full mx-auto flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-semibold tracking-tight">DCA into any Base token</span>
          {isConnected && address ? (
            <span className="text-xs text-[color:var(--text-2)] flex items-center gap-1.5">
              <span className="dot dot-pulse text-[color:var(--good)]" />
              Live
            </span>
          ) : (
            <span className="text-xs text-[color:var(--text-3)]">Connect wallet to deposit</span>
          )}
        </div>

        <div className="token-panel">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-[color:var(--text-2)] uppercase tracking-[0.12em]">You deposit</span>
            <span className="text-[11px] text-[color:var(--text-2)] tabular">
              {isConnected ? `Wallet $${formatUsdc(usdcBalance as bigint | undefined)}` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[32px] font-semibold text-[color:var(--text-3)] tabular">0.00</div>
            <div className="token-chip">
              <span className="inline-flex w-6 h-6 rounded-full bg-[#2563eb] text-white text-[10px] font-bold items-center justify-center">
                $
              </span>
              <span>USDC</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center -my-3.5 z-10">
          <div className="w-9 h-9 rounded-full bg-[color:var(--surface-0)] border border-[color:var(--line)] flex items-center justify-center shadow-md">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="token-panel">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-[color:var(--text-2)] uppercase tracking-[0.12em]">You receive</span>
            <span className="text-[11px] text-[color:var(--text-2)] tabular">
              {isConnected ? `Wallet ${formatClawd(clawdBalance as bigint | undefined)}` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[32px] font-semibold text-[color:var(--text-3)] tabular">0.00</div>
            <div className="token-chip">
              <span className="relative inline-block w-6 h-6 rounded-full overflow-hidden ring-1 ring-[color:var(--clawd-line)] bg-white">
                <Image src="/clawd-original.jpg" alt="CLAWD" fill sizes="24px" className="object-cover" />
              </span>
              <span>Any token</span>
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
            New position →
          </Link>
        )}

        <div className="flex items-center justify-between text-[11px] text-[color:var(--text-3)] px-1 pt-1">
          <span>Fees per swap</span>
          <span className="tabular">10bps keeper · 10bps protocol · 10bps burn (30bps total)</span>
        </div>
      </div>

      {/* how it works — 3 columns */}
      <section className="grid sm:grid-cols-3 gap-3">
        {[
          {
            n: "01",
            t: "Deposit",
            d: "Approve USDC and choose a cadence — every 3 hours, daily, weekly, or your call.",
          },
          {
            n: "02",
            t: "Keepers run it",
            d: "Permissionless community keepers execute your DCA when each position is ripe.",
          },
          {
            n: "03",
            t: "Pull out anytime",
            d: "Withdraw accumulated CLAWD whenever. Close to recover any remaining USDC + CLAWD.",
          },
        ].map(({ n, t, d }) => (
          <div key={n} className="surface p-5 flex flex-col gap-2">
            <span className="text-[11px] tabular text-[color:var(--clawd)] font-semibold tracking-[0.12em]">{n}</span>
            <h3 className="text-base font-semibold tracking-tight">{t}</h3>
            <p className="text-sm text-[color:var(--text-2)] leading-relaxed">{d}</p>
          </div>
        ))}
      </section>

      {/* your positions */}
      <section className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.025em]">Your positions</h2>
            {isConnected && ids.length > 0 && (
              <span className="text-sm text-[color:var(--text-2)] tabular">{ids.length} total</span>
            )}
          </div>
          <Link href="/create" className="btn btn-soft btn-sm">
            + New
          </Link>
        </div>

        {!isConnected && (
          <div className="surface p-10 flex flex-col items-center text-center gap-2">
            <p className="text-[color:var(--text-1)]">Connect your wallet to see your DCA positions.</p>
          </div>
        )}

        {isConnected && isLoading && (
          <div className="flex flex-col gap-3">
            <div className="shimmer h-32 w-full rounded-2xl" />
            <div className="shimmer h-32 w-full rounded-2xl opacity-60" />
          </div>
        )}

        {isConnected && !isLoading && ids.length === 0 && (
          <div className="surface p-10 flex flex-col items-center text-center gap-3">
            <span className="text-3xl">🪙</span>
            <p className="text-[color:var(--text-1)]">No positions yet — start your first DCA.</p>
            <Link href="/create" className="btn btn-primary btn-sm">
              Create position
            </Link>
          </div>
        )}

        {isConnected && !isLoading && ids.length > 0 && (
          <div className="flex flex-col gap-3">
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
