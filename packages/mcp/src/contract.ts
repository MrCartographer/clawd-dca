// Read-only client + calldata builders for CLAWDdcaV3 on Base.
// Intentionally has no private-key handling — agents bring their own signer.

import {
  createPublicClient,
  encodeFunctionData,
  encodePacked,
  formatUnits,
  http,
  isAddress,
  parseAbi,
} from "viem";
import { base } from "viem/chains";

export const V3_ADDRESS = "0xDB5Da5B9C55D5FC72EB19692aB41Aabbc46278AC" as const;
export const V3_DEPLOY_BLOCK = 46483901n;

export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const CLAWD_ADDRESS = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07" as const;
export const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const;
export const QUOTER_ADDRESS = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as const;
export const SWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481" as const;

export const KEEPER_FEE_BPS = 10n;
export const PROTOCOL_FEE_BPS = 10n;
export const BURN_FEE_BPS = 10n;
export const TOTAL_FEE_BPS = 30n;
export const BPS_DENOMINATOR = 10_000n;
export const MIN_AMOUNT_PER_SWAP_USDC = 1_000_000n;
export const DEFAULT_SLIPPAGE_BPS = 300n;
export const MAX_SLIPPAGE_BPS = 1_000n;
export const DEFAULT_USDC_WETH_FEE = 500;
export const COMMON_WETH_TARGET_FEES = [500, 3_000, 10_000] as const;

const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";

export const client = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

// ─── ABI fragments we actually use ───────────────────────────────────────────

const DCA_ABI = parseAbi([
  "function nextPositionId() view returns (uint256)",
  "function currentEpoch() view returns (uint256)",
  "function paused() view returns (bool)",
  "function protocolFeeBalance() view returns (uint256)",
  "function burnFeeBalance() view returns (uint256)",
  "function owner() view returns (address)",
  "function positions(uint256) view returns (address owner, address targetToken, bytes swapPath, uint256 usdcBalance, uint256 tokenAccrued, uint256 amountPerSwap, uint256 intervalInEpochs, uint256 lastExecutedEpoch, uint256 slippageBps, bool active)",
  "function getPositionsByOwner(address) view returns (uint256[])",
  "function isRipe(uint256) view returns (bool)",
  "function getRipePositions(uint256[]) view returns (uint256[])",
  "function executeDCA(uint256) returns (uint256)",
  "function executeDCAWithMin(uint256, uint256) returns (uint256)",
  "function executeBatch(uint256[]) returns (uint256[])",
  "function executeBurn() returns (uint256)",
  "function withdrawToken(uint256)",
  "function closePosition(uint256)",
  "function createPositionViaWETH(uint256, uint256, uint256, address, uint24, uint24, uint256) returns (uint256)",
  "function createPosition(uint256, uint256, uint256, address, bytes, uint256) returns (uint256)",
]);

const QUOTER_ABI = parseAbi([
  "function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);

const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);

// ─── Reads ─────────────────────────────────────────────────────────────────────

export async function getEngineState() {
  const [nextPositionId, currentEpoch, paused, protocolFeeBalance, burnFeeBalance, owner] = await Promise.all([
    client.readContract({ address: V3_ADDRESS, abi: DCA_ABI, functionName: "nextPositionId" }),
    client.readContract({ address: V3_ADDRESS, abi: DCA_ABI, functionName: "currentEpoch" }),
    client.readContract({ address: V3_ADDRESS, abi: DCA_ABI, functionName: "paused" }),
    client.readContract({ address: V3_ADDRESS, abi: DCA_ABI, functionName: "protocolFeeBalance" }),
    client.readContract({ address: V3_ADDRESS, abi: DCA_ABI, functionName: "burnFeeBalance" }),
    client.readContract({ address: V3_ADDRESS, abi: DCA_ABI, functionName: "owner" }),
  ]);
  return {
    contract: V3_ADDRESS,
    chain: "base",
    chainId: 8453,
    nextPositionId: nextPositionId.toString(),
    positionsCreatedTotal: nextPositionId.toString(),
    currentEpoch: currentEpoch.toString(),
    paused,
    protocolFeeBalanceUsdc: formatUnits(protocolFeeBalance, 6),
    burnFeeBalanceUsdc: formatUnits(burnFeeBalance, 6),
    contractOwner: owner,
    fees: {
      keeperBps: Number(KEEPER_FEE_BPS),
      protocolBps: Number(PROTOCOL_FEE_BPS),
      burnBps: Number(BURN_FEE_BPS),
      totalBps: Number(TOTAL_FEE_BPS),
    },
  };
}

export async function getPosition(id: bigint) {
  const p = await client.readContract({
    address: V3_ADDRESS,
    abi: DCA_ABI,
    functionName: "positions",
    args: [id],
  });
  const [
    owner,
    targetToken,
    swapPath,
    usdcBalance,
    tokenAccrued,
    amountPerSwap,
    intervalInEpochs,
    lastExecutedEpoch,
    slippageBps,
    active,
  ] = p;

  // Enrich with target token symbol/decimals if we can
  let targetSymbol: string | undefined;
  let targetDecimals: number | undefined;
  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: targetToken, abi: ERC20_ABI, functionName: "symbol" }),
      client.readContract({ address: targetToken, abi: ERC20_ABI, functionName: "decimals" }),
    ]);
    targetSymbol = symbol;
    targetDecimals = decimals;
  } catch {
    // non-fatal — leave undefined
  }

  const isRipe = await client.readContract({
    address: V3_ADDRESS,
    abi: DCA_ABI,
    functionName: "isRipe",
    args: [id],
  });

  return {
    id: id.toString(),
    owner,
    targetToken,
    targetSymbol,
    targetDecimals,
    swapPath,
    usdcBalance: usdcBalance.toString(),
    usdcBalanceFormatted: formatUnits(usdcBalance, 6),
    tokenAccrued: tokenAccrued.toString(),
    tokenAccruedFormatted: targetDecimals !== undefined ? formatUnits(tokenAccrued, targetDecimals) : undefined,
    amountPerSwap: amountPerSwap.toString(),
    amountPerSwapFormatted: formatUnits(amountPerSwap, 6),
    intervalInEpochs: intervalInEpochs.toString(),
    intervalHours: Number(intervalInEpochs) * 3,
    lastExecutedEpoch: lastExecutedEpoch.toString(),
    slippageBps: Number(slippageBps),
    active,
    isRipe,
  };
}

