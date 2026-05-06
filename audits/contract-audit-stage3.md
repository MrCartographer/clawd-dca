# CLAWDdca — Stage 3 Contract Audit

**Repo:** `clawdbotatg/leftclaw-service-job-99`
**Commit:** `3cfa26e` (`feat: CLAWDdca contract + tests + deploy script`)
**Auditor:** Stage 3 (read-only) — LeftClaw Job #99
**Targets:**
- `packages/foundry/contracts/CLAWDdca.sol`
- `packages/foundry/script/DeployCLAWDdca.s.sol` and `Deploy.s.sol`
- `packages/foundry/test/CLAWDdca.t.sol` plus mocks in `test/mocks/`

**Spec recap:** multi-position DCA on Base. USDC in, CLAWD out via Uniswap V3. Permissionless keepers earn 0.39% per swap; protocol owner earns 0.30%. Slippage protection via QuoterV2. OZ Pausable + ReentrancyGuard + SafeERC20 + Ownable2Step. Owner = job client `0x8d6FB6C5f77155FEF58629325ad62E295329e22D`.

## Severity summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 0 |
| Medium   | 3 |
| Low      | 4 |
| Info     | 9 |
| **Total**| **16** |

No Critical or High findings. The contract logic is conservative and the structure (CEI, SafeERC20, ReentrancyGuard, balance-delta accounting, partial-fill cap, pausable with withdrawals always open) is sound. Three Medium issues are worth addressing in Stage 4: a permanent-brick risk via `renounceOwnership`, the JIT-quote slippage model that does not protect against same-block manipulation, and the absence of any token-endpoint validation on `setSwapPath` (allowing the owner to silently misroute user funds with no on-chain check).

## Address sanity (verified live on Base mainnet via Alchemy)

