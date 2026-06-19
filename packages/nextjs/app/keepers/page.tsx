"use client";

import dynamic from "next/dynamic";

const Keepers = dynamic(() => import("../_components/Keepers"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center grow py-32 gap-3">
      <div className="shimmer w-12 h-12 rounded-full" />
      <div className="text-[color:var(--text-3)] text-sm">Loading keepers…</div>
    </div>
  ),
});

const KeepersPage = () => <Keepers />;

export default KeepersPage;