export async function getPositionsByOwner(owner: `0x${string}`) {
  const ids = await client.readContract({
    address: V3_ADDRESS,
    abi: DCA_ABI,
    functionName: "getPositionsByOwner",
    args: [owner],
  });
  return ids.map(id => id.toString());
}

export async function getRipePositions() {
  // Enumerate via nextPositionId + getRipePositions filter
  const nextId = await client.readContract({
    address: V3_ADDRESS,
    abi: DCA_ABI,
    functionName: "nextPositionId",
  });
  const allIds = Array.from({ length: Number(nextId) }, (_, i) => BigInt(i));
  if (allIds.length === 0) return [];
  const ripe = await client.readContract({
    address: V3_ADDRESS,
    abi: DCA_ABI,
    functionName: "getRipePositions",
    args: [allIds],
  });
  // For each ripe position, attempt to simulate execution to filter dead pools
  const executable: string[] = [];
  for (const id of ripe) {
    try {
      await client.simulateContract({
        address: V3_ADDRESS,
        abi: DCA_ABI,
        functionName: "executeDCA",
        args: [id],
      });
      executable.push(id.toString());
    } catch {
      // skip — likely dead pool tier
    }
  }
  return executable;
}

export async function quoteSwap(targetToken: `0x${string}`, amountUsdc: bigint, wethTargetFee: number) {
  const isWeth = targetToken.toLowerCase() === WETH_ADDRESS.toLowerCase();
  const path = isWeth
    ? encodePacked(["address", "uint24", "address"], [USDC_ADDRESS, DEFAULT_USDC_WETH_FEE, WETH_ADDRESS])
    : encodePacked(
        ["address", "uint24", "address", "uint24", "address"],
        [USDC_ADDRESS, DEFAULT_USDC_WETH_FEE, WETH_ADDRESS, wethTargetFee, targetToken],
      );
  try {
    const { result } = await client.simulateContract({
      address: QUOTER_ADDRESS,
      abi: QUOTER_ABI,
      functionName: "quoteExactInput",
      args: [path, amountUsdc],
    });
    return { ok: true, amountOut: result[0].toString(), path };
  } catch (e: any) {
    return { ok: false, error: e.shortMessage ?? "quoter reverted", path };
  }
}

export async function validateFeeTiers(targetToken: `0x${string}`) {
  if (!isAddress(targetToken)) throw new Error("invalid target token");
  if (targetToken.toLowerCase() === USDC_ADDRESS.toLowerCase()) throw new Error("target cannot be USDC");
  const probeAmount = MIN_AMOUNT_PER_SWAP_USDC;
  const isWeth = targetToken.toLowerCase() === WETH_ADDRESS.toLowerCase();
  if (isWeth) {
    const q = await quoteSwap(targetToken, probeAmount, 0);
    return [{ fee: DEFAULT_USDC_WETH_FEE, valid: q.ok, expectedOut: q.ok ? q.amountOut : null }];
  }
  return Promise.all(
    COMMON_WETH_TARGET_FEES.map(async fee => {
      const q = await quoteSwap(targetToken, probeAmount, fee);
      return { fee, valid: q.ok, expectedOut: q.ok ? q.amountOut : null };
    }),
  );
}

// ─── Calldata builders ─────────────────────────────────────────────────────────

export function buildCreatePositionViaWethCalldata(args: {
  totalUSDC: bigint;
  amountPerSwap: bigint;
  intervalInEpochs: bigint;
  targetToken: `0x${string}`;
  usdcWethFee: number;
  wethTargetFee: number;
  slippageBps: bigint;
}) {
  return encodeFunctionData({
    abi: DCA_ABI,
    functionName: "createPositionViaWETH",
    args: [
      args.totalUSDC,
      args.amountPerSwap,
      args.intervalInEpochs,
      args.targetToken,
      args.usdcWethFee,
      args.wethTargetFee,
      args.slippageBps,
    ],
  });
}

export function buildExecuteDcaCalldata(positionId: bigint, amountOutMinimum?: bigint) {
  if (amountOutMinimum !== undefined) {
    return encodeFunctionData({
      abi: DCA_ABI,
      functionName: "executeDCAWithMin",
      args: [positionId, amountOutMinimum],
    });
  }
  return encodeFunctionData({
    abi: DCA_ABI,
    functionName: "executeDCA",
    args: [positionId],
  });
}

export function buildExecuteBurnCalldata() {
  return encodeFunctionData({ abi: DCA_ABI, functionName: "executeBurn" });
}

export function buildWithdrawTokenCalldata(positionId: bigint) {
  return encodeFunctionData({ abi: DCA_ABI, functionName: "withdrawToken", args: [positionId] });
}

export function buildClosePositionCalldata(positionId: bigint) {
  return encodeFunctionData({ abi: DCA_ABI, functionName: "closePosition", args: [positionId] });
}
