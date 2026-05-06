"use client";

import dynamic from "next/dynamic";

// Render the dashboard client-only — wagmi/RainbowKit hooks call `useConfig`
// at component init, which throws during static export prerender. ssr:false
// here means "skip prerender", so the static export emits the layout shell
// and hydrates the dashboard once the bundle loads in the browser.
const Dashboard = dynamic(() => import("./_components/Dashboard"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center grow py-20 gap-3">
      <div className="text-4xl">🦞</div>
      <div className="opacity-60 text-sm">Loading CLAWD DCA…</div>
    </div>
  ),
});

const Home = () => <Dashboard />;

export default Home;