| Constant | Address | On-chain check |
|---------|---------|----------------|
| `USDC`  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | bridged USDC, `decimals()=6`, `symbol()="USDC"` ✓ |
| `CLAWD` | `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` | `decimals()=18`, `symbol()="CLAWD"` ✓ |
| `SWAP_ROUTER` | `0x2626664c2603336E57B271c5C0b26F421741e481` | code present (Base SwapRouter02) ✓ |
| `QUOTER` | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` | code present (Base QuoterV2) ✓ |
| `WETH` | `0x4200000000000000000000000000000000000006` | canonical Base WETH ✓ |

Constructor swap path: `USDC -> WETH (0.05%) -> CLAWD (1%)`. The QuoterV2 will revert on the first execution if the WETH/CLAWD 1% pool does not actually exist on Base. The owner can recover via `setSwapPath`, but the deploy operator should sanity-check at least one ripe execution before announcing the contract as live. (Tracked under Info — deployment hygiene.)

---

# Findings

## [Medium-1] `renounceOwnership` not overridden — owner can permanently brick admin functions
**Location:** `CLAWDdca.sol:46` (contract declaration; missing override)
**Category:** Access control / centralization

### Description
`Ownable2Step` inherits `Ownable.renounceOwnership()`, which is callable by the current owner. Calling it on this contract sets the owner to `address(0)` permanently. Once renounced, the following are bricked forever:

- `pause()` / `unpause()` — emergency stop disabled
- `setSwapPath(bytes)` — cannot rotate to a new path if a pool dies, hostile MEV pool emerges, or token addresses change
- `collectProtocolFees()` — `protocolFeeBalance` continues to accrue but can never be withdrawn (USDC stuck in the contract)

User funds are not directly at risk (positions can still execute, withdraw, close), but **all accumulated protocol fees become permanently inaccessible**, and the contract loses its emergency-pause lever for the rest of its life. This is the same finding pattern from job #93 and is well-known to be an avoidable footgun in OZ-based contracts.

### Trace
1. Deployed contract: `owner = 0x8d6FB...e22D`.
2. Job client (or any compromised key holder) calls `renounceOwnership()`.
3. `_transferOwnership(address(0))` runs — `owner` is now `address(0)`.
4. Every `onlyOwner`-gated function reverts with `OwnableUnauthorizedAccount(0x0)`.
5. Time passes. Keepers continue executing. `protocolFeeBalance` grows. `collectProtocolFees()` reverts. USDC sits forever.

### Recommendation
Override `renounceOwnership` to revert. Simplest form:
```solidity
function renounceOwnership() public view override onlyOwner {
    revert("renounce disabled");
}
```
(or a custom error). This is consistent with the job #93 audit pattern and is low risk to add.

---

## [Medium-2] Same-block QuoterV2 quote provides no real slippage protection (sandwichable)
**Location:** `CLAWDdca.sol:312-316` (`_executeDCA`)
**Category:** DeFi / oracle integrity

### Description
The slippage floor is computed from a fresh `quoter.quoteExactInput(swapPath, swapInput)` call inside the same transaction as the swap. A QuoterV2 quote is *just-in-time*: it simulates the swap on the live state of the pool. An MEV searcher who sees the keeper's pending `executeDCA` transaction can:

1. Front-run with a buy that pushes USDC→CLAWD price up.
2. The keeper transaction now hits a manipulated pool. The quoter returns the new (worse) price as `expectedOut`.
3. `amountOutMinimum = expectedOut * (10000 - 300) / 10000` is computed against the manipulated price — i.e. 3% slippage on top of the already-bad price.
4. The router executes at the manipulated price, satisfying the (now also manipulated) minOut.
5. Searcher back-runs, pocketing the spread.

In effect, the slippage tolerance is "3% off whatever the manipulated pool says" instead of "3% off a fair price". The quoter call gives a useful sanity check (the contract reverts cleanly if the pool is empty or the path is broken), but it does **not** function as slippage protection in the MEV sense. The spec acknowledges this is a prototype, but the contract's NatSpec implies real slippage protection (`Slippage protection uses Uniswap V3 QuoterV2 — no oracle dependency`).

### Trace
- Keeper sends `executeDCA(positionId)` with `swapInput = 99,310,000` (99.31 USDC after fees on a 100 USDC swap).
- `IQuoterV2(QUOTER).quoteExactInput(swapPath, 99_310_000)` returns the *current* price.
- Searcher front-runs in the same block, distorting the pool — the quoter reads the distorted state.
- The slippage floor computed in the keeper's tx is therefore distorted.
- Search "sandwich attack on swap with on-chain quote" — well-known issue.

### Recommendation
Three options, in order of preference:

1. **Off-chain quoting**: keeper passes `amountOutMinimum` as a parameter computed off-chain (or signed by the position owner). Eliminates all on-chain MEV surface. Best fit for a permissionless-keeper model.
2. **TWAP**: Read `observe()` on a Uniswap V3 pool over N seconds (e.g. 30 minutes) and derive the expected price from `tickCumulatives`. Resistant to single-block manipulation.
3. **Document explicitly** that JIT slippage is best-effort and add a `maxSlippageBps` floor that is much tighter than the current 1000 bps cap. At minimum, drop the documentation claim that the quoter provides slippage protection.

Stage 4 should at minimum (a) update the NatSpec to make the JIT limitation explicit, and (b) consider whether the position owner's `slippageBps` parameter should default tighter than 300.

---

## [Medium-3] `setSwapPath` performs no token-endpoint validation — owner can silently misroute user USDC
**Location:** `CLAWDdca.sol:352-356`
**Category:** Access control / centralization / user funds at risk

### Description
`setSwapPath(bytes)` only checks `newPath.length >= 43`. It does not verify that:
- The first 20 bytes are the `USDC` constant (input token).
- The last 20 bytes are the `CLAWD` constant (output token).

Consequences:
1. A malicious or compromised owner can set the path to e.g. `USDC -> SOMECOIN`. Every subsequent `executeDCA` will swap user USDC for `SOMECOIN`, but `clawdReceived = balanceOf(CLAWD).delta = 0`, so users get **zero CLAWD credited** while their USDC is drained from the contract via the router. The router's output (`SOMECOIN`) goes to `address(this)` and is then trapped — only recoverable if owner subsequently fixes the path or sweeps tokens (no sweep function exists).
2. Even an honest owner setting a different output token (e.g. WETH) accidentally causes the same silent behavior.
3. The `amountOutMinimum` floor does not save users — it is computed for the current path's output, not a USDC→CLAWD invariant.

The spec ("owner can change swapPath; trust assumption") acknowledges general centralization risk, but a length-only check is *much* weaker than necessary. Adding 40 bytes of validation eliminates an entire class of error/exploit at zero gas cost.

### Trace
1. Deployed contract sets path = `USDC | 0x0001f4 | WETH | 0x002710 | CLAWD`. ✓
2. Owner calls `setSwapPath(USDC | 0x000bb8 | someToken)` — passes `length >= 43` check.
3. Alice has $10,000 in a position. Keeper executes.
4. `keeperFee` and `protocolFee` deducted in USDC, transferred normally. ✓
5. Router pulls `swapInput` USDC from the contract.
6. Router outputs `someToken` to `address(this)` — but the contract reads `balanceOf(CLAWD)` which is unchanged.
7. `clawdReceived = 0`. Position's `clawdAccrued += 0`. Alice's USDC balance dropped to 0 over many executions; her `clawdAccrued` is 0.
8. `someToken` accumulates in the contract; no sweep function — stuck.

### Recommendation
Add minimal endpoint validation in `setSwapPath`:
```solidity
function setSwapPath(bytes calldata newPath) external onlyOwner {
    if (newPath.length < 43) revert InvalidPath();
    address first; address last;
    assembly {
        first := shr(96, calldataload(newPath.offset))
        last  := shr(96, calldataload(add(newPath.offset, sub(newPath.length, 20))))
    }
    if (first != USDC) revert InvalidPath();
    if (last != CLAWD) revert InvalidPath();
    swapPath = newPath;
    emit SwapPathUpdated(newPath);
}
```
(Or pull the bytes from calldata using non-assembly slicing.) This forces the input/output tokens to remain USDC/CLAWD; intermediate hops and fee tiers stay flexible, preserving the spec's intent.

Optionally, add a `sweep(address token)` for the owner restricted to non-USDC/CLAWD tokens, so that intermediate-token dust accidentally trapped during a path migration can be recovered.

---

## [Low-1] `positionsByOwner` is append-only — closed positions linger forever
**Location:** `CLAWDdca.sol:95, 190` (mapping declaration; push in `createPosition`)
**Category:** UX / gas / off-chain integration

### Description
`positionsByOwner[msg.sender].push(positionId)` runs on every `createPosition`. There is no removal on `closePosition`. The view `getPositionsByOwner(owner_)` therefore returns an ever-growing list including all closed positions. Off-chain UIs must filter by `p.active`, and a user who has been DCA'ing for a year will accumulate stale ids that hurt the UX and increase RPC payload.

### Recommendation
Either (a) document that consumers must filter by `p.active` in the NatSpec; or (b) add a swap-and-pop on `closePosition`. Option (a) is sufficient for a prototype; option (b) is the cleaner fix.

---

## [Low-2] `closePosition` does not check `p.active` — re-closing emits a misleading event
**Location:** `CLAWDdca.sol:226-244`
**Category:** Event integrity / minor

### Description
`closePosition` reverts on `PositionNotFound` and `NotPositionOwner`, but does **not** revert if the position is already inactive. Calling it on a closed position is a no-op for state and transfers (both balances are zero), but **emits another `PositionClosed(positionId)` event**. Indexers and UIs that count `PositionClosed` events will double-count.

### Recommendation
```solidity
if (!p.active) revert PositionInactive();
```
Add at the top of `closePosition`. Also lets users see an explicit revert instead of a silent re-emit.

---

## [Low-3] Reentrancy test is weakened by the mock router silently swallowing the inner call
**Location:** `CLAWDdca.t.sol:389-406`, `MockSwapRouter.sol:58-63`
**Category:** Test coverage

### Description
`test_ExecuteDCA_ReentrancyBlocked` configures the router to call back into `executeDCA`, then asserts that only one swap happened. This does demonstrate that `nonReentrant` blocks the inner call — but the mock catches the failure (`(bool ok,) = reentrancyTarget.call(...)`, then `ok;`). The test never asserts the *reason* the inner call failed. A bug that swallowed the inner failure for some other reason (e.g. an error in the calldata path) would still pass.

There is also no test for reentry into `withdrawCLAWD` or `closePosition` from inside `executeDCA`'s router call.

### Recommendation
Either:
- Have the mock bubble up the inner revert (do not swallow), and assert `vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)` for the outer call.
- Or add a second test that targets `withdrawCLAWD` from the router callback (after a previous successful swap that accrued CLAWD), which will exercise the same guard against a different entry point.

This is test polish, not a contract bug — `nonReentrant` is on every state-changing entry point.

---

## [Low-4] `positionsByOwner` and `executeBatch` have unbounded loops — UI must guard
**Location:** `CLAWDdca.sol:274-284` (`executeBatch`), `CLAWDdca.sol:387-402` (`getRipePositions`)
**Category:** DoS / gas

### Description
Both `executeBatch(uint256[] calldata positionIds)` and `getRipePositions(uint256[] calldata positionIds)` iterate over a caller-supplied array. The caller pays gas, so this is not an exploit vector against the contract, but a careless keeper UI that passes a 10,000-element array will hit the block gas limit on Base and the entire batch reverts. Combined with the "if any single swap reverts, batch reverts" semantics (`_executeDCA` is not wrapped in try/catch), one malformed position can silently kill a large batch.

### Recommendation
Document that callers must:
- Pre-filter via `getRipePositions` (already documented in the NatSpec).
- Cap batch size on the client side (e.g. 50 positions).

Optionally, wrap the inner `_executeDCA` call in `executeBatch` with `try this._executeDCA(positionId) {} catch {}` so a single bad position cannot kill the batch — but this requires `_executeDCA` to be `external` and changes the reentrancy story. Probably not worth it for a prototype; documenting the requirement is enough.

---

## [Info-1] `setSwapPath` allows the owner to redirect to a worse-priced path with no timelock
**Location:** `CLAWDdca.sol:352-356`
**Category:** Centralization

### Description
There is no timelock between `setSwapPath` and the next `executeDCA`. An owner could front-run their own keepers with a bad path. Spec acknowledges as out of scope for the prototype.

### Recommendation
Document the trust assumption explicitly in NatSpec ("Owner can rotate the swap path at any time. Users must trust the owner not to misroute funds. Mitigations: timelock or governance not in scope for this prototype.") If escalated to production, add a 24-hour timelock or a Multisig owner.

---

## [Info-2] `lastExecutedEpoch` first-init underflow guard is correct, defense-in-depth in practice
**Location:** `CLAWDdca.sol:176-178`
**Category:** Math / defense-in-depth

### Description
```solidity
uint256 ripeStart = currentEpoch();
uint256 lastExecutedEpoch_ = ripeStart >= intervalInEpochs ? ripeStart - intervalInEpochs : 0;
```
On Base mainnet today, `currentEpoch() = block.timestamp / 10800 ≈ 4,738,000`. There is no realistic `intervalInEpochs` that would underflow. The guard is correct anyway and protects test environments forked at genesis. No action needed; flagged so Stage 4 doesn't accidentally remove it.

---

## [Info-3] `setSwapPath` emits the new path; consider also asserting the constructor's path is reachable
**Location:** `CLAWDdca.sol:142-148`
**Category:** Deployment hygiene

### Description
Constructor sets `swapPath = USDC | 500 | WETH | 10000 | CLAWD`. If the WETH/CLAWD 1% pool does not exist on Base at deploy time, `executeDCA` will revert on the QuoterV2 call until the owner calls `setSwapPath` to a valid path. Recoverable, not stuck — the user funds are safe (createPosition / topUp / close all work without the swap pool), and the keeper can simply not execute. Worth verifying liveness manually before announcing the contract.

### Recommendation
Stage 5 (deploy) should run a single dry-run `quoteExactInput` against the constructor path immediately after deployment. If it reverts, owner calls `setSwapPath` with a working path before announcing.

---

## [Info-4] `intervalInEpochs` is unbounded
**Location:** `CLAWDdca.sol:169`
**Category:** Spec / parameter validation

### Description
A user could call `createPosition(totalUSDC, amountPerSwap, type(uint256).max)`. The position is never ripe; `executeDCA` reverts with `NotRipe`. User can recover via `closePosition`. Annoying but not a security issue. Could be capped at e.g. 8 * 365 = 2920 epochs (1 year of 3-hour intervals) for sanity.

### Recommendation
Optional: add `if (intervalInEpochs > MAX_INTERVAL_EPOCHS) revert ZeroInterval();` (or a new error). Not blocking.

---

## [Info-5] Dust positions waste keeper gas; no minimum `amountPerSwap`
**Location:** `CLAWDdca.sol:161-193`
**Category:** Keeper economics

### Description
A user could create `amountPerSwap = 4` (4 wei USDC = 4 micro-cents). Fees truncate to 0 (since `4 * 39 / 10000 = 0`). Swap proceeds with `swapInput = 4`. Keeper pays gas, earns 0 USDC. Self-policing — keepers will simply ignore tiny positions. No exploit, but a public `getRipePositions` consumer could be tricked into wasting gas. Document that off-chain keeper logic should filter by minimum profitability.

### Recommendation
Optional: enforce `amountPerSwap >= 1e6` (1 USDC minimum) so the keeper fee is at least 0.0039 USDC. Trade-off: limits flexibility for testnet / very small positions. Not blocking.

---

## [Info-6] Contract has no `sweep(address)` for accidentally-sent tokens
**Location:** Contract surface
**Category:** Recoverability

### Description
If a user mistakenly sends USDC, CLAWD, WETH, or any other token directly to the contract address (without going through `createPosition` / `topUpPosition`), the funds are unrecoverable. For USDC this is partially recoverable (`protocolFeeBalance` accounting drifts: any extra USDC sitting in the contract is silently captured by `collectProtocolFees` math? — actually no: `collectProtocolFees` transfers exactly `protocolFeeBalance`, not the contract's USDC balance, so the orphan USDC stays stuck).

### Recommendation
Optional `sweep(address token)` callable by owner, restricted to tokens that aren't USDC/CLAWD (or, more flexibly, that subtract known accounted amounts before sweeping). Out of scope for a prototype but worth noting.

---

## [Info-7] Constructor does not validate `WETH` is in the swap path constants
**Location:** `CLAWDdca.sol:142-148`
**Category:** Code clarity

### Description
`WETH` is referenced only in the constructor's default path. If a future owner sets `setSwapPath` to a USDC->CLAWD direct path, `WETH` becomes dead code. Cosmetic.

### Recommendation
None required. Could be removed if a future revision is sure no path will go via WETH.

---

## [Info-8] Test coverage gaps
**Location:** Test suite
**Category:** Test hygiene (not blocking)

### Description
Missing or weak tests:
- No test for `setSwapPath` while paused (should succeed — admin functions are not pause-gated).
- No test for `withdrawCLAWD` while contract is paused **with** non-zero CLAWD already accrued — close to existing `test_WithdrawCLAWD_AllowedWhenPaused` but worth keeping after any refactor.
- No test that `collectProtocolFees` succeeds while paused.
- No test for `setSlippageTolerance(0)` (no slippage tolerance — should still work, with the floor pegged to the quoter's output exactly).
- Test for the `MockQuoter`-vs-production `IQuoterV2` interface mismatch: production `quoteExactInput` is non-view; mock is view. Mock returns equivalent values, but a contract change that depended on the side-effects-then-revert pattern would silently pass against the mock.

### Recommendation
Stage 4 may add the missing assertions if time permits, but no test failure is currently blocking.

---

## [Info-9] `event PositionToppedUp` does not include resulting balance
**Location:** `CLAWDdca.sol:107`
**Category:** Indexing UX

### Description
Indexers must `eth_call` to get the post-top-up `usdcBalance`. Adding `uint256 newBalance` to the event would let pure-event-stream indexers reconstruct state.

### Recommendation
Optional event signature change. Not blocking.

---

# Items explicitly checked and PASSED

These were on the Stage 3 dimension list and were verified against the source. Listing them so Stage 4 has a clear "do not regress" map.

- **Ownable2Step**: correctly imported and inherited; constructor passes `initialOwner` to `Ownable(initialOwner)`; the `pendingOwner` flow is exercised in `test_Ownable2Step_TransferFlow`.
- **`onlyOwner` gating**: `pause`, `unpause`, `setSwapPath`, `collectProtocolFees` all use `onlyOwner`. Verified.
- **Position-owner gating**: `topUpPosition`, `withdrawCLAWD`, `closePosition`, `setSlippageTolerance` all check `p.owner == msg.sender` after a `PositionNotFound` precheck. Verified.
- **SafeERC20**: every transfer uses `safeTransfer` / `safeTransferFrom`; router approval uses `forceApprove`. Verified.
- **USDC = bridged USDC on Base**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` matches the canonical bridged USDC, **not** native USDC (`0xd9aAEcc...`). The spec required bridged USDC. Verified live via `cast`.
- **Balance-delta accounting on CLAWD**: `clawdBefore` / balance after subtraction handles fee-on-transfer and rebasing tokens correctly. Verified.
- **Reentrancy**: `executeDCA`, `executeBatch`, `withdrawCLAWD`, `closePosition`, `collectProtocolFees` all `nonReentrant`. CEI ordering: state writes precede external calls in `_executeDCA` (line 301-304 vs line 308+). Verified.
- **Fee math**: `keeperFee = swapAmount * 39 / 10000`, `protocolFee = swapAmount * 30 / 10000`; sum 69 bps; `swapInput = swapAmount - keeperFee - protocolFee` is always positive. Verified by trace at `swapAmount = 100e6`: `keeperFee = 390000`, `protocolFee = 300000`, `swapInput = 99310000`. Tests confirm.
- **`amountOutMinimum`**: `(expectedOut * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR`. Correct math. Verified.
- **Pausable correctness**: `whenNotPaused` on `createPosition`, `topUpPosition`, `executeDCA`, `executeBatch` — all four. Verified. Withdrawals (`withdrawCLAWD`, `closePosition`), admin (`pause`, `unpause`, `setSwapPath`, `collectProtocolFees`, `setSlippageTolerance`) NOT pause-gated. Tests `test_WithdrawCLAWD_AllowedWhenPaused` and `test_ClosePosition_AllowedWhenPaused` cover this. Verified.
- **Constructor**: rejects zero owner, sets default path, `nextPositionId = 1`. Verified.
- **Deploy script**: `DeployCLAWDdca.s.sol` passes `JOB_CLIENT = 0x8d6FB6C5f77155FEF58629325ad62E295329e22D` to `new CLAWDdca(...)`, matching the LeftClaw "owner = job client" rule. `Deploy.s.sol` orchestrator wires it correctly. Verified.
- **Partial-fill cap**: `swapAmount = p.amountPerSwap > p.usdcBalance ? p.usdcBalance : p.amountPerSwap` correctly drains the last partial swap and deactivates the position. Verified by `test_ExecuteDCA_PartialExecutionDeactivates`.
- **`forceApprove`**: handles tokens that require zero-before-reset. Bridged USDC on Base does not have this restriction, but `forceApprove` is defensive. Verified.

