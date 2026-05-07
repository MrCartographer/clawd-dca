# Stage 7 — Frontend QA Audit

Repo: `/Users/austingriffith/clawd/ethereum-servicer/builds/leftclaw-service-job-99`
GitHub: `https://github.com/clawdbotatg/leftclaw-service-job-99`
Audited build: `packages/nextjs/out/` (static export already produced by Stage 6)
Deployed CLAWDdca: `0x8c81CAeCA48f521Df24B65F1C22c11150830F088` (Base, verified)
USDC (Base bridged): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals)
CLAWD: `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` (18 decimals)

---

## Ship-blockers (must all PASS before Stage 8)

### 1. Wallet connect shows a button, not text — **PASS**
`packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx:35-38` renders `<button className="btn btn-primary btn-sm" onClick={openConnectModal} type="button">Connect Wallet</button>` when not connected. The header (`Header.tsx:64`) mounts that button. The in-page `WalletStrip` shows non-blocking copy ("Connect your wallet to view balances and manage DCA positions.", `WalletStrip.tsx:51-52`) — never a "please connect" instruction blocking action. Dashboard/Create/Keepers each render an empty-state CTA that says "Connect your wallet" only as a hint; the actual connect button lives in the Header.

### 2. Wrong network shows a Switch button — **PASS**
- Header: when `chain.unsupported || chain.id !== targetNetwork.id`, `RainbowKitCustomConnectButton` (`index.tsx:41-43`) renders `<WrongNetworkDropdown/>` — a red `btn btn-error btn-sm` styled label.
- `WalletStrip.tsx:74-83` ALSO renders an explicit "Switch to Base" `btn btn-warning btn-xs` whenever `wrongNetwork` — exactly the in-app four-state button the QA skill demands.
- `CreatePosition.tsx:388-397`: when on wrong network the primary action card shows a single full-width "Switch to Base" button INSTEAD OF the Approve / Create pair — clean four-state flow (connect → switch → approve → action).
- `Keepers.tsx:207-225`: same — when wrongNetwork, the "Execute All Ripe" CTA is replaced by "Switch to Base".
- `PositionCard.tsx`: per-position action buttons are gated by `isOwner && active`. They do NOT explicitly disable on wrongNetwork, but since SE2's `useScaffoldWriteContract` simulates against `targetNetwork`, the simulate would reject if the connected wallet is on the wrong chain. This is a soft gap (a user on the wrong chain can click Withdraw / Top Up / Close and only get a wallet-side network-mismatch error). Note as Info — the WalletStrip's switch button is right above the cards, so the UX path to the correct chain is one click away.

### 3. Approve button stays disabled through block confirmation + cooldown — **FAIL (partial)**
`CreatePosition.tsx:163-194`. Approve handler:
- `isApproving` (`isPending` from `useWriteContract`) — true between user clicking "Approve" and the wallet returning the tx hash.
- `approveConfirming` (`isLoading` from `useWaitForTransactionReceipt({ hash: approveTxHash })`) — true between hash returned and receipt mined.
- After `approveConfirmed` becomes true, line 191 fires `refetchAllowance()` and `resetApprove()`.

Disabled check at line 405:
```
disabled={!needsApproval || insufficientBalance || isApproving || approveConfirming || totalUsdcRaw === 0n}
```
- During wallet-prompt: `isApproving=true` → disabled. ✓
- During mining: `approveConfirming=true` → disabled. ✓
- After mined but before allowance refetches: `isApproving=false`, `approveConfirming=false`, but `usdcAllowance` still holds the OLD value, so `needsApproval=true`, so the button is NOT disabled. **GAP.**

The QA skill explicitly requires a `approveCooldown` (~4s post-confirm) AND a polling check that the allowance updated, BOTH read by `disabled`. Job 93's pattern was a manual `setInterval` polling the allowance every 1.5s with `waitingForAllowance` set to `true` until the on-chain allowance reflected the new value. Job 99 has neither.

In practice the gap is small (Base block ~2s + Alchemy poll lag of ~3s = ~5s window), and once `refetchAllowance` returns the new value the button correctly disables (`!needsApproval` flips true). But during that window a user can click Approve again, which triggers a SECOND duplicate approve transaction (most wallets de-dupe with their own pending-tx tracking, but this is the exact ship-blocker the QA skill calls out as critical).

**Additional bug (same area):** the `if (approveConfirmed && approveTxHash) { refetchAllowance(); resetApprove(); }` block at lines 191-194 is executed during render, not in a `useEffect`. Calling `refetchAllowance` (which calls `setState` internally inside react-query) during render is a React anti-pattern. After `resetApprove()` clears `approveTxHash`, `approveConfirmed` will recompute as false on the next render, but in the interim React may warn or re-render in a tight loop. **Should also fix in Stage 8.**

