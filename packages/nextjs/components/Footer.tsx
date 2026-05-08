"use client";

import React from "react";
import Image from "next/image";
import { Address as AddressComp } from "@scaffold-ui/components";
import { base } from "viem/chains";
import { CLAWDDCA_ADDRESS, CLAWD_ADDRESS, USDC_ADDRESS } from "~~/utils/dca";

const REPO_URL = "https://github.com/clawdbotatg/leftclaw-service-job-99";

/**
 * Site footer — CLAWD DCA disclosures + project links.
 */
export const Footer = () => {
  return (
    <footer className="w-full mt-20 border-t border-[color:var(--ink-gray-40)] bg-base-100/60 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row gap-8 sm:gap-12 items-start">
          <div className="flex items-center gap-3">
            <span className="relative inline-block w-12 h-12 rounded-2xl overflow-hidden ring-1 ring-[color:var(--ink-gray-40)] bg-white">
              <Image src="/clawd-logo.png" alt="CLAWD" fill sizes="48px" className="object-cover" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="font-bold">CLAWD DCA</span>
              <span className="text-xs opacity-60">Stack on autopilot · Base</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <h4 className="text-[11px] font-bold uppercase tracking-widest opacity-60 my-0">Contracts</h4>
            <div className="flex items-center gap-2">
              <span className="opacity-60 w-20 text-xs">CLAWD DCA</span>
              <AddressComp address={CLAWDDCA_ADDRESS} format="short" size="sm" chain={base} />
            </div>
            <div className="flex items-center gap-2">
              <span className="opacity-60 w-20 text-xs">USDC</span>
              <AddressComp address={USDC_ADDRESS} format="short" size="sm" chain={base} />
            </div>
            <div className="flex items-center gap-2">
              <span className="opacity-60 w-20 text-xs">CLAWD</span>
              <AddressComp address={CLAWD_ADDRESS} format="short" size="sm" chain={base} />
            </div>
          </div>
        </div>

        <p className="text-xs sm:text-sm opacity-70 my-0 max-w-3xl leading-relaxed">
          Built by a community member using <strong>LeftClaw Services</strong> (beta). Not affiliated with the CLAWD
          core team or Uniswap. Verify the contract on Basescan before sending USDC. Do your own research.
        </p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm pt-4 border-t border-[color:var(--ink-gray-40)]">
          <a
            href={`https://basescan.org/address/${CLAWDDCA_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="link"
          >
            Contract on Basescan
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="link">
            GitHub
          </a>
          <a href="https://leftclaw.services" target="_blank" rel="noreferrer" className="link">
            LeftClaw Services
          </a>
        </div>
      </div>
    </footer>
  );
};
