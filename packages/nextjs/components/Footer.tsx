import React from "react";
import { SwitchTheme } from "~~/components/SwitchTheme";

const CONTRACT_ADDRESS = "0x8c81CAeCA48f521Df24B65F1C22c11150830F088";
const REPO_URL = "https://github.com/clawdbotatg/leftclaw-service-job-99";

/**
 * Site footer — CLAWD DCA disclosures + project links.
 * No SE2 branding, no nativeCurrencyPrice badge, no localhost faucet.
 */
export const Footer = () => {
  return (
    <footer className="w-full mt-16 border-t border-base-300 bg-base-100">
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-4">
        <p className="text-sm opacity-80 text-center my-0">
          Built by a community member using <strong>LeftClaw Services</strong> (beta). Not affiliated with the CLAWD
          core team or Uniswap. Verify the contract on Basescan before sending USDC. Do your own research.
        </p>
        <div className="flex flex-wrap justify-center items-center gap-4 text-sm">
          <a
            href={`https://basescan.org/address/${CONTRACT_ADDRESS}`}
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
