"use client";

import dynamic from "next/dynamic";

const CreatePosition = dynamic(() => import("../_components/CreatePosition"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center grow py-32 gap-3">
      <div className="shimmer w-12 h-12 rounded-full" />
      <div className="text-[color:var(--text-3)] text-sm">Loading…</div>
    </div>
  ),
});

const CreatePage = () => <CreatePosition />;

export default CreatePage;
