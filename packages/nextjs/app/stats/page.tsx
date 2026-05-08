"use client";

import dynamic from "next/dynamic";
import Image from "next/image";

const Stats = dynamic(() => import("../_components/Stats"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center grow py-20 gap-3">
      <span className="relative inline-block w-14 h-14 rounded-full overflow-hidden ring-1 ring-[color:var(--ink-gray-40)] animate-pulse">
        <Image src="/clawd-pfp.png" alt="CLAWD" fill sizes="56px" className="object-cover" priority />
      </span>
      <div className="opacity-60 text-sm">Loading…</div>
    </div>
  ),
});

const StatsPage = () => <Stats />;

export default StatsPage;
