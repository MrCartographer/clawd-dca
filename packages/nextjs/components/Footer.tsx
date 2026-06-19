"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Address as AddressComp } from "@scaffold-ui/components";
import { base } from "viem/chains";
import { CLAWDDCA_ADDRESS, CLAWD_ADDRESS, USDC_ADDRESS, V1_ADDRESS, V2_ADDRESS } from "~~/utils/dca";

const REPO_URL = "https://github.com/clawdbotatg/leftclaw-service-job-99";

export const Footer = () => {
  return (
    <footer className="w-full mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 py-12 border-t border-[color:var(--line-soft)]">
          <div className="col-span-2 md:col-span-1 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="relative inline-block w-9 h-9 rounded-full overflow-hidden ring-1 ring-[color:var(--clawd-line)] bg-[color:var(--surface-1)]">
                <Image src="/clawd-original.jpg" alt="CLAWD" fill sizes="36px" className="object-cover" />
              </span>
              <div className="flex flex-col leading-tight">
                <span className="font-semibold tracking-tight">CLAWD DCA</span>
                <span className="text-[11px] text-[color:var(--text-2)]">Permissionless · Base</span>
              </div>
            </div>
            <p className="text-xs text-[color:var(--text-2)] leading-relaxed mt-2">
              Built by a community member with{" "}
              <a href="https://leftclaw.services" target="_blank" rel="noreferrer" className="link">
                LeftClaw Services
              </a>
              . Not affiliated with CLAWD or Uniswap. Verify on Basescan. Do your own research.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-2)]">Engine</h4>
            <Link href="/" className="text-sm hover:opacity-80">
              Dashboard
            </Link>
            <Link href="/create" className="text-sm hover:opacity-80">
              Create position
            </Link>
            <Link href="/keepers" className="text-sm hover:opacity-80">
              Keepers
            </Link>
            <Link href="/stats" className="text-sm hover:opacity-80">
              Stats
            </Link>
            <Link href="/why-dca" className="text-sm hover:opacity-80">
              Why DCA
            </Link>
          </div>

          <div className="flex flex-col gap-2.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-2)]">
              Contracts
            </h4>
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[color:var(--text-3)] w-12">v3</span>
                <AddressComp address={CLAWDDCA_ADDRESS} format="short" size="xs" chain={base} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[color:var(--text-3)] w-12">v2</span>
                <AddressComp address={V2_ADDRESS} format="short" size="xs" chain={base} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[color:var(--text-3)] w-12">v1</span>
                <AddressComp address={V1_ADDRESS} format="short" size="xs" chain={base} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[color:var(--text-3)] w-12">USDC</span>
                <AddressComp address={USDC_ADDRESS} format="short" size="xs" chain={base} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[color:var(--text-3)] w-12">CLAWD</span>
                <AddressComp address={CLAWD_ADDRESS} format="short" size="xs" chain={base} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-2)]">Build</h4>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-sm hover:opacity-80">
              GitHub
            </a>
            <a
              href={`https://basescan.org/address/${CLAWDDCA_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm hover:opacity-80"
            >
              Basescan
            </a>
            <a href="https://leftclaw.services" target="_blank" rel="noreferrer" className="text-sm hover:opacity-80">
              LeftClaw Services
            </a>
          </div>
        </div>

        <div className="flex items-center justify-between py-5 border-t border-[color:var(--line-soft)] text-[11px] text-[color:var(--text-3)]">
          <span>© {new Date().getFullYear()} CLAWD DCA Engine — open source, MIT.</span>
          <span className="hidden sm:inline">No custody. No KYC. Just bigger bags. 🦞</span>
        </div>
      </div>
    </footer>
  );
};