---

# Stage 4 — top three priorities

1. **[Medium-1]** Override `renounceOwnership` to revert. Five lines of code; eliminates the permanent-brick path.
2. **[Medium-3]** Validate that `setSwapPath`'s first 20 bytes equal `USDC` and last 20 bytes equal `CLAWD`. Eliminates an entire silent-misrouting class. Optional bonus: add a non-USDC/CLAWD `sweep` for owner.
3. **[Medium-2]** Either downgrade the NatSpec to honestly describe the JIT slippage model as best-effort, or replace it with off-chain `amountOutMinimum` from the keeper / position owner. The current docstring overstates the protection.

After those, address Low-1 / Low-2 (cheap quality improvements), and consider the test coverage gaps in Info-8.

---

*End of Stage 3 audit.*

---

# Stage 4 Resolution

**Resolution commit follows Stage 3 commit `3cfa26e`. Tests: 45 → 58 (added 13 covering new behavior). `forge build` exit 0; `forge test -vv` 58/58 pass.**

## Mediums

### [Medium-1] `renounceOwnership` not overridden — **FIXED**
- Added custom error `OwnershipCannotBeRenounced()` (`CLAWDdca.sol:144`).
- Overrode `Ownable.renounceOwnership()` to revert (`CLAWDdca.sol:391-393`):
  ```solidity
  function renounceOwnership() public view override onlyOwner {
      revert OwnershipCannotBeRenounced();
  }
  ```
