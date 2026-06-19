"use client";

import { Address as AddressComp } from "@scaffold-ui/components";
import { base } from "viem/chains";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import { CLAWD_ADDRESS, USDC_ADDRESS, formatClawd, formatUsdc } from "~~/utils/dca";

const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * Wallet strip — connected address + USDC + CLAWD balances + wrong-network nag.
 */
export const WalletStrip = () => {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== base.id;

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    chainId: base.id,
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: clawdBalance } = useReadContract({
    address: CLAWD_ADDRESS,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    chainId: base.id,
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  if (!isConnected) {
    return (
      <div className="surface px-4 py-3 text-sm text-[color:var(--text-2)]">
        <span className="dot dot-pulse text-[color:var(--text-3)] mr-2" /> Connect a wallet to view balances and manage
        positions.
      </div>
    );
  }

  return (
    <div className="surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="dot dot-pulse text-[color:var(--good)]" />
        <span className="text-[color:var(--text-2)]">Connected</span>
        <AddressComp address={address} format="short" size="xs" chain={base} />
      </div>
      <div className="flex items-center gap-5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[color:var(--text-2)] text-xs">USDC</span>
          <span className="font-semibold tabular">${formatUsdc(usdcBalance as bigint | undefined)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[color:var(--text-2)] text-xs">CLAWD</span>
          <span className="font-semibold tabular">{formatClawd(clawdBalance as bigint | undefined)}</span>
        </div>
        {wrongNetwork && (
          <button
            className="btn btn-warning btn-xs"
            disabled={isSwitching}
            onClick={() => switchChain({ chainId: base.id })}
          >
            {isSwitching ? <span className="loading loading-spinner loading-xs" /> : null}
            Switch to Base
          </button>
        )}
      </div>
    </div>
  );
};
