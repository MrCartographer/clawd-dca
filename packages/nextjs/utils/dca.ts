import { formatUnits } from "viem";

// CLAWDdca v3 — generalized DCA engine on Base. Any ERC-20 with USDC liquidity
// can be a target token. Verified at 0xDB5Da5B9C55D5FC72EB19692aB41Aabbc46278AC.
// Constants hardcoded here so we don't pay an extra eth_call on every page mount.
export const EPOCH_DURATION_SECONDS = 3 * 60 * 60; // 3 hours
export const KEEPER_FEE_BPS = 10n; // 0.10% (v3 — was 0.20% in v2, 0.39% in v1)
export const PROTOCOL_FEE_BPS = 10n; // 0.10%
export const BURN_FEE_BPS = 10n; // 0.10% — accrues USDC, swept to CLAWD via permissionless executeBurn()
export const TOTAL_FEE_BPS = KEEPER_FEE_BPS + PROTOCOL_FEE_BPS + BURN_FEE_BPS; // 30 bps
export const BPS_DENOMINATOR = 10_000n;
export const DEFAULT_SLIPPAGE_BPS = 300n; // 3.00%
export const MAX_SLIPPAGE_BPS = 1_000n; // 10.00%
export const MIN_AMOUNT_PER_SWAP_USDC = 1_000_000n; // 1 USDC (6 decimals)

// v3 contract
export const CLAWDDCA_ADDRESS = "0xDB5Da5B9C55D5FC72EB19692aB41Aabbc46278AC" as const;
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const CLAWD_ADDRESS = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07" as const;
export const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const;
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

export const USDC_DECIMALS = 6;
export const CLAWD_DECIMALS = 18;

// Block where CLAWDdca v3 was deployed on Base — used as `fromBlock` for event queries.
export const DEPLOYED_ON_BLOCK = 46483901n;

// Retired contracts (for memorial section + reference)
export const V1_ADDRESS = "0x8c81CAeCA48f521Df24B65F1C22c11150830F088" as const;
export const V2_ADDRESS = "0xa16095e72936aD6DAb012ec1b95222F6FCB5f5C2" as const;

// Default Uniswap V3 fee tiers used by createPositionViaWETH.
// USDC/WETH 0.05% pool is the deepest. WETH/<target> depends on the token —
// 1% works for most memecoins (including CLAWD), 0.3% for blue chips.
export const DEFAULT_USDC_WETH_FEE = 500; // 0.05%
export const DEFAULT_WETH_TARGET_FEE = 10_000; // 1.00%
export const COMMON_WETH_TARGET_FEES: { fee: number; label: string }[] = [
  { fee: 500, label: "0.05% (blue-chip stables)" },
  { fee: 3_000, label: "0.30% (most major tokens)" },
  { fee: 10_000, label: "1.00% (memecoins / low-liq)" },
];

// Curated quick-pick tokens for the Create page. Anyone can paste an arbitrary
// address; this list is just convenience for the most-DCA'd Base tokens.
export type TokenPreset = {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  defaultWethFee?: number;
};
export const TOKEN_PRESETS: TokenPreset[] = [
  {
    symbol: "CLAWD",
    name: "CLAWD",
    address: CLAWD_ADDRESS,
    decimals: 18,
    defaultWethFee: 10_000,
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: WETH_ADDRESS,
    decimals: 18,
  },
  {
    symbol: "AERO",
    name: "Aerodrome",
    address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
    decimals: 18,
    defaultWethFee: 3_000,
  },
  {
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    decimals: 8,
    defaultWethFee: 500,
  },
];

export type IntervalPreset = {
  key: "3h" | "daily" | "weekly" | "custom";
  label: string;
  description: string;
  intervalInEpochs: number; // 1 epoch = 3 hours
};

export const INTERVAL_PRESETS: IntervalPreset[] = [
  {
    key: "3h",
    label: "Every 3 hours",
    description: "Aggressive — 8 swaps per day",
    intervalInEpochs: 1,
  },
  {
    key: "daily",
    label: "Daily DCA",
    description: "1 swap per day, the classic",
    intervalInEpochs: 8,
  },
  {
    key: "weekly",
    label: "Weekly accumulation",
    description: "1 swap per week, slow & steady",
    intervalInEpochs: 56,
  },
  {
    key: "custom",
    label: "Custom",
    description: "Pick any cadence",
    intervalInEpochs: 1,
  },
];

export const intervalLabel = (intervalInEpochs: bigint | number): string => {
  const n = Number(intervalInEpochs);
  if (n === 1) return "Every 3 hrs";
  if (n === 8) return "Daily";
  if (n === 56) return "Weekly";
  const hours = n * 3;
  if (hours % 24 === 0) {
    return `Every ${hours / 24} days`;
  }
  return `Every ${n} epochs (${hours} hrs)`;
};

export const formatUsdc = (raw: bigint | undefined): string => {
  if (raw === undefined) return "—";
  const v = Number(formatUnits(raw, USDC_DECIMALS));
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Format an amount with a given decimals. Used for any target token.
export const formatToken = (raw: bigint | undefined, decimals = 18): string => {
  if (raw === undefined) return "—";
  const v = Number(formatUnits(raw, decimals));
  if (v === 0) return "0";
  if (v < 0.0001) return v.toExponential(2);
  if (v < 1) return v.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
};

// CLAWD-specific helper kept for the stats page (lifetime CLAWD burned, etc).
export const formatClawd = (raw: bigint | undefined): string => formatToken(raw, CLAWD_DECIMALS);

export const formatBps = (bps: bigint | number | undefined): string => {
  if (bps === undefined) return "—";
  return `${(Number(bps) / 100).toFixed(2)}%`;
};

export const epochToDate = (currentEpoch: bigint, targetEpoch: bigint): Date => {
  const epochsAhead = Number(targetEpoch - currentEpoch);
  const ms = Date.now() + epochsAhead * EPOCH_DURATION_SECONDS * 1000;
  return new Date(ms);
};

export const formatCountdown = (seconds: number): string => {
  if (seconds <= 0) return "ready now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export const shortAddress = (addr: string | undefined): string => {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
};
