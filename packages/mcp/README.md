# @clawd-dca/mcp

Model Context Protocol server for the [CLAWD DCA Engine v3](https://clawd-dca.vercel.app) on Base.

Exposes the contract at [`0xDB5D…78AC`](https://basescan.org/address/0xDB5Da5B9C55D5FC72EB19692aB41Aabbc46278AC) as a set of MCP tools that AI agents (Claude Desktop, Cursor, Cline, ChatGPT plugins, anything that speaks MCP) can call. Read-only by default — agents bring their own wallet and use the calldata builders this server returns.

## Tools

| Tool | Purpose |
|---|---|
| `get_engine_state` | Live snapshot: total positions, current epoch, paused flag, fee balances |
| `get_position(id)` | Read one position with target-token metadata enrichment |
| `get_positions_by_owner(address)` | All position ids for an owner |
| `get_ripe_positions` | Position ids that are ripe AND simulate successfully — the keeper's job board |
| `quote_swap(target, amount_usdc, weth_target_fee)` | Off-chain QuoterV2 quote |
| `validate_fee_tiers(target)` | Probes all 3 common Uniswap V3 fee tiers for the target — use before creating a position |
| `build_create_position_calldata` | Returns `{to, data, value}` for `createPositionViaWETH` |
| `build_execute_dca_calldata` | Calldata for `executeDCA(WithMin)` — earns the caller 10 bps in USDC |
| `build_execute_burn_calldata` | Calldata for the permissionless USDC→CLAWD burn |
| `build_withdraw_token_calldata` | Calldata for `withdrawToken(positionId)` |
| `build_close_position_calldata` | Calldata for `closePosition(positionId)` |

## Install & run

```bash
yarn install
yarn build
yarn start            # stdio transport — for Claude Desktop / Cursor / Cline
yarn start:http       # HTTP transport on PORT (default 3333) — for remote agents
```

## Connect from Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "clawd-dca": {
      "command": "node",
      "args": ["/absolute/path/to/clawd-dca-main/packages/mcp/dist/index.js"],
      "env": { "RPC_URL": "https://mainnet.base.org" }
    }
  }
}
```

Restart Claude Desktop. The tools appear under the 🔌 plug icon.

## Use a custom RPC

The server reads `process.env.RPC_URL` (default `https://mainnet.base.org`). For higher throughput point it at your own Alchemy/Infura/QuickNode key:

```bash
RPC_URL=https://base-mainnet.g.alchemy.com/v2/<KEY> yarn start
```

## Architecture

- No private keys — this server cannot sign transactions. It returns ABI-encoded calldata; the agent's own wallet (or AgentKit / Privy / Smart Account) signs and submits.
- Read operations go through viem's public client against the configured RPC.
- All BigInt values are stringified at the JSON boundary for MCP wire compatibility.

## Discoverability

The dApp at `clawd-dca.vercel.app` serves an [`agent.json`](https://clawd-dca.vercel.app/.well-known/agent.json) discovery manifest pointing at this MCP server's hosted endpoint, the contract ABI, and metadata. Any compliant agent crawling that path can wire itself up without prior knowledge.

## License

MIT
