"use client";

import React from "react";
import { Address as AddressComp } from "@scaffold-ui/components";
import { base } from "viem/chains";
import { SwitchTheme } from "~~/components/SwitchTheme";
import { CLAWDDCA_ADDRESS, CLAWD_ADDRESS, USDC_ADDRESS } from "~~/utils/dca";

const REPO_URL = "https://github.com/clawdbotatg/leftclaw-service-job-99";

/**
 * Site footer — CLAWD DCA disclosures + project links.
 * No SE2 branding, no nativeCurrencyPrice badge, no localhost faucet.
 */
export const Footer = () => {
  return (
    <footer className="w-full mt-16 border-t border-base-300 bg-base-100">
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2">
          <h4 className="text-sm font-bold uppercase tracking-wide opacity-70 my-0">Contracts</h4>
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="opacity-60 w-24">CLAWD DCA:</span>
              <AddressComp address={CLAWDDCA_ADDRESS} format="short" size="sm" chain={base} />
            </div>
            <div className="flex items-center gap-2">
              <span className="opacity-60 w-24">USDC:</span>
              <AddressComp address={USDC_ADDRESS} format="short" size="sm" chain={base} />
            </div>
            <div className="flex items-center gap-2">
              <span className="opacity-60 w-24">CLAWD:</span>
              <AddressComp address={CLAWD_ADDRESS} format="short" size="sm" chain={base} />
            </div>
          </div>
        </div>
        <p className="text-sm opacity-80 text-center my-0">
          Built by a community member using <strong>LeftClaw Services</strong> (beta). Not affiliated with the CLAWD
          core team or Uniswap. Verify the contract on Basescan before sending USDC. Do your own research.
        </p>
        <div className="flex flex-wrap justify-center items-center gap-4 text-sm">
          <a
            href={`https://basescan.org/address/${CLAWDDCA_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="link"
          >
            Contract on Basescan
          </a>
          <span className="opacity-50">·</span>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="link">
            GitHub
          </a>
          <span className="opacity-50">·</span>
          <a href="https://leftclaw.services" target="_blank" rel="noreferrer" className="link">
            LeftClaw Services
          </a>
          <span className="opacity-50">·</span>
          <SwitchTheme />
        </div>
      </div>
    </footer>
  );
};
