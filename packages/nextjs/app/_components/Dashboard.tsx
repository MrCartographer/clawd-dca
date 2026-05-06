"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { PositionCard } from "~~/components/dca/PositionCard";
import { WalletStrip } from "~~/components/dca/WalletStrip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const Home: NextPage = () => {
  const { address, isConnected } = useAccount();

  const { data: positionIds, isLoading } = useScaffoldReadContract({
    contractName: "CLAWDdca",
    functionName: "getPositionsByOwner",
    args: [address],
    watch: true,
  });

  const ids = (positionIds as readonly bigint[] | undefined) ?? [];

  return (
    <div className="max-w-5xl w-full mx-auto px-4 py-8 flex flex-col gap-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold flex items-center justify-center gap-3 my-0">
          <span>🦞</span> CLAWD DCA Engine
        </h1>
        <p className="opacity-80 max-w-2xl mx-auto my-0">
          Stack CLAWD on autopilot. USDC in. CLAWD out. Permissionless keepers do the work.
        </p>
      </header>

      <WalletStrip />

      <details className="bg-base-100 rounded-lg shadow-sm border border-base-300" open>
        <summary className="cursor-pointer p-4 font-semibold">How it works</summary>
        <ol className="list-decimal list-inside p-4 pt-0 space-y-2 text-sm">
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
          <h2 className="text-xl font-bold my-0">Your Positions</h2>
          <Link href="/create" className="btn btn-primary btn-sm">
            + New Position
          </Link>
        </div>

        {!isConnected && (
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body items-center text-center">
              <p className="opacity-80">Connect your wallet to see your DCA positions.</p>
            </div>
          </div>
        )}

        {isConnected && isLoading && (
          <div className="text-center opacity-70">
            <span className="loading loading-spinner loading-md" />
          </div>
        )}

        {isConnected && !isLoading && ids.length === 0 && (
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body items-center text-center gap-3">
              <p className="opacity-80 my-0">No positions yet — create your first DCA position.</p>
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