- Tests added (`CLAWDdca.t.sol`): `test_RenounceOwnership_RevertsForOwner` (owner gets `OwnershipCannotBeRenounced`, owner unchanged), `test_RenounceOwnership_RevertsForNonOwner` (non-owner gets `OwnableUnauthorizedAccount` from `onlyOwner` before reaching the revert body).
- Closes GitHub issue #1.

### [Medium-2] JIT QuoterV2 slippage is sandwichable — **FIXED (Option B)**
- Chose **Option B**: added `executeDCAWithMin(uint256 positionId, uint256 amountOutMinimum)` (`CLAWDdca.sol:299-301`) as a production-safe entrypoint where the keeper supplies an off-chain-computed minimum. Kept `executeDCA(positionId)` as the best-effort QuoterV2 path. Both call a refactored shared internal `_executeDCA(positionId, suppliedMin, useQuoter)`.
- Updated the contract NatSpec (`CLAWDdca.sol:37-54`) to clearly state that the same-block QuoterV2 quote is best-effort only and is NOT sandwich-resistant; explicitly directs production keepers to use `executeDCAWithMin`. Also added a NatSpec note on `executeDCA` and on `executeBatch` clarifying their best-effort status.
- `executeBatch` continues to use the QuoterV2 path because batched off-chain quotes per-position are a keeper-orchestration concern; the docstring now flags this.
- Tests added: `test_ExecuteDCAWithMin_Happy`, `test_ExecuteDCAWithMin_RevertsBelowSuppliedMin`, `test_ExecuteDCAWithMin_RevertsWhenPaused`, `test_ExecuteDCAWithMin_NotRipe`, `test_ExecuteDCAWithMin_ZeroMinAcceptsAnyOutput` (last one documents that `0` minimum is permitted but discouraged).
- Closes GitHub issue #2.

