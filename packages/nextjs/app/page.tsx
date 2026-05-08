"use client";

import dynamic from "next/dynamic";
import Image from "next/image";

// Render the dashboard client-only — wagmi/RainbowKit hooks call `useConfig`
// at component init, which throws during static export prerender. ssr:false
// here means "skip prerender", so the static export emits the layout shell
// and hydrates the dashboard once the bundle loads in the browser.
const Dashboard = dynamic(() => import("./_components/Dashboard"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center grow py-20 gap-3">
      <span className="relative inline-block w-14 h-14 rounded-full overflow-hidden ring-1 ring-[color:var(--ink-gray-40)] animate-pulse">
        <Image src="/clawd-pfp.png" alt="CLAWD" fill sizes="56px" className="object-cover" priority />
      </span>
      <div className="opacity-60 text-sm">Loading CLAWD DCA…</div>
    </div>
  ),
});

const Home = () => <Dashboard />;

export default Home;
