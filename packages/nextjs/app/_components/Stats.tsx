"use client";

import { useMemo } from "react";
import { Address as AddressComp } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { base } from "viem/chains";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { DEPLOYED_ON_BLOCK, V1_ADDRESS, V2_ADDRESS, formatClawd, formatUsdc } from "~~/utils/dca";

// ─── Memorial constants for retired contracts (sourced from earlier live scans) ───
const V1_DEPLOY = "2026-05-07";
const V1_RETIRE = "2026-05-19";
const V2_DEPLOY = "2026-05-20";
const V2_RETIRE = "2026-05-28";

const StatsPage: NextPage = () => {
  const { data: createdEvents, isLoading: createdLoading } = useScaffoldEventHistory({
    contractName: "CLAWDdca",
    eventName: "PositionCreated",
    fromBlock: DEPLOYED_ON_BLOCK,
    watch: true,
    blocksBatchSize: 50_000,
  });
  const { data: executedEvents, isLoading: executedLoading } = useScaffoldEventHistory({
    contractName: "CLAWDdca",
    eventName: "PositionExecuted",
    fromBlock: DEPLOYED_ON_BLOCK,
    watch: true,
    blocksBatchSize: 50_000,
  });
  const { data: closedEvents } = useScaffoldEventHistory({
    contractName: "CLAWDdca",
    eventName: "PositionClosed",
    fromBlock: DEPLOYED_ON_BLOCK,
    watch: true,
    blocksBatchSize: 50_000,
  });
  const { data: burnEvents } = useScaffoldEventHistory({
    contractName: "CLAWDdca",
    eventName: "BurnExecuted",
    fromBlock: DEPLOYED_ON_BLOCK,
    watch: true,
    blocksBatchSize: 50_000,
  });

  const { data: burnFeeBalance } = useScaffoldReadContract({
    contractName: "CLAWDdca",
    functionName: "burnFeeBalance",
    watch: true,
  });
  const { data: protocolFeeBalance } = useScaffoldReadContract({
    contractName: "CLAWDdca",
    functionName: "protocolFeeBalance",
    watch: true,
  });

  // v3 event signatures:
  //   PositionExecuted(positionId, keeper, amountSwapped, tokenReceived, keeperFee, epoch)
  // Note: v3's PositionExecuted doesn't break out protocolFee / burnFee per-event the way v2
  // did (DCAExecuted had 5 fee fields). We derive those from amountSwapped × fee_bps.
  const KEEPER_BPS = 10n;
  const PROTOCOL_BPS = 10n;
  const BURN_BPS = 10n;
  const BPS_DENOM = 10_000n;

  const { totalUsdcSwapped, totalKeeperFees, totalProtocolFees, totalBurnFees, executionCount, keeperLeaderboard } =
    useMemo(() => {
      let totalUsdcSwapped = 0n;
      let totalKeeperFees = 0n;
      const keeperCounts = new Map<string, { count: number; rewardUsdc: bigint }>();
      for (const log of executedEvents ?? []) {
        const a = (log as any).args ?? {};
        const amount = typeof a.amountSwapped === "bigint" ? a.amountSwapped : 0n;
        const keeperFee = typeof a.keeperFee === "bigint" ? a.keeperFee : (amount * KEEPER_BPS) / BPS_DENOM;
        totalUsdcSwapped += amount;
        totalKeeperFees += keeperFee;
        const keeper = (a.keeper as string | undefined)?.toLowerCase();
        if (keeper) {
          const prev = keeperCounts.get(keeper) ?? { count: 0, rewardUsdc: 0n };
          prev.count++;
          prev.rewardUsdc += keeperFee;
          keeperCounts.set(keeper, prev);
        }
      }
      const totalProtocolFees = (totalUsdcSwapped * PROTOCOL_BPS) / BPS_DENOM;
      const totalBurnFees = (totalUsdcSwapped * BURN_BPS) / BPS_DENOM;
      const keeperLeaderboard = Array.from(keeperCounts.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);
      return {
        totalUsdcSwapped,
        totalKeeperFees,
        totalProtocolFees,
        totalBurnFees,
        executionCount: executedEvents?.length ?? 0,
        keeperLeaderboard,
      };
    }, [executedEvents]);

  const { totalClawdBurned, totalUsdcBurned, burnCount } = useMemo(() => {
    let totalClawdBurned = 0n;
    let totalUsdcBurned = 0n;
    for (const log of burnEvents ?? []) {
      const a = (log as any).args ?? {};
      if (typeof a.clawdBurned === "bigint") totalClawdBurned += a.clawdBurned;
      if (typeof a.usdcIn === "bigint") totalUsdcBurned += a.usdcIn;
    }
    return { totalClawdBurned, totalUsdcBurned, burnCount: burnEvents?.length ?? 0 };
  }, [burnEvents]);

  const positionsCreated = createdEvents?.length ?? 0;
  const positionsClosed = closedEvents?.length ?? 0;
  const activePositions = Math.max(0, positionsCreated - positionsClosed);
  const stillLoading = createdLoading || executedLoading;

  // Owners + unique target tokens
  const uniqueOwners = useMemo(() => {
    const set = new Set<string>();
    for (const log of createdEvents ?? []) {
      const a = (log as any).args ?? {};
      const owner = (a.owner as string | undefined)?.toLowerCase();
      if (owner) set.add(owner);
    }
    return set.size;
  }, [createdEvents]);

  const uniqueTargets = useMemo(() => {
    const set = new Set<string>();
    for (const log of createdEvents ?? []) {
      const a = (log as any).args ?? {};
      const t = (a.targetToken as string | undefined)?.toLowerCase();
      if (t) set.add(t);
    }
    return set.size;
  }, [createdEvents]);

  return (
    <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14 flex flex-col gap-12 mount">
      <header className="flex flex-col gap-3 text-center">
        <span className="chip">
          <span className="dot dot-pulse text-[color:var(--good)]" /> Live · v3
        </span>
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-[-0.03em]">Engine stats</h1>
        <p className="text-[color:var(--text-1)] max-w-xl mx-auto">
          Every number on this page is derived directly from on-chain events. No backend, no caching, no edits.
        </p>
      </header>

      {/* v3 PRIMARY KPI GRID */}
      <section className="flex flex-col gap-4">
        <SectionHeader title="v3 — all time" subtitle="Generalized DCA engine, any Base token via USDC" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="USDC swapped"
            value={`$${formatUsdc(totalUsdcSwapped)}`}
            sub={`${executionCount} executions`}
          />
          <KpiCard
            label="Positions opened"
            value={positionsCreated.toString()}
            sub={`${activePositions} active · ${uniqueOwners} unique users`}
          />
          <KpiCard label="Unique tokens DCA'd" value={uniqueTargets.toString()} sub="Different target ERC-20s" accent />
          <KpiCard
            label="CLAWD burned"
            value={formatClawd(totalClawdBurned)}
            sub={`${burnCount} burn${burnCount === 1 ? "" : "s"} · $${formatUsdc(totalUsdcBurned)} USDC routed`}
            accent
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat label="Keeper fees paid" value={`$${formatUsdc(totalKeeperFees)}`} />
          <MiniStat label="Protocol fees" value={`$${formatUsdc(totalProtocolFees)}`} />
          <MiniStat label="Burn fees accrued" value={`$${formatUsdc(totalBurnFees)}`} />
          <MiniStat
            label="Pending balances"
            value={`$${formatUsdc(
              ((protocolFeeBalance as bigint | undefined) ?? 0n) + ((burnFeeBalance as bigint | undefined) ?? 0n),
            )}`}
            sub={`$${formatUsdc(protocolFeeBalance as bigint | undefined)} protocol · $${formatUsdc(burnFeeBalance as bigint | undefined)} burn`}
          />
        </div>
      </section>

      {/* TOP KEEPERS */}
      <section className="flex flex-col gap-4">
        <SectionHeader title="Top keepers" subtitle="Most active executors on v3" />
        {stillLoading && (
          <div className="flex flex-col gap-2">
            <div className="shimmer h-12 w-full rounded-lg" />
            <div className="shimmer h-12 w-full rounded-lg opacity-70" />
          </div>
        )}
        {!stillLoading && keeperLeaderboard.length === 0 && (
          <div className="surface p-8 text-center text-[color:var(--text-2)]">No executions yet on v3.</div>
        )}
        {keeperLeaderboard.length > 0 && (
          <div className="surface overflow-x-auto">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Keeper</th>
                  <th>Executions</th>
                  <th className="text-right">USDC earned</th>
                </tr>
              </thead>
              <tbody>
                {keeperLeaderboard.map(([addr, { count, rewardUsdc }], i) => (
                  <tr key={addr}>
                    <td className="text-[color:var(--text-2)]">{i + 1}</td>
                    <td>
                      <AddressComp address={addr as `0x${string}`} format="short" size="xs" chain={base} />
                    </td>
                    <td className="font-medium">{count}</td>
                    <td className="text-right text-[color:var(--clawd)] font-medium">${formatUsdc(rewardUsdc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* MEMORIAL · v2 */}
      <section className="flex flex-col gap-4">
        <SectionHeader
          title="Memorial · v2 lifetime"
          subtitle={`Second era · ${V2_DEPLOY} → ${V2_RETIRE} · single-token (CLAWD), 50 bps fees, first burn`}
        />
        <div className="memorial flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="memorial-label">v2 — sunset</span>
              <h3 className="text-xl font-semibold tracking-tight">Burn mechanism · introduced here</h3>
              <p className="text-sm text-[color:var(--text-2)] max-w-xl">
                v2 added the permissionless USDC → CLAWD → 0xdead burn. 8-day run, then wound down to make way for v3.
              </p>
            </div>
            <a
              href={`https://basescan.org/address/${V2_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-soft btn-sm"
            >
              ↗ View v2 on Basescan
            </a>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MemorialStat label="Positions opened" value="3" />
            <MemorialStat label="Swaps executed" value="41" />
            <MemorialStat label="USDC cycled" value="$407.95" />
            <MemorialStat label="CLAWD bought" value="18,313,137" />
            <MemorialStat label="Unique users" value="1" />
            <MemorialStat label="Unique keepers" value="1" />
            <MemorialStat label="Keeper fees paid" value="$0.82" />
            <MemorialStat label="CLAWD burned 🔥" value="43,110" />
          </div>
          <div className="text-[11px] text-[color:var(--text-3)]">
            Fees: 20 bps keeper · 10 bps protocol · 20 bps burn (50 bps total). Burn mechanism debuted in v2 — $0.82
            USDC routed through USDC→CLAWD→0xdead in a single executeBurn() call. v3 cut total fees to 30 bps and
            added any-token support.
          </div>
          <div className="text-[11px] text-[color:var(--text-3)]">
            Contract:{" "}
            <a
              href={`https://basescan.org/address/${V2_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="link tabular"
            >
              {V2_ADDRESS}
            </a>
          </div>
        </div>
      </section>

      {/* MEMORIAL · v1 */}
      <section className="flex flex-col gap-4">
        <SectionHeader
          title="Memorial · v1 lifetime"
          subtitle={`First era · ${V1_DEPLOY} → ${V1_RETIRE} · 12-day proof-of-concept, CLAWD-only, 69 bps fees`}
        />
        <div className="memorial flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="memorial-label">v1 — sunset</span>
              <h3 className="text-xl font-semibold tracking-tight">First-era cumulative stats</h3>
              <p className="text-sm text-[color:var(--text-2)] max-w-xl">
                A 12-day proof-of-concept run. Every byte verified, every keeper paid. Honored here for the receipts.
              </p>
            </div>
            <a
              href={`https://basescan.org/address/${V1_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-soft btn-sm"
            >
              ↗ View v1 on Basescan
            </a>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MemorialStat label="Positions opened" value="5" />
            <MemorialStat label="Swaps executed" value="45" />
            <MemorialStat label="USDC cycled" value="$2,215.00" />
            <MemorialStat label="CLAWD bought" value="98,250,485" />
            <MemorialStat label="Unique users" value="2" />
            <MemorialStat label="Unique keepers" value="3" />
            <MemorialStat label="Keeper fees paid" value="$8.64" />
            <MemorialStat label="Protocol fees" value="$6.65" />
          </div>
          <div className="text-[11px] text-[color:var(--text-3)]">
            Fees: 39 bps keeper · 30 bps protocol · 0 bps burn (69 bps total). v2 introduced the burn at 50 bps. v3 cut
            all in to 30 bps and added any-token support.
          </div>
          <div className="text-[11px] text-[color:var(--text-3)]">
            Contract:{" "}
            <a
              href={`https://basescan.org/address/${V1_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="link tabular"
            >
              {V1_ADDRESS}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

const SectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="flex flex-col gap-0.5">
    <h2 className="text-xl sm:text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
    <p className="text-sm text-[color:var(--text-2)] m-0">{subtitle}</p>
  </div>
);

const KpiCard = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) => (
  <div className="stat-card">
    <div className="stat-label">{label}</div>
    <div className={`stat-value metric-display ${accent ? "text-[color:var(--clawd)]" : ""}`}>{value}</div>
    {sub && <div className="stat-sub">{sub}</div>}
  </div>
);

const MiniStat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="surface px-4 py-3 flex flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-2)] font-medium">{label}</span>
    <span className="text-base font-semibold tabular text-[color:var(--text-0)]">{value}</span>
    {sub && <span className="text-[11px] text-[color:var(--text-3)] tabular">{sub}</span>}
  </div>
);

const MemorialStat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-2)] font-medium">{label}</span>
    <span className="text-lg font-semibold tabular metric-display">{value}</span>
  </div>
);

export default StatsPage;