### [Medium-3] `setSwapPath` token-endpoint validation — **FIXED**
- Added `_validateSwapPath(bytes calldata)` helper (`CLAWDdca.sol:407-422`) that enforces:
  - `length >= 43` (single-hop minimum).
  - `(length - 20) % 23 == 0` (valid Uniswap V3 hop pattern: `token(20) + (fee(3) + token(20))^N`).
  - First 20 bytes equal `USDC`.
  - Last 20 bytes equal `CLAWD`.
- All four checks revert with `InvalidPath`. The first/last token reads use a small `assembly` block on `calldataload(newPath.offset)` and `calldataload(add(newPath.offset, sub(newPath.length, 20)))`, with `shr(96, ...)` to right-align the 20-byte address (verified against the Solidity calldata layout for `bytes calldata`).
- `setSwapPath` (`CLAWDdca.sol:357-361`) calls `_validateSwapPath` before storing and emitting.
- Constructor (`CLAWDdca.sol:152-161`) confirms its built-in path passes the same length-structure check via a `require`. The endpoint check would also pass by construction (the encoded path begins with `USDC` and ends with `CLAWD`); the structural length check is the only one we re-run for defense-in-depth without duplicating address-comparison logic for `bytes memory`.
- Tests added: `test_SetSwapPath_RevertsBadStartToken`, `test_SetSwapPath_RevertsBadEndToken`, `test_SetSwapPath_RevertsBadLength44`, `test_SetSwapPath_AcceptsSingleHopUsdcToClawd` (43 bytes), `test_SetSwapPath_AcceptsMultiHopUsdcWethClawd` (66 bytes). The pre-existing `test_SetSwapPath_RevertsTooShort` (42 bytes) and `test_SetSwapPath_Happy` (single-hop USDC→CLAWD) continue to pass.
- Closes GitHub issue #3. No optional `sweep(address)` was added — the audit flagged it as out-of-scope for a prototype, and sweep introduces its own surface area; deferring.

