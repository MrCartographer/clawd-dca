"use client";

import { useEffect, useState } from "react";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="relative flex flex-col flex-1">{children}</main>
        <Footer />
      </div>
      <Toaster />
    </>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid initializing wagmi/RainbowKit during the static prerender pass.
  // Some downstream connector code throws on `Cannot read properties of
  // undefined (reading 'data')` when there's no real browser context. Once
  // the client mounts, the full provider tree renders.
  if (!mounted) {
    return (
      <div className="flex flex-col min-h-screen">
        <main className="relative flex flex-col flex-1">{children}</main>
      </div>
    );
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemedRainbowKit>
          <ProgressBar height="2px" color="#9a9893" />
          <ScaffoldEthApp>{children}</ScaffoldEthApp>
        </ThemedRainbowKit>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

const ThemedRainbowKit = ({ children }: { children: React.ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";
  const baseRk = {
    accentColor: isLight ? "#1c1d22" : "#e8e6e3",
    accentColorForeground: isLight ? "#ffffff" : "#0a0a0c",
    borderRadius: "large" as const,
    fontStack: "system" as const,
  };
  const theme = isLight ? lightTheme(baseRk) : darkTheme(baseRk);
  return (
    <RainbowKitProvider avatar={BlockieAvatar} theme={theme}>
      {children}
    </RainbowKitProvider>
  );
};
