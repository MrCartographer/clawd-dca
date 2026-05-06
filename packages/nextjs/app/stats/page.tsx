"use client";

import dynamic from "next/dynamic";

const Stats = dynamic(() => import("../_components/Stats"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center grow py-20 gap-3">
      <div className="text-4xl">🦞</div>
      <div className="opacity-60 text-sm">Loading…</div>
    </div>
  ),
});

const StatsPage = () => <Stats />;

export default StatsPage;
