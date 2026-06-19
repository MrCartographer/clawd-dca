#!/usr/bin/env node
/**
 * CLAWD DCA — Model Context Protocol server
 *
 * Exposes the CLAWDdcaV3 contract on Base as MCP tools. Read-only by default:
 * agents bring their own wallet and only call the contract via the calldata
 * builders this server returns. Writes never leave the agent.
 *
 * Transports:
 *   - stdio (default) — for Claude Desktop, Cursor, Cline, and any MCP client
 *     that spawns the server as a subprocess. Run with:
 *       node dist/index.js
 *   - http — for remote agents (Vercel Function deployment). Run with:
 *       MCP_TRANSPORT=http PORT=3333 node dist/index.js
 *
 * Tools (see registerTools below for the full list):
 *   - get_engine_state
 *   - get_position(id)
 *   - get_positions_by_owner(address)
 *   - get_ripe_positions
 *   - quote_swap(target, amountUsdc, wethTargetFee)
 *   - validate_fee_tiers(target)
 *   - build_create_position_calldata(...)
 *   - build_execute_dca_calldata(positionId, amountOutMinimum?)
 *   - build_execute_burn_calldata
 *   - build_withdraw_token_calldata(positionId)
 *   - build_close_position_calldata(positionId)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  buildClosePositionCalldata,
  buildCreatePositionViaWethCalldata,
  buildExecuteBurnCalldata,
  buildExecuteDcaCalldata,
  buildWithdrawTokenCalldata,
  COMMON_WETH_TARGET_FEES,
  DEFAULT_SLIPPAGE_BPS,
  DEFAULT_USDC_WETH_FEE,
  getEngineState,
  getPosition,
  getPositionsByOwner,
  getRipePositions,
  MAX_SLIPPAGE_BPS,
  MIN_AMOUNT_PER_SWAP_USDC,
  quoteSwap,
  V3_ADDRESS,
  validateFeeTiers,
} from "./contract.js";

// ─── tool schemas ──────────────────────────────────────────────────────────────
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x-prefixed 20-byte address");
const uintStringSchema = z.string().regex(/^\d+$/, "must be a non-negative integer as a string");

const tools = [
  {
    name: "get_engine_state",
    description:
      "Read the live state of the CLAWD DCA v3 engine: total positions opened, current epoch, paused flag, accrued protocol/burn fees, contract owner, and fee schedule. Cheap snapshot of where the engine is at this block.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async () => getEngineState(),
  },
  {
    name: "get_position",
    description:
      "Read one DCA position by id. Returns the owner, target token (with symbol+decimals when ERC-20 metadata is resolvable), remaining USDC, accrued target, cadence, slippage, active flag, and an is_ripe boolean indicating whether the position is currently executable.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Position id (uint256 as decimal string)" } },
      required: ["id"],
    },
    handler: async ({ id }: { id: string }) => getPosition(BigInt(uintStringSchema.parse(id))),
  },
  {
    name: "get_positions_by_owner",
    description:
      "List all position ids owned by a given address. Includes inactive/closed positions — caller should filter by get_position(...).active if needed.",
    inputSchema: {
      type: "object",
      properties: { owner: { type: "string", description: "0x-prefixed wallet address" } },
      required: ["owner"],
    },
    handler: async ({ owner }: { owner: string }) =>
      getPositionsByOwner(addressSchema.parse(owner) as `0x${string}`),
  },
  {
    name: "get_ripe_positions",
    description:
      "Return position ids that are currently ready to execute AND whose executeDCA simulation passes (i.e. they have a live Uniswap pool to swap into). This is the keeper's job board — anyone calling executeDCAWithMin on these ids earns a 10 bps USDC fee.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async () => getRipePositions(),
  },
  {
    name: "quote_swap",
    description:
      "Off-chain QuoterV2 quote for USDC → WETH → target via the supplied wethTargetFee. Returns expected target output (as raw uint256 string) and the encoded Uniswap V3 path. If quoter reverts, returns { ok: false } — that fee tier has no pool / no liquidity.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Target token address" },
        amount_usdc: { type: "string", description: "USDC input (6 decimals, raw uint256 as string)" },
        weth_target_fee: {
          type: "number",
          description: "Uniswap V3 fee tier for WETH→target hop. Common values: 500, 3000, 10000",
        },
      },
      required: ["target", "amount_usdc", "weth_target_fee"],
    },
    handler: async (args: { target: string; amount_usdc: string; weth_target_fee: number }) =>
      quoteSwap(
        addressSchema.parse(args.target) as `0x${string}`,
        BigInt(uintStringSchema.parse(args.amount_usdc)),
        args.weth_target_fee,
      ),
  },
  {
    name: "validate_fee_tiers",
    description:
      "Probe all common WETH→target fee tiers (500, 3000, 10000) for a given target token using QuoterV2. Returns one entry per tier with { fee, valid, expectedOut }. Use this before building a createPosition calldata so you don't lock funds into a position pointing at a dead pool tier.",
    inputSchema: {
      type: "object",
      properties: { target: { type: "string", description: "Target token address" } },
      required: ["target"],
    },
    handler: async ({ target }: { target: string }) =>
      validateFeeTiers(addressSchema.parse(target) as `0x${string}`),
  },
  {
    name: "build_create_position_calldata",
    description:
      "Build the ABI-encoded calldata for createPositionViaWETH. Returns { to, data, value } the agent passes to its own wallet. The contract pulls USDC via transferFrom, so the caller must have already approved CLAWDdcaV3 to spend `totalUSDC`. The contract builds the swap path: USDC/usdcWethFee/WETH/wethTargetFee/target — or single-hop if target == WETH.",
    inputSchema: {
      type: "object",
      properties: {
        total_usdc: { type: "string", description: "Total USDC to deposit (6-decimals raw)" },
        amount_per_swap: { type: "string", description: "USDC per execution (>= 1_000_000 = 1 USDC)" },
        interval_epochs: { type: "string", description: "Number of 3-hour epochs between executions (>= 1)" },
        target: { type: "string", description: "Target ERC-20 address on Base" },
        usdc_weth_fee: {
          type: "number",
          description: `Uniswap V3 fee tier for the USDC→WETH hop. Default ${DEFAULT_USDC_WETH_FEE} (0.05%)`,
          default: DEFAULT_USDC_WETH_FEE,
        },
        weth_target_fee: { type: "number", description: "Uniswap V3 fee tier for the WETH→target hop" },
        slippage_bps: {
          type: "number",
          description: `Slippage tolerance in bps. Default ${Number(DEFAULT_SLIPPAGE_BPS)}, max ${Number(MAX_SLIPPAGE_BPS)}`,
          default: Number(DEFAULT_SLIPPAGE_BPS),
        },
      },
      required: ["total_usdc", "amount_per_swap", "interval_epochs", "target", "weth_target_fee"],
    },
    handler: async (args: {
      total_usdc: string;
      amount_per_swap: string;
      interval_epochs: string;
      target: string;
      usdc_weth_fee?: number;
      weth_target_fee: number;
      slippage_bps?: number;
    }) => {
      const totalUSDC = BigInt(uintStringSchema.parse(args.total_usdc));
      const amountPerSwap = BigInt(uintStringSchema.parse(args.amount_per_swap));
      const intervalInEpochs = BigInt(uintStringSchema.parse(args.interval_epochs));
      if (amountPerSwap < MIN_AMOUNT_PER_SWAP_USDC) throw new Error("amount_per_swap < 1 USDC");
      const data = buildCreatePositionViaWethCalldata({
        totalUSDC,
        amountPerSwap,
        intervalInEpochs,
        targetToken: addressSchema.parse(args.target) as `0x${string}`,
        usdcWethFee: args.usdc_weth_fee ?? DEFAULT_USDC_WETH_FEE,
        wethTargetFee: args.weth_target_fee,
        slippageBps: BigInt(args.slippage_bps ?? Number(DEFAULT_SLIPPAGE_BPS)),
      });
      return { to: V3_ADDRESS, data, value: "0", note: "approve USDC to CLAWDdcaV3 for >= total_usdc before calling" };
    },
  },
  {
    name: "build_execute_dca_calldata",
    description:
      "Build calldata for executeDCA(positionId) or executeDCAWithMin(positionId, amountOutMinimum). Use the *WithMin variant for sandwich-resistant execution — supply your own off-chain QuoterV2 quote * (1 - slippage). Without amountOutMinimum, the contract's in-tx QuoterV2 + slippage is used (not MEV-safe).",
    inputSchema: {
      type: "object",
      properties: {
        position_id: { type: "string", description: "Position id to execute" },
        amount_out_minimum: {
          type: "string",
          description: "Optional. Minimum target-token output (uint256 raw). Use executeDCAWithMin when supplied.",
        },
      },
      required: ["position_id"],
    },
    handler: async (args: { position_id: string; amount_out_minimum?: string }) => {
      const positionId = BigInt(uintStringSchema.parse(args.position_id));
      const min = args.amount_out_minimum ? BigInt(uintStringSchema.parse(args.amount_out_minimum)) : undefined;
      const data = buildExecuteDcaCalldata(positionId, min);
      return {
        to: V3_ADDRESS,
        data,
        value: "0",
        note:
          min !== undefined
            ? "executeDCAWithMin — sandwich-safe. Caller earns 10 bps of position.amountPerSwap in USDC."
            : "executeDCA — uses in-tx QuoterV2. Caller earns 10 bps of position.amountPerSwap in USDC.",
      };
    },
  },
  {
    name: "build_execute_burn_calldata",
    description:
      "Build calldata for executeBurn() — permissionless. Sweeps the accrued burnFeeBalance through USDC→CLAWD via Uniswap V3 and sends the CLAWD to 0xdead. Anyone can call; pays no caller fee. The owner can configure burnSwapPath separately.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async () => ({
      to: V3_ADDRESS,
      data: buildExecuteBurnCalldata(),
      value: "0",
      note: "Reverts with NothingToBurn if burnFeeBalance == 0. Check get_engine_state.burnFeeBalanceUsdc first.",
    }),
  },
  {
    name: "build_withdraw_token_calldata",
    description:
      "Build calldata for withdrawToken(positionId). Sends position.tokenAccrued to position.owner. Owner-only — agents using this must already be (or be acting on behalf of) the position owner.",
    inputSchema: {
      type: "object",
      properties: { position_id: { type: "string" } },
      required: ["position_id"],
    },
    handler: async ({ position_id }: { position_id: string }) => ({
      to: V3_ADDRESS,
      data: buildWithdrawTokenCalldata(BigInt(uintStringSchema.parse(position_id))),
      value: "0",
    }),
  },
  {
    name: "build_close_position_calldata",
    description:
      "Build calldata for closePosition(positionId). Refunds remaining USDC + accrued target token to position.owner. Callable by position owner or by the contract owner (emergency wind-down).",
    inputSchema: {
      type: "object",
      properties: { position_id: { type: "string" } },
      required: ["position_id"],
    },
    handler: async ({ position_id }: { position_id: string }) => ({
      to: V3_ADDRESS,
      data: buildClosePositionCalldata(BigInt(uintStringSchema.parse(position_id))),
      value: "0",
    }),
  },
] as const;

// ─── server boot ──────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "clawd-dca",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async req => {
  const tool = tools.find(t => t.name === req.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
    };
  }
  try {
    // BigInt-safe JSON serialization for tool output.
    const result = await tool.handler((req.params.arguments ?? {}) as any);
    const text = JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
    return { content: [{ type: "text", text }] };
  } catch (e: any) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error in ${tool.name}: ${e.message ?? String(e)}` }],
    };
  }
});

// ─── transport selection ─────────────────────────────────────────────────────

async function main() {
  const transport = process.env.MCP_TRANSPORT ?? "stdio";
  if (transport === "stdio") {
    const t = new StdioServerTransport();
    await server.connect(t);
    // No console.log — stdio MCP wire protocol uses stdout. Logging goes to stderr.
    console.error("clawd-dca MCP server running on stdio");
  } else if (transport === "http") {
    // Streamable HTTP transport — the modern MCP transport for remote agents.
    // Available since @modelcontextprotocol/sdk 1.0+ as `StreamableHTTPServerTransport`.
    const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
    const http = await import("node:http");
    const port = Number(process.env.PORT ?? 3333);
    const httpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await server.connect(httpTransport);
    const httpServer = http.createServer(async (req, res) => {
      // CORS for browser-based agents
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id");
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
      await httpTransport.handleRequest(req, res);
    });
    httpServer.listen(port, () => {
      console.error(`clawd-dca MCP server listening on http://0.0.0.0:${port}/mcp`);
    });
  } else {
    console.error(`Unknown MCP_TRANSPORT: ${transport}. Use 'stdio' or 'http'.`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});

void COMMON_WETH_TARGET_FEES; // exported for downstream tooling