## Lows

### [Low-1] `positionsByOwner` append-only — **DOCUMENTED**
- Added a NatSpec comment on the storage slot (`CLAWDdca.sol:99-101`) telling consumers to filter by `positions[id].active`.
- No structural change. Adding swap-and-pop on `closePosition` would change closed-position iteration order off-chain and is a UX call best made when the keeper UI is built.

### [Low-2] `closePosition` double-close emits misleading event — **FIXED**
- Added `if (!p.active) revert PositionInactive();` in `closePosition` (`CLAWDdca.sol:233`).
- Test added: `test_ClosePosition_RevertsWhenAlreadyClosed`. No other tests broke (closes everywhere else only happen once on each id).

### [Low-3] Reentrancy test weakened by mock swallowing inner call — **WON'T-FIX (deferred)**
- The audit explicitly notes "this is test polish, not a contract bug." `nonReentrant` is on every external state-changing entry point and is verified across the suite. The cost of refactoring `MockSwapRouter` to bubble revert reasons (or adding a second test path through `withdrawCLAWD`) is non-trivial relative to the current 58-test coverage.
- Documenting as deferred per Stage 4 scope. Worth picking up if a future audit finds an actual reentrancy gap.

### [Low-4] `executeBatch` / `getRipePositions` unbounded loops — **DOCUMENTED**
- The audit's recommendation was to document, which the existing NatSpec on `executeBatch` already does ("caller is expected to filter the input list using `getRipePositions` first"). Stage 4 strengthened the NatSpec further to call out that `executeBatch` uses on-chain QuoterV2 (best-effort).
- No code change. Caller pays gas; not an exploit vector.

