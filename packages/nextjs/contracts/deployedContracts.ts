/**
 * Hand-maintained ABI for CLAWDdcaV3 on Base (chain 8453).
 * Source: https://basescan.org/address/0xDB5Da5B9C55D5FC72EB19692aB41Aabbc46278AC
 *
 * The contract name stays "CLAWDdca" so the existing useScaffoldReadContract /
 * useScaffoldWriteContract / useScaffoldEventHistory call sites don't need
 * mass-renaming. Only the ABI + address change between versions.
 */
import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

const deployedContracts = {
  8453: {
    CLAWDdca: {
      address: "0xDB5Da5B9C55D5FC72EB19692aB41Aabbc46278AC",
      abi: [
        {
          type: "constructor",
          inputs: [
            { name: "initialOwner", type: "address", internalType: "address" },
            { name: "initialBurnSwapPath", type: "bytes", internalType: "bytes" },
          ],
          stateMutability: "nonpayable",
        },
        // ───── public constants ─────
        { type: "function", name: "USDC", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
        { type: "function", name: "CLAWD", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
        { type: "function", name: "WETH", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
        { type: "function", name: "SWAP_ROUTER", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
        { type: "function", name: "QUOTER", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
        { type: "function", name: "BURN_ADDRESS", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
        { type: "function", name: "EPOCH_DURATION", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "KEEPER_FEE_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "PROTOCOL_FEE_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "BURN_FEE_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "DEFAULT_SLIPPAGE_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "MAX_SLIPPAGE_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "BPS_DENOMINATOR", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "MIN_AMOUNT_PER_SWAP", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        // ───── storage views ─────
        { type: "function", name: "nextPositionId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "protocolFeeBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "burnFeeBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "burnSwapPath", stateMutability: "view", inputs: [], outputs: [{ type: "bytes" }] },
        { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
        { type: "function", name: "pendingOwner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
        { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
        {
          type: "function",
          name: "positions",
          stateMutability: "view",
          inputs: [{ type: "uint256" }],
          outputs: [
            { name: "owner", type: "address" },
            { name: "targetToken", type: "address" },
            { name: "swapPath", type: "bytes" },
            { name: "usdcBalance", type: "uint256" },
            { name: "tokenAccrued", type: "uint256" },
            { name: "amountPerSwap", type: "uint256" },
            { name: "intervalInEpochs", type: "uint256" },
            { name: "lastExecutedEpoch", type: "uint256" },
            { name: "slippageBps", type: "uint256" },
            { name: "active", type: "bool" },
          ],
        },
        {
          type: "function",
          name: "getPosition",
          stateMutability: "view",
          inputs: [{ name: "positionId", type: "uint256" }],
          outputs: [
            {
              type: "tuple",
              components: [
                { name: "owner", type: "address" },
                { name: "targetToken", type: "address" },
                { name: "swapPath", type: "bytes" },
                { name: "usdcBalance", type: "uint256" },
                { name: "tokenAccrued", type: "uint256" },
                { name: "amountPerSwap", type: "uint256" },
                { name: "intervalInEpochs", type: "uint256" },
                { name: "lastExecutedEpoch", type: "uint256" },
                { name: "slippageBps", type: "uint256" },
                { name: "active", type: "bool" },
              ],
            },
          ],
        },
        { type: "function", name: "positionsByOwner", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
        { type: "function", name: "getPositionsByOwner", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256[]" }] },
        { type: "function", name: "currentEpoch", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "isRipe", stateMutability: "view", inputs: [{ name: "positionId", type: "uint256" }], outputs: [{ type: "bool" }] },
        { type: "function", name: "getRipePositions", stateMutability: "view", inputs: [{ name: "positionIds", type: "uint256[]" }], outputs: [{ name: "ripe", type: "uint256[]" }] },
        // ───── position lifecycle ─────
        {
          type: "function",
          name: "createPosition",
          stateMutability: "nonpayable",
          inputs: [
            { name: "totalUSDC", type: "uint256" },
            { name: "amountPerSwap", type: "uint256" },
            { name: "intervalInEpochs", type: "uint256" },
            { name: "targetToken", type: "address" },
            { name: "swapPath", type: "bytes" },
            { name: "slippageBps", type: "uint256" },
          ],
          outputs: [{ name: "positionId", type: "uint256" }],
        },
        {
          type: "function",
          name: "createPositionViaWETH",
          stateMutability: "nonpayable",
          inputs: [
            { name: "totalUSDC", type: "uint256" },
            { name: "amountPerSwap", type: "uint256" },
            { name: "intervalInEpochs", type: "uint256" },
            { name: "targetToken", type: "address" },
            { name: "usdcWethFee", type: "uint24" },
            { name: "wethTargetFee", type: "uint24" },
            { name: "slippageBps", type: "uint256" },
          ],
          outputs: [{ name: "positionId", type: "uint256" }],
        },
        { type: "function", name: "executeDCA", stateMutability: "nonpayable", inputs: [{ name: "positionId", type: "uint256" }], outputs: [{ name: "tokenReceived", type: "uint256" }] },
        { type: "function", name: "executeDCAWithMin", stateMutability: "nonpayable", inputs: [{ name: "positionId", type: "uint256" }, { name: "amountOutMinimum", type: "uint256" }], outputs: [{ name: "tokenReceived", type: "uint256" }] },
        { type: "function", name: "executeBatch", stateMutability: "nonpayable", inputs: [{ name: "positionIds", type: "uint256[]" }], outputs: [{ name: "results", type: "uint256[]" }] },
        { type: "function", name: "withdrawToken", stateMutability: "nonpayable", inputs: [{ name: "positionId", type: "uint256" }], outputs: [] },
        { type: "function", name: "closePosition", stateMutability: "nonpayable", inputs: [{ name: "positionId", type: "uint256" }], outputs: [] },
        { type: "function", name: "executeBurn", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "clawdBurned", type: "uint256" }] },
        // ───── owner-only ─────
        { type: "function", name: "withdrawProtocolFees", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }], outputs: [] },
        { type: "function", name: "setBurnSwapPath", stateMutability: "nonpayable", inputs: [{ name: "newPath", type: "bytes" }], outputs: [] },
        { type: "function", name: "pause", stateMutability: "nonpayable", inputs: [], outputs: [] },
        { type: "function", name: "unpause", stateMutability: "nonpayable", inputs: [], outputs: [] },
        { type: "function", name: "transferOwnership", stateMutability: "nonpayable", inputs: [{ name: "newOwner", type: "address" }], outputs: [] },
        { type: "function", name: "acceptOwnership", stateMutability: "nonpayable", inputs: [], outputs: [] },
        // ───── events ─────
        {
          type: "event",
          name: "PositionCreated",
          inputs: [
            { name: "positionId", type: "uint256", indexed: true },
            { name: "owner", type: "address", indexed: true },
            { name: "targetToken", type: "address", indexed: true },
            { name: "totalUSDC", type: "uint256", indexed: false },
            { name: "amountPerSwap", type: "uint256", indexed: false },
            { name: "intervalInEpochs", type: "uint256", indexed: false },
            { name: "slippageBps", type: "uint256", indexed: false },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "PositionExecuted",
          inputs: [
            { name: "positionId", type: "uint256", indexed: true },
            { name: "keeper", type: "address", indexed: true },
            { name: "amountSwapped", type: "uint256", indexed: false },
            { name: "tokenReceived", type: "uint256", indexed: false },
            { name: "keeperFee", type: "uint256", indexed: false },
            { name: "epoch", type: "uint256", indexed: false },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "PositionClosed",
          inputs: [
            { name: "positionId", type: "uint256", indexed: true },
            { name: "closedBy", type: "address", indexed: true },
            { name: "usdcRefunded", type: "uint256", indexed: false },
            { name: "tokenRefunded", type: "uint256", indexed: false },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "TokenWithdrawn",
          inputs: [
            { name: "positionId", type: "uint256", indexed: true },
            { name: "owner", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "BurnExecuted",
          inputs: [
            { name: "executor", type: "address", indexed: true },
            { name: "usdcIn", type: "uint256", indexed: false },
            { name: "clawdBurned", type: "uint256", indexed: false },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "ProtocolFeesWithdrawn",
          inputs: [
            { name: "to", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "BurnSwapPathUpdated",
          inputs: [{ name: "newPath", type: "bytes", indexed: false }],
          anonymous: false,
        },
        { type: "event", name: "Paused", inputs: [{ name: "account", type: "address", indexed: false }], anonymous: false },
        { type: "event", name: "Unpaused", inputs: [{ name: "account", type: "address", indexed: false }], anonymous: false },
        {
          type: "event",
          name: "OwnershipTransferred",
          inputs: [
            { name: "previousOwner", type: "address", indexed: true },
            { name: "newOwner", type: "address", indexed: true },
          ],
          anonymous: false,
        },
        {
          type: "event",
          name: "OwnershipTransferStarted",
          inputs: [
            { name: "previousOwner", type: "address", indexed: true },
            { name: "newOwner", type: "address", indexed: true },
          ],
          anonymous: false,
        },
        // ───── custom errors ─────
        { type: "error", name: "InvalidAmount", inputs: [] },
        { type: "error", name: "InvalidInterval", inputs: [] },
        { type: "error", name: "InvalidPath", inputs: [] },
        { type: "error", name: "InvalidSlippage", inputs: [] },
        { type: "error", name: "PathTokenMismatch", inputs: [] },
        { type: "error", name: "InvalidTargetToken", inputs: [] },
        { type: "error", name: "NotPositionOwner", inputs: [] },
        { type: "error", name: "NotOwnerOrPositionOwner", inputs: [] },
        { type: "error", name: "PositionInactive", inputs: [] },
        { type: "error", name: "PositionNotRipe", inputs: [] },
        { type: "error", name: "InsufficientBalance", inputs: [] },
        { type: "error", name: "NothingToWithdraw", inputs: [] },
        { type: "error", name: "NothingToBurn", inputs: [] },
        { type: "error", name: "BurnPathNotSet", inputs: [] },
        { type: "error", name: "EmptyBatch", inputs: [] },
      ],
      inheritedFunctions: {},
      deployedOnBlock: 46483901,
    },
  },
} as const;

export default deployedContracts satisfies GenericContractsDeclaration;