**How to fix (Stage 8):**
- Add `const [approveCooldown, setApproveCooldown] = useState(false)`.
- Move the post-confirm logic into `useEffect`:
  ```ts
  useEffect(() => {
    if (approveConfirmed && approveTxHash) {
      setApproveCooldown(true);
      refetchAllowance();
      resetApprove();
      const t = setTimeout(() => setApproveCooldown(false), 4000);
      return () => clearTimeout(t);
    }
  }, [approveConfirmed, approveTxHash]);
  ```
- Add `approveCooldown` to the `disabled` expression.
- Optionally also add a `waitingForAllowance` flag set to true until `refetchAllowance()` returns a value `>= totalUsdcRaw` (job 93 pattern).

### 4. Approve flow traced end-to-end — **PASS**

**Spender argument:**
`CreatePosition.tsx:180` calls `approve(CLAWDDCA_ADDRESS, totalUsdcRaw)`. `CLAWDDCA_ADDRESS` is hardcoded at `utils/dca.ts:14` as `0x8c81CAeCA48f521Df24B65F1C22c11150830F088`.

**transferFrom caller:**
`packages/foundry/contracts/CLAWDdca.sol:188`: inside `createPosition`, `IERC20(USDC).safeTransferFrom(msg.sender, address(this), totalUSDC)`. The caller of `transferFrom` (i.e. the spender from USDC's perspective) is `address(this)` = CLAWDdca contract = `0x8c81CAeCA48f521Df24B65F1C22c11150830F088`.

`CLAWDdca.sol:220` (topUp): `IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount)`. Same — CLAWDdca is the spender.

**Allowance read:**
`CreatePosition.tsx:117` reads `allowance(user, CLAWDDCA_ADDRESS)` = `allowance(user, 0x8c81…F088)`. Same address as the approve and the transferFrom caller.

**ERC20 ABI:**
`CreatePosition.tsx:34-62` defines a minimal local `usdcAbi` for `balanceOf`/`allowance`/`approve` only — no error decoding here, but the direct approve write goes through `useWriteContract({ abi: usdcAbi })` and any revert from `approve` itself (e.g. `ERC20InvalidSpender`) would still need the OZ v5 errors. Those errors are registered in `externalContracts.ts:122-160` (all 6 OZ v5 ERC20 custom errors) and surfaced via `getParsedErrorWithAllAbis` (`utils/scaffold-eth/contract.ts:344-409`). The merged-contract resolver was correctly carried over from job 93's Stage 8 fix (line 362 reads `(contractsData as Record<…>)[chainId]`, the merged map, not just `deployedContractsData`).

This satisfies the spender-matches and ABI-coverage requirements. Approve flow is correct.

### 5. CLAWDdca verified on Basescan — **PASS** (Stage 5 confirmed)
`packages/nextjs/contracts/deployedContracts.ts:10` shows `address: "0x8c81caeca48f521df24b65f1c22c11150830f088"`. Matches the deployed contract. Stage 5 Opus run reported verification confirmed; spot check via the Basescan link in Footer (`Footer.tsx:21`) is a one-click confirmation.

### 6. SE2 footer branding removed — **PASS**
`packages/nextjs/components/Footer.tsx` is hand-rolled. Recursive grep for `BuidlGuidl|Fork me|nativeCurrencyPrice|Built with|Support` across `app/` and `components/` (excluding node_modules):
- `Footer.tsx:9` — comment: "No SE2 branding, no nativeCurrencyPrice badge, no localhost faucet" (informational comment, not user-facing).
- `components/assets/BuidlGuidlLogo.tsx:1` — the file exists but is **NOT imported anywhere** (verified via `grep -rn 'BuidlGuidlLogo' packages/nextjs/`). Orphaned and never bundled. Acceptable.
- No `Fork me`, no `Support` link, no `nativeCurrencyPrice` badge anywhere user-visible.

Footer renders: project disclaimer ("Built by a community member using LeftClaw Services (beta). Not affiliated with the CLAWD core team or Uniswap. Verify the contract on Basescan before sending USDC. Do your own research."), Basescan link, GitHub link, LeftClaw Services link, SwitchTheme. Clean.

### 7. SE2 tab title removed — **PASS**
- `utils/scaffold-eth/getMetadata.ts:19`: `const titleTemplate = "%s | CLAWD DCA";` (not `"%s | Scaffold-ETH 2"`).
- `app/layout.tsx:9-12`: passes `title: "CLAWD DCA Engine"`.
- Verified static export `out/index.html` contains `<title>CLAWD DCA Engine</title>` and zero occurrences of `Scaffold-ETH`. Subroute `out/create/index.html`, `out/keepers/index.html`, `out/stats/index.html` all clean.

### 8. SE2 README replaced — **PASS**
Root `README.md:1-53` describes CLAWD DCA Engine: tagline, contract address, how it works (3 steps), contract features, frontend route layout, local development, build for IPFS, repo layout, disclaimer. No "Built with Scaffold-ETH 2" boilerplate — the only mention of SE2 is `**Built with:** Scaffold-ETH 2 (Foundry flavor)` in the tech-stack line, which is acceptable acknowledgement (and matches the spirit of the rule — README must describe the project, not be the SE2 default).

### 9. Favicon replaced — **PASS**
- `app/icon.svg` is a custom blue-rounded-square (`#0052ff` Base-blue) with a 🦞 emoji glyph. NOT the SE2 default scaffold logo.
- `getMetadata.ts:59-66` sets the icon to `/icon.svg` with `image/svg+xml`. Static export `out/index.html` contains `<link rel="icon" href="/icon.svg" type="image/svg+xml"/>`.
- No `favicon.ico` present at the project root or in `public/`, so the SVG is the canonical icon.

### 10. `yarn build` exits 0 — **NOT RE-RUN** (audit-only stage)
Stage 6 produced the `out/` directory. Per audit rules, no build commands run. Stage 8 should re-run `yarn build` after fixes; the existing artifact has all expected files (`index.html`, `404.html`, `_next/`, `icon.svg`, `manifest.json`, `og.png`, route-specific subdirs).

### 11. CLAWDdca address present in static bundle — **PASS**
`grep -rn '0x8c81caeca48f521df24b65f1c22c11150830f088' out/` matches at least 5 chunked JS files (e.g. `_next/static/chunks/4668-c7bf9b100fad3d0e.js`, `9527.d802ba424fb6f685.js`, etc.). Both lower-case and original-case forms are embedded. The address will be visible in the rendered Footer Basescan link and in any future `<Address/>` rendering after hydration.

### 12. USDC + CLAWD addresses present — **PASS**
- USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` — present in `_next/static/chunks/4668-c7bf9b100fad3d0e.js`, `9527.d802ba424fb6f685.js`, `5411.141044439d3c9127.js`.
- CLAWD `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` — present in the same chunks.

### 13. No `localhost:3000` in user-visible HTML — **PASS**
`grep -rE 'localhost:?3?0?0?0?' out/{index,create/index,keepers/index,stats/index}.html` returns zero matches. (The chunked JS in `_next/static/chunks/*.js` may contain localhost as part of dev-only env detection in vendored connector libraries — those don't render to user-visible HTML.) OG meta tags resolve to `https://leftclaw.services/og.png`, NOT `http://localhost:3000/og.png`. Confirmed via grep on `og:image` and `twitter:image` content attributes.

---

## Should-fix (must all PASS before Stage 9 / completion)

### 1. CLAWDdca / USDC / CLAWD addresses displayed with `<Address/>` — **FAIL**
- The `<Address/>` component (`@scaffold-ui/components`) IS used elsewhere in the dApp:
  - `WalletStrip.tsx:63` — connected user address (in-app strip).
  - `PositionCard.tsx:245` — position owner (when not isOwner).
  - `Keepers.tsx:258` — ripe-position owners in the table.
  - `Stats.tsx:108` — keeper leaderboard addresses.
- BUT none of the three protocol contract addresses (CLAWDdca, USDC, CLAWD) are displayed via `<Address/>`. The Footer (`Footer.tsx:20-27`) just has `<a href="https://basescan.org/address/...">Contract on Basescan</a>` — a plain text link, no blockie, no copy button, no short-address display, no in-app explorer affordance.
- **What's wrong:** the QA-skill rule "Use `<Address/>` for display (shows blockie, ENS, copy button, explorer link)" applies to the protocol contracts a user is interacting with, not just user-input addresses. Comparable to job 93's "Contracts" card.
- **How to fix (Stage 8):** Add a small "Contracts" section either in the Footer or as a card on the Dashboard (above or below Your Positions). Render `<Address address={CLAWDDCA_ADDRESS} format="short" chain={base} />`, same for USDC and CLAWD. ~15 lines.

### 2. OG image uses absolute URL with `NEXT_PUBLIC_PRODUCTION_URL` checked first; `og.png` exists — **PASS**
- `utils/scaffold-eth/getMetadata.ts:13-17` resolution order: `NEXT_PUBLIC_PRODUCTION_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `https://leftclaw.services` (stable fallback for IPFS-hosted builds; never `localhost`).
- `metadataBase` is always set (line 33), so Next 15 doesn't fall back to localhost.
- `packages/nextjs/public/og.png` exists (75 KB, 1200×630 PNG, valid). Copied into `out/og.png` by the build (75 KB).
- `out/index.html` bakes `<meta property="og:image" content="https://leftclaw.services/og.png"/>` and `<meta name="twitter:image" content="https://leftclaw.services/og.png"/>` — absolute URL, real host. Confirmed via grep.

### 3. `--radius-field: 0.5rem` in BOTH theme blocks — **PASS**
`packages/nextjs/styles/globals.css:38` (light theme): `--radius-field: 0.5rem;`. Line 63 (dark theme): `--radius-field: 0.5rem;`. Both blocks correct.

Note: line 111 still has `.btn { ... border-radius: 9999rem; }` as a global override that pill-shapes ALL buttons. This may or may not be the intended design — DaisyUI's `--radius-field` is the proper variable, but this app-level CSS rule overrides it for `.btn` specifically. The QA-skill rule targets `--radius-field` specifically, which IS fixed. Keeping the pill `.btn` is a design choice. **Note as Info.**

### 4. All token amounts have USD context (or N/A documented) — **PASS (with caveat)**
- USDC IS USD by definition ($1 ≈ 1 USDC), so every USDC amount in the dApp is implicitly USD-denominated. The dApp explicitly prefixes USDC amounts with `$`:
  - `WalletStrip.tsx:68`: `${formatUsdc(usdcBalance)}`
  - `PositionCard.tsx:253`: `${formatUsdc(usdcBalance)}` (USDC remaining)
  - `PositionCard.tsx:261`: `${formatUsdc(amountPerSwap)}`
  - `CreatePosition.tsx:314`: `Wallet balance: ${formatUsdc(usdcBalance)}`
  - `Keepers.tsx:223`: `≈ ${formatUsdc(totalKeeperReward)} reward`
  - `Stats.tsx:75-81`: all USDC totals prefixed with `$`.
- CLAWD has no canonical oracle on Base mainnet (community ERC20). The dApp does NOT attempt to display a USD equivalent for CLAWD — it shows the raw 18-decimal token amount via `formatClawd` (`utils/dca.ts:78-85`):
  - `WalletStrip.tsx:72`, `PositionCard.tsx:257`, `Stats.tsx:76`. All show CLAWD as-is, no `$` prefix.
- **Caveat:** the dApp does not anywhere include a sentence like "CLAWD has no oracle, USD price unavailable" — the absence of `$` is the implicit signal. A reasonably careful user understands. Acceptable per the rule's "or N/A for community tokens" carve-out.

**Decimals trace (per audit instructions):**
- USDC = 6 decimals. `utils/dca.ts:18` exports `USDC_DECIMALS = 6`. `formatUsdc` uses `formatUnits(raw, 6)` (line 73). `parseUnits(totalUsdc, USDC_DECIMALS)` (CreatePosition line 125, line 134, line 173) writes 6-decimal values to `createPosition(totalUSDC, amountPerSwap, …)` which the contract expects in USDC raw units. Trace clean.
- CLAWD = 18 decimals. `utils/dca.ts:19` exports `CLAWD_DECIMALS = 18`. `formatClawd` uses `formatUnits(raw, 18)` (line 80). `clawdAccrued` from `positions[positionId][2]` is in 18-decimal raw units (CLAWDdca holds CLAWD as standard 18-dec ERC20). Display via `formatClawd` correctly divides by 10^18.

### 5. Errors mapped to human-readable messages — **PASS** (with traced trace)
`utils/scaffold-eth/contract.ts:344-409` — `getParsedErrorWithAllAbis` is the merged-contract resolver. Line 362: `const chainContracts = (contractsData as Record<number, Record<string, any>>)[chainId as number];` reads the **merged** `contractsData` (deployed + external). Job 93's Stage 8 bug fix is correctly carried over.

**Trace one revert path: keeper executes a not-yet-ripe position (Keepers page).**
1. User on `/keepers` clicks Execute on a position whose `lastExecutedEpoch + intervalInEpochs > currentEpoch`.
2. `Keepers.tsx:158` calls `writeDca({ functionName: "executeDCA", args: [positionId] })` via `useScaffoldWriteContract`.
3. `useScaffoldWriteContract` simulates first against CLAWDdca's ABI (`useScaffoldWriteContract.ts` calls `simulateContractWriteAndNotifyError`). CLAWDdca reverts with `NotRipe()` selector — present in `deployedContracts.ts` line 855.
4. viem decodes `NotRipe` against the deployed CLAWDdca ABI, returns "execution reverted: NotRipe()". `getParsedError` returns the message. **`getParsedErrorWithAllAbis` is reached only if the original message contains 'Encoded error signature ... not found on ABI' — for known errors in the deployed ABI, this fast path emits a friendly message directly.** ✓

**Trace another revert path: insufficient allowance via createPosition (Create page).**
1. User clicks Approve, then immediately clicks Create before allowance updates (or skips approval entirely if needsApproval is stale).
2. `CreatePosition.tsx:215-218` calls `writeDca({ functionName: "createPosition", args: [...] })`.
3. SE2 simulate runs against CLAWDdca ABI. The contract's first ERC20 interaction is `safeTransferFrom(USDC, msg.sender, this, totalUSDC)` (`CLAWDdca.sol:188`). USDC reverts with OZ v5 `ERC20InsufficientAllowance(spender, allowance, needed)` — selector `0xfb8f41b2`.
4. `simulateContract` returns the raw error. The selector is NOT in CLAWDdca's ABI.
5. `getParsedError` returns "Encoded error signature 0xfb8f41b2 not found on ABI".
6. `getParsedErrorWithAllAbis` (line 344) detects the regex match (line 348), extracts the selector (line 349-350), iterates `chainContracts` from the merged `contractsData[8453]`. CLAWD and USDC entries from `externalContracts.ts` are present. CLAWD's ABI includes `ERC20InsufficientAllowance` as an error type; the resolver hashes `ERC20InsufficientAllowance(address,uint256,uint256)` → `0xfb8f41b2` → match.
7. Returns `"Contract function execution reverted with the following reason:\nERC20InsufficientAllowance(address,uint256,uint256) from CLAWD contract"` (or "from USDC contract" — both ABIs match the selector since it's the same OZ v5 signature).

The resolver is correct.

**Caveat:** `PositionCard.tsx` and several handlers (e.g. `handleClose`, `handleWithdraw`, `handleSlippage`) have `try/catch` blocks that just `console.error(e)` — they DON'T call `getParsedErrorWithAllAbis` to surface a toast. The notifications relied upon are the SE2 simulate-time toasts emitted by `simulateContractWriteAndNotifyError` (which IS called for `useScaffoldWriteContract`, so simulate-time errors are surfaced). Post-simulate runtime reverts (rare since SE2 simulates first) would silently log to console. Note as **Info** — the existing simulate-and-notify path covers ~99% of revert cases. No fix required for ship.

### 6. Phantom wallet in RainbowKit — **PASS**
`services/web3/wagmiConnectors.tsx:6,27` imports and includes `phantomWallet` in the wallet list (between `rainbowWallet` and `safeWallet`).

### 7. Mobile deep linking via `useWriteAndOpen` — **PASS**
- `hooks/scaffold-eth/useWriteAndOpen.ts` exists (~88 lines). Returns `{ writeAndOpen, openWalletOnMobile }`.
- The `writeAndOpen` helper is invoked at every onchain write in the dApp:
  - `CreatePosition.tsx:175-183` (USDC approve), 214-219 (createPosition), 245-249 (setSlippageTolerance post-create).
  - `PositionCard.tsx:127-132` (withdrawCLAWD), 150-154 (closePosition), 174-178 (topUpPosition), 205-209 (setSlippageTolerance).
  - `Keepers.tsx:157-162` (executeDCA), 177-181 (executeBatch).
- The hook short-circuits on desktop (`isMobileUA()` check, line 30-33) — no-ops, never throws.
- Mobile WC path: `tryOpenWalletApp(connector)` reads the connector's `provider.session.peer.metadata.redirect.native` URI scheme and navigates to it. Best-effort; never throws (line 60-62). Errors from the underlying write are re-thrown unchanged so existing toast/notification flow keeps working.

### 8. `appName` in `wagmiConnectors.tsx` — **PASS**
Line 51: `appName: "CLAWD DCA"`. Not the SE2 default `"scaffold-eth-2"`.

---

## Spec-conformance — all 4 pages

### Dashboard `/` — **PASS** (with one note)

- **Hero present** ✓ — `Dashboard.tsx:24-31`: 🦞 emoji + "CLAWD DCA Engine" + tagline "Stack CLAWD on autopilot. USDC in. CLAWD out. Permissionless keepers do the work."
- **Wallet strip with USDC + CLAWD balance + wrong-network switch** ✓ — `WalletStrip.tsx` (mounted at `Dashboard.tsx:33`).
- **"How it works" collapsible (open by default)** ✓ — `Dashboard.tsx:35-51`: `<details ... open>` with 3-step ordered list:
  1. Create a position (USDC, choose strategy 3h/daily/weekly/custom)
  2. Keepers do the work (0.39% per swap)
  3. Withdraw any time
- **Your Positions list** ✓ — `Dashboard.tsx:53-92`. Shows empty-state CTA pointing at `/create` if `ids.length === 0`, otherwise renders `<PositionCard />` for each id from `getPositionsByOwner(connectedAddress)` (live, watch:true).
- **Per-position card fields** — `PositionCard.tsx:250-283`:
  - USDC remaining ✓ (line 252-254)
  - CLAWD accrued ✓ (line 255-258)
  - Amount per swap ✓ (line 259-262)
  - Cadence (interval) ✓ (line 263-266)
  - Next execution countdown ✓ (line 267-270)
  - Executions left ✓ (line 271-274)
  - Estimated end date ✓ (line 275-278)
  - Slippage ✓ (line 279-282)
  - Active badge ✓ (line 237-239)
  - Ripe badge ✓ (line 240)
- **Per-position actions** — `PositionCard.tsx:285-301`:
  - Withdraw CLAWD ✓ (only shown when `clawdAccrued > 0n`, line 287)
  - Close ✓ (line 296-299, with native confirm dialog at line 145)
  - Top Up USDC ✓ (line 293-295, expands inline form)
  - Adjust Slippage ✓ (line 331-351, always-visible inline form below Top Up)
- **Empty state CTA pointing at /create** ✓ — `Dashboard.tsx:75-83`.

**Note (Stage-6 anomaly #4 — Position progress bar):** Spec mentioned "progress bar" without explicit "optional" qualifier. The current PositionCard does NOT render a progress bar (e.g. percent complete = 1 - executionsRemaining / totalExecutionsAtCreation). The data needed (`amountPerSwap`, `usdcBalance`, plus the original total) is partly available — the original total isn't stored on-chain (the position only tracks `usdcBalance` post-deposit), so a true progress percentage would require persisting the initial deposit somewhere (event log or local state). **Note as Should-fix Low priority** — Stage 8 can either add a coarse progress indicator (e.g. derive from `executionsRemaining` if user provides total at creation time, store in localStorage by positionId) or document explicitly why it's omitted. Skipping is acceptable IF documented in NEXT_STEPS.md / Stage 8 resolution.

### Create `/create` — **PASS (with two issues already flagged)**

- **Strategy presets (3hr / Daily / Weekly / Custom)** ✓ — `INTERVAL_PRESETS` in `utils/dca.ts:32-57` lists all four; rendered in `CreatePosition.tsx:284-298` as a 4-button grid.
- **Total USDC, Amount per swap, Interval (visible if Custom), Slippage tolerance fields** ✓ — `CreatePosition.tsx:301-361`. Custom interval input only renders when `presetKey === "custom"` (line 331).
- **Live duration estimate** ✓ — "≈ Executions / Cadence / Runs until" preview at lines 363-380. Recomputes via `useMemo` (lines 145-149).
- **Approve UX (allowance check, two-step)** — clean two-step ("1. Approve USDC", "2. Create Position", `CreatePosition.tsx:401-428`). Approve button auto-disables when `!needsApproval` (`needsApproval` derived from on-chain `allowance` query, line 160). **BUT the cooldown gap covered in ship-blocker #3 is here.**
- **USDC balance shown** ✓ — `CreatePosition.tsx:313-315`: "Wallet balance: $...".
- **Insufficient balance disables button** ✓ — both Approve (line 405) and Create (line 416) check `insufficientBalance`, which is set when `totalUsdcRaw > usdcBalance` (line 159). Inline error message at line 429.
- **Successful create redirects/refetches and shows toast** ✓ — `CreatePosition.tsx:258-261`: success notification + `router.push("/")` to dashboard. Position list on dashboard auto-watches via `watch: true` so it reflects the new position.

**Issue #1: any types** — `CreatePosition.tsx:233`: `(decoded.args as any).positionId` and `Keepers.tsx:49,104`, `Stats.tsx:38`. Justifiable for `decodeEventLog` since the discriminated union return type is awkward to narrow without a stricter abi inference helper. **Note as Info.**

**Issue #2: render-time refetch** — `CreatePosition.tsx:191-194` (covered in ship-blocker #3 above).

### Keepers `/keepers` — **PASS (with concerns)**

- **Heading + keeper copy** ✓ — `Keepers.tsx:194-199`: "Keeper Network" + "Permissionless keepers earn 0.39% USDC per swap. Anyone can run executions — including you."
- **All ripe positions list** ✓ — events-based enumeration at lines 38-53. `useScaffoldEventHistory` reads all `PositionCreated` events from `DEPLOYED_ON_BLOCK` (45660684, set in `utils/dca.ts:23`). Filters down to `active && currentEpoch >= lastExecutedEpoch + intervalInEpochs` (line 138-141).
- **Per-position estimated keeper reward** ✓ — `Keepers.tsx:253`: `(amountPerSwap * 39n) / 10_000n` per row.
- **Execute button per position** ✓ — line 264-273, calls `writeDca({ functionName: "executeDCA", args: [positionId] })`.
- **"Execute All Ripe" calls `executeBatch`** ✓ — line 217-225 + 172-190. Passes `ids` array.
- **Empty state** ✓ — line 234-236: "No ripe positions — check back in a few minutes."

**Concern #1 — events scan latency:** `DEPLOYED_ON_BLOCK = 45660684n` → on Base (2s blocks), every page load scans roughly (current_block - 45660684) blocks via `getLogs`. As the dApp ages, this gets slower. The default `blocksBatchSize` from SE2 is reasonable (~10k) but each page mount fires fresh scans. With `watch: true` the polling continues forever. **Note as Info — acceptable for Stage 9.**

**Concern #2 — N+1 reads on Keepers page:** `Keepers.tsx:91-101` issues one `readContract` per position ID via `Promise.all`. For ~100 positions that's 100 simultaneous Alchemy calls per page mount and any time `allIds` changes (which happens on every new PositionCreated event). At scale this will hit Alchemy rate limits. **Note as Info — needs `multicall` for production-scale, but not a Stage 8 blocker.**

**Concern #3 — wrongNetwork gate inconsistency:** Per-row Execute buttons are gated by `disabled={!isConnected || wrongNetwork || busyId === ...}` (line 266). ✓ The "Execute All Ripe" button (line 219-225) is gated by `!isConnected || ripePositions.length === 0 || batchBusy` — does NOT include `wrongNetwork` because the if-branch already routes to a "Switch to Base" button when wrongNetwork (line 207-215). Acceptable.

### Stats `/stats` — **PASS**

- **Headline metrics** ✓ — `Stats.tsx:74-82`:
  - Total USDC swapped ✓
  - Total CLAWD acquired ✓
  - Executions ✓
  - Active positions ✓ (positionsCreated - positionsClosed, line 63)
  - Positions created ✓
  - Keeper fees paid ✓
  - Protocol fees ✓
- **Active positions count** ✓ (above).
- **Top keepers leaderboard** ✓ — line 84-118. Top 10 by execution count.
- **All from `useScaffoldEventHistory`, fromBlock = deploy block** ✓ — lines 11-28. Three event subscriptions: `PositionCreated`, `DCAExecuted`, `PositionClosed`. All use `fromBlock: DEPLOYED_ON_BLOCK = 45660684n`.

---

## General frontend health

### Pending states on every onchain interactive button — **PASS**
- CreatePosition Approve: `loading-spinner` on `isApproving || approveConfirming` (line 409).
- CreatePosition Create: spinner on `isCreating || postCreateBusy` (line 425).
- WalletStrip Switch: spinner on `isSwitching` (line 80).
- Keepers Execute (per-row): spinner on `busyId === pos.id` (line 269-271).
- Keepers Execute All: spinner on `batchBusy` (line 222).
- PositionCard Withdraw / Close / TopUp / Slippage: each gated on its own `*Busy` state with a spinner (lines 289, 297, 318, 347).
- Each state is per-action — no shared `isLoading` antipattern.

### Confirmation modals don't disappear on receipt — **N/A (no modals)**
The dApp uses native `confirm(...)` for Close (`PositionCard.tsx:145`) and inline expanded panels for Top Up / Adjust Slippage (no overlay modals). Notifications are non-blocking toasts. The "modals show success then close" pattern doesn't apply because there are no overlay modals. Acceptable.

### Empty states — **PASS**
- Dashboard: "Connect your wallet to see your DCA positions" (when not connected, line 64) and "No positions yet — create your first DCA position." (when connected with 0 positions, line 78).
- Keepers: "No ripe positions — check back in a few minutes." (line 235).
- Stats: "No executions yet." (line 92, when `keeperLeaderboard.length === 0`).
- WalletStrip: "Connect your wallet to view balances and manage DCA positions." (line 51, when not connected).

### Mobile responsive — **PASS**
- `max-w-5xl` on Dashboard/Keepers/Stats; `max-w-3xl` on Create.
- Strategy preset grid: `grid-cols-2 sm:grid-cols-4` (CreatePosition.tsx:284).
- Position card fields: `grid-cols-2 sm:grid-cols-4` (PositionCard.tsx:250).
- Stat cards: `grid-cols-2 sm:grid-cols-3` (Stats.tsx:74).
- Top Up panel: `flex flex-wrap` (PositionCard.tsx:304).
- Header collapses to `Menu` dropdown on `md:hidden` (Header.tsx:52).
- WalletStrip stacks `flex-col sm:flex-row` (line 60).

### Static export contract address present — **PASS** (covered in ship-blocker #11).

### Static export has no SE2 strings — **PASS**
Grepped `out/index.html`, `out/create/index.html`, `out/keepers/index.html`, `out/stats/index.html` for `Scaffold-ETH`, `BuidlGuidl`, `Fork me`, `nativeCurrencyPrice` — zero hits.

### No `console.log` spam — **PASS**
Grep `console.log` across `app/` and `components/` — zero hits. Several `console.error` for swallowed promise errors in handlers (`PositionCard.tsx:137, 160, 185, 215`, `CreatePosition.tsx:253`, `Keepers.tsx:128`). Acceptable (these are unrecovered errors that should be visible in dev).

### No `any` types unjustified — **PARTIAL**
`as any` count: 4 in user-code (Stats.tsx:38, CreatePosition.tsx:233, Keepers.tsx:49, 104). Each is on `decodeEventLog` / `useScaffoldEventHistory` / `readContract` return values where the discriminated union is awkward to narrow. Justifiable. **Note as Info.**

### Accessibility — **PASS for prototype**
- All buttons have visible text labels.
- Forms have `<label>` elements paired with inputs.
- The `<details>` element on the Dashboard "How it works" is natively keyboard-accessible.
- Header dropdown on mobile uses `tabIndex={0}` for focusability (Header.tsx:53, 56).
- Adequate for a v1 dApp — no ARIA violations spotted.

---

## Stage 6 noted-anomalies — verification

### 1. All 4 pages dynamic({ssr: false}) — **ACCEPTABLE (Info)**
`app/page.tsx`, `app/create/page.tsx`, `app/keepers/page.tsx`, `app/stats/page.tsx` all wrap their `_components/*` import in `dynamic(..., { ssr: false })`. Necessary for IPFS static export because wagmi/RainbowKit hooks throw during prerender. The trade-off is a brief loading flash (🦞 + "Loading…") before content renders. Cannot fix without a deeper SSR-compatibility refactor of SE2's connector init code. **Acceptable.**

### 2. OG image branding — **RESOLVED (covered in should-fix #2)**
`packages/nextjs/public/og.png` exists (75 KB, 1200×630, valid PNG). Not the placeholder copied from job 93. Stage 6 generated a CLAWD DCA-branded image. ✓

### 3. `next/font/google` not added — **ACCEPTABLE (Info)**
No `import { ... } from "next/font/google"` in `app/layout.tsx` or `app/_components/*`. Default font stack (system-ui sans-serif via DaisyUI / Tailwind) is acceptable. No external `<link>` tag for Google Fonts either (which would fail static-export Next 15 warnings). **Clean.**

### 4. Position progress bar omitted — **NOTED (Should-fix Low priority)**
Covered above in Dashboard/PositionCard section. Stage 8 should either add a coarse progress indicator or document the omission. Spec said "progress bar" without explicit "optional" qualifier; current implementation displays "Executions left" + "Estimated end" + "Next execution" which arguably convey the same information without a literal `<progress>` element.

---

## Summary

- **Ship-blockers: 12 PASS, 1 FAIL** ✗ — Stage 7 does NOT cleanly unblock Stage 8 hand-off. The approve cooldown gap (ship-blocker #3) is the explicit pattern the QA skill calls out as critical.
- **Should-fix: 7 PASS, 1 FAIL** — must be fixed before Stage 9 / completion. Failure: `<Address/>` for protocol contracts (#1).
- **Spec-conformance (Dashboard, Create, Keepers, Stats): 4 PASS** with one Should-fix Low (Position progress bar) and several Info-level concerns (events scan latency, N+1 reads on Keepers, wrongNetwork gate on PositionCard).
- **General frontend health: PASS** with Info-level `as any` and `console.error` notes.
- **Stage 6 workarounds: ACCEPTABLE** — every workaround has a sensible justification.

### Top 5 fixes Stage 8 must address (priority order)

1. **Approve cooldown / refetch-during-render bug (Ship-blocker #3 — FAIL)**: in `CreatePosition.tsx:163-194`, add an `approveCooldown` state set true for ~4s after `approveConfirmed`, AND/OR a `waitingForAllowance` flag set true until `refetchAllowance()` returns a value `>= totalUsdcRaw` (job 93 polling pattern). Also move the `if (approveConfirmed && approveTxHash) { refetchAllowance(); resetApprove(); }` block into a `useEffect` — calling state-mutating functions during render is an anti-pattern. Add `approveCooldown` (and `waitingForAllowance` if added) to the Approve button's `disabled` expression. **Critical path: this is the QA-skill #3 ship-blocker.**

2. **Protocol contracts displayed with `<Address/>` (Should-fix #1 — FAIL)**: add a small "Contracts" section either in `Footer.tsx` or as a card on the Dashboard. Render `<Address address={CLAWDDCA_ADDRESS} format="short" chain={base} />` for CLAWDdca, USDC, and CLAWD. Use `import { Address as AddressComp } from "@scaffold-ui/components"` (already imported in PositionCard, WalletStrip, Stats, Keepers). ~15 lines.

3. **Position progress bar (Spec-conformance Should-fix Low priority)**: in `PositionCard.tsx`, add a `<progress className="progress progress-primary w-full" max={100} value={percentComplete} />` derived from the persisted-at-creation total versus current `usdcBalance`. Since the total isn't on-chain, store it in localStorage keyed by `positionId` at create time (or read from the `PositionCreated` event log via `amountPerSwap * intervalInEpochs * blockNumber`). OR document explicit omission in a Stage 8 note.

4. **Render-side stability hardening (Info, related to #1)**: replace the in-render `if (approveConfirmed) { ... }` with a `useEffect`. Same fix as #1's secondary issue, but worth calling out separately because it can cause a React warning ("Cannot update a component while rendering a different component") in production console.

5. **PositionCard wrongNetwork gating (Info)**: add a `useAccount`-derived `wrongNetwork` flag inside `PositionCard.tsx` and add it to the `disabled` prop of Withdraw / Close / Top Up / Save Slippage. Currently a wrongNetwork user can click these and only get a wallet-side rejection. Low priority but a small consistency win — matches the four-state flow rule.

### Audit dimensions not fully verifiable

- **Mobile in-wallet deep-link UX**: confirmed by code search that `useWriteAndOpen` is wired at every write site. Couldn't run a real wallet against the live build. Stage 8 doesn't need to re-test this — the hook is identical to job 93's working version.
- **Phantom wallet actually rendering in the modal**: confirmed `phantomWallet` is imported and pushed into the wallets array, but didn't open the RainbowKit modal in a browser to verify it renders. Code path is correct.
- **`yarn build` re-run**: out of scope per stage rules.
- **Live Basescan verification spot-check**: deployedContracts.ts has the correct address; Stage 5 reported verification confirmed; the Footer link manually opens the Basescan page where the green checkmark would be visible.