## Infos

### [Info-1] `setSwapPath` no timelock — **WON'T-FIX (out of scope per spec)**
- Spec acknowledges this; Stage 4 Medium-3 fix narrowed the surface to "owner can pick any USDC→…→CLAWD route," eliminating the silent-misroute class.

### [Info-2] `lastExecutedEpoch` first-init underflow guard — **NO ACTION**
- Defense-in-depth retained. No regression.

### [Info-3] Constructor path liveness check — **DEPLOY-TIME (Stage 5)**
- Stage 5 will run a one-shot `quoteExactInput` against the constructor path before announcing. Out of contract scope.

### [Info-4] `intervalInEpochs` unbounded — **WON'T-FIX**
- Self-recoverable via `closePosition`. Not blocking.

### [Info-5] No minimum `amountPerSwap` — **WON'T-FIX**
- Self-policing for keepers; flexibility is intentional.

### [Info-6] No `sweep(address)` — **WON'T-FIX**
- Out of prototype scope; flagged by audit for production consideration.

### [Info-7] `WETH` constant could become dead code — **NO ACTION**
- Cosmetic.

### [Info-8] Test coverage gaps — **PARTIALLY ADDRESSED**
- Stage 4 added 13 new tests covering: renounceOwnership for owner+non-owner, swap-path endpoint validation (4 negative + 2 positive), executeDCAWithMin (5 cases), closePosition double-close. The audit's specific suggested gaps (admin-while-paused, slippageBps==0) were not added — the existing `test_WithdrawCLAWD_AllowedWhenPaused` and `test_ClosePosition_AllowedWhenPaused` cover the paused-withdrawal model, and `setSlippageTolerance(0)` is allowed by `if (bps > MAX_SLIPPAGE_BPS) revert SlippageTooHigh()` which permits zero by definition. Adding more polish tests is no longer blocking.

### [Info-9] `PositionToppedUp` missing newBalance — **WON'T-FIX**
- Event signature change has bytecode/ABI cost. Indexers can read post-state via `eth_call`. Not blocking.

## Test count
- Stage 3: 45 tests, all passing.
- Stage 4: 58 tests (+13 new), all passing.

## Build
- `forge build` exit 0 (linter-style notes about `mixedCase` on `executeDCA` / `executeDCAWithMin` are intentional — the `DCA` acronym is part of the public API and matches the contract name).

*End of Stage 4 resolution.*
