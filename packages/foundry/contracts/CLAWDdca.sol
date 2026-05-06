// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Minimal SwapRouter02 interface (Base mainnet — no `deadline` field).
interface ISwapRouter02 {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Minimal Uniswap V3 QuoterV2 interface.
/// @dev `quoteExactInput` is non-view (state-mutating revert pattern). Calls to it will mutate-then-revert internally
///      and return the quote via the QuoterV2 wrapper. We call it directly — gas cost is acceptable for this prototype.
interface IQuoterV2 {
    function quoteExactInput(bytes memory path, uint256 amountIn)
        external
        returns (
            uint256 amountOut,
            uint160[] memory sqrtPriceX96AfterList,
            uint32[] memory initializedTicksCrossedList,
            uint256 gasEstimate
        );
}

/**
 * @title CLAWDdca
 * @notice Permissionless dollar-cost-averaging engine: users park USDC, anyone (a "keeper") triggers
 *         the swap once a position is ripe, the contract pays the keeper and a protocol fee, swaps the
 *         remainder for CLAWD via Uniswap V3, and credits CLAWD to the position. Owner withdraws CLAWD
 *         or closes the position at any time. Pausable; withdrawals stay open while paused.
 * @dev Hardcoded to the Base mainnet token + router addresses listed below. Slippage protection uses
 *      Uniswap V3 QuoterV2 — no oracle dependency.
 */
contract CLAWDdca is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------------------------------
    // External token + protocol addresses (Base mainnet, chain 8453)
    // ---------------------------------------------------------------------------------------------

    /// @notice CLAWD ERC20 (18 decimals, assumed).
    address public constant CLAWD = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    /// @notice USDC bridged on Base (6 decimals).
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    /// @notice Uniswap V3 SwapRouter02 on Base.
    address public constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    /// @notice WETH on Base.
    address public constant WETH = 0x4200000000000000000000000000000000000006;

    /// @notice Uniswap V3 QuoterV2 on Base.
    address public constant QUOTER = 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a;

    // ---------------------------------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------------------------------

    uint256 public constant EPOCH_DURATION = 3 hours;
    uint256 public constant KEEPER_FEE_BPS = 39; // 0.39%
    uint256 public constant PROTOCOL_FEE_BPS = 30; // 0.30%
    uint256 public constant DEFAULT_SLIPPAGE_BPS = 300; // 3%
    uint256 public constant MAX_SLIPPAGE_BPS = 1000; // 10%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ---------------------------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------------------------

    struct Position {
        address owner;
        uint256 usdcBalance;
        uint256 clawdAccrued;
        uint256 amountPerSwap;
        uint256 intervalInEpochs;
        uint256 lastExecutedEpoch;
        uint256 slippageBps;
        bool active;
    }

    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public positionsByOwner;
    uint256 public nextPositionId; // monotonic, starts at 1
    uint256 public protocolFeeBalance; // USDC fee accrual, withdrawable by owner
    bytes public swapPath;

    // ---------------------------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------------------------

    event PositionCreated(
        uint256 indexed positionId, address indexed owner, uint256 amountPerSwap, uint256 intervalInEpochs
    );
    event PositionToppedUp(uint256 indexed positionId, uint256 amount);
    event DCAExecuted(
        uint256 indexed positionId,
        uint256 usdcSpent,
        uint256 clawdReceived,
        uint256 keeperFee,
        uint256 protocolFee,
        address indexed keeper
    );
    event CLAWDWithdrawn(uint256 indexed positionId, address indexed owner, uint256 amount);
    event PositionClosed(uint256 indexed positionId);
    event SlippageUpdated(uint256 indexed positionId, uint256 bps);
    event ProtocolFeesCollected(uint256 amount);
    event SwapPathUpdated(bytes path);

    // ---------------------------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------------------------

    error NotPositionOwner();
    error PositionInactive();
    error PositionNotFound();
    error ZeroAmount();
    error AmountExceedsBalance();
    error ZeroInterval();
    error NotRipe();
    error SlippageTooHigh();
    error InvalidPath();
    error ZeroAddress();

    // ---------------------------------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------------------------------

    /// @param initialOwner The job client — receives ownership.
    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        // USDC -> WETH (0.05%) -> CLAWD (1%)
        swapPath = abi.encodePacked(USDC, uint24(500), WETH, uint24(10_000), CLAWD);
        nextPositionId = 1;
        emit SwapPathUpdated(swapPath);
    }

    // ---------------------------------------------------------------------------------------------
    // Position lifecycle — user-facing
    // ---------------------------------------------------------------------------------------------

    /**
     * @notice Open a new DCA position by depositing USDC.
     * @param totalUSDC Total USDC to deposit up front.
     * @param amountPerSwap Gross USDC per execution (fees deducted from this amount).
     * @param intervalInEpochs How many 3-hour epochs must pass between executions.
     * @return positionId Newly assigned position id.
     */
    function createPosition(uint256 totalUSDC, uint256 amountPerSwap, uint256 intervalInEpochs)
        external
        whenNotPaused
        returns (uint256 positionId)
    {
        if (totalUSDC == 0) revert ZeroAmount();
        if (amountPerSwap == 0) revert ZeroAmount();
        if (amountPerSwap > totalUSDC) revert AmountExceedsBalance();
        if (intervalInEpochs == 0) revert ZeroInterval();

        IERC20(USDC).safeTransferFrom(msg.sender, address(this), totalUSDC);

        positionId = nextPositionId++;

        // First execution should be immediately ripe — set lastExecutedEpoch so currentEpoch already satisfies the interval.
        uint256 ripeStart = currentEpoch();
        // Avoid underflow when block.timestamp is small (test environments / forks at genesis).
        uint256 lastExecutedEpoch_ = ripeStart >= intervalInEpochs ? ripeStart - intervalInEpochs : 0;

        positions[positionId] = Position({
            owner: msg.sender,
            usdcBalance: totalUSDC,
            clawdAccrued: 0,
            amountPerSwap: amountPerSwap,
            intervalInEpochs: intervalInEpochs,
            lastExecutedEpoch: lastExecutedEpoch_,
            slippageBps: DEFAULT_SLIPPAGE_BPS,
            active: true
        });
        positionsByOwner[msg.sender].push(positionId);

        emit PositionCreated(positionId, msg.sender, amountPerSwap, intervalInEpochs);
    }

    /// @notice Add USDC to an existing position.
    function topUpPosition(uint256 positionId, uint256 amount) external whenNotPaused {
        Position storage p = positions[positionId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (!p.active) revert PositionInactive();
        if (amount == 0) revert ZeroAmount();

        IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        p.usdcBalance += amount;

        emit PositionToppedUp(positionId, amount);
    }

    /// @notice Withdraw all accrued CLAWD from a position. Allowed even when paused.
    function withdrawCLAWD(uint256 positionId) external nonReentrant {
        Position storage p = positions[positionId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        uint256 amount = p.clawdAccrued;
        if (amount == 0) revert ZeroAmount();

        // CEI
        p.clawdAccrued = 0;
        IERC20(CLAWD).safeTransfer(p.owner, amount);

        emit CLAWDWithdrawn(positionId, p.owner, amount);
    }

    /// @notice Close a position and return any remaining USDC + accrued CLAWD. Allowed even when paused.
    function closePosition(uint256 positionId) external nonReentrant {
        Position storage p = positions[positionId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        uint256 usdcAmount = p.usdcBalance;
        uint256 clawdAmount = p.clawdAccrued;
        address ownerAddr = p.owner;

        // CEI
        p.usdcBalance = 0;
        p.clawdAccrued = 0;
        p.active = false;

        if (usdcAmount > 0) IERC20(USDC).safeTransfer(ownerAddr, usdcAmount);
        if (clawdAmount > 0) IERC20(CLAWD).safeTransfer(ownerAddr, clawdAmount);

        emit PositionClosed(positionId);
    }

    /// @notice Update the slippage tolerance (in bps) for a position.
    function setSlippageTolerance(uint256 positionId, uint256 bps) external {
        Position storage p = positions[positionId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (bps > MAX_SLIPPAGE_BPS) revert SlippageTooHigh();

        p.slippageBps = bps;
        emit SlippageUpdated(positionId, bps);
    }

    // ---------------------------------------------------------------------------------------------
    // Keeper-facing
    // ---------------------------------------------------------------------------------------------

    /**
     * @notice Trigger a DCA swap for a single ripe position. Caller (keeper) earns 0.39% of `amountPerSwap`.
     * @dev CEI ordering: state updated (balance, epoch, fees) before any external call.
     */
    function executeDCA(uint256 positionId) external whenNotPaused nonReentrant {
        _executeDCA(positionId);
    }

    /**
     * @notice Trigger DCA across many positions. Skips silently if a position is inactive, has zero balance,
     *         or is not ripe. If the swap itself reverts (e.g. slippage), the whole batch reverts — the
     *         caller is expected to filter the input list using `getRipePositions` first.
     */
    function executeBatch(uint256[] calldata positionIds) external whenNotPaused nonReentrant {
        uint256 currentEpoch_ = currentEpoch();
        for (uint256 i = 0; i < positionIds.length; ++i) {
            uint256 positionId = positionIds[i];
            Position storage p = positions[positionId];
            if (!p.active) continue;
            if (p.usdcBalance == 0) continue;
            if (currentEpoch_ < p.lastExecutedEpoch + p.intervalInEpochs) continue;
            _executeDCA(positionId);
        }
    }

    /// @dev Shared DCA execution body.
    function _executeDCA(uint256 positionId) internal {
        Position storage p = positions[positionId];
        if (!p.active) revert PositionInactive();
        if (p.usdcBalance == 0) revert ZeroAmount();
        uint256 currentEpoch_ = currentEpoch();
        if (currentEpoch_ < p.lastExecutedEpoch + p.intervalInEpochs) revert NotRipe();

        uint256 swapAmount = p.amountPerSwap > p.usdcBalance ? p.usdcBalance : p.amountPerSwap;
        uint256 keeperFee = (swapAmount * KEEPER_FEE_BPS) / BPS_DENOMINATOR;
        uint256 protocolFee = (swapAmount * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 swapInput = swapAmount - keeperFee - protocolFee;
        uint256 slippageBps_ = p.slippageBps;

        // ---- effects (CEI) ----
        p.usdcBalance -= swapAmount;
        p.lastExecutedEpoch = currentEpoch_;
        protocolFeeBalance += protocolFee;
        if (p.usdcBalance == 0) p.active = false;

        // ---- interactions ----
        // Pay keeper their fee in USDC.
        if (keeperFee > 0) IERC20(USDC).safeTransfer(msg.sender, keeperFee);

        // Quote expected output to compute slippage floor.
        // QuoterV2.quoteExactInput is state-mutating-then-revert; calling it from a non-view context costs gas.
        uint256 expectedOut;
        {
            (expectedOut,,,) = IQuoterV2(QUOTER).quoteExactInput(swapPath, swapInput);
        }
        uint256 amountOutMinimum = (expectedOut * (BPS_DENOMINATOR - slippageBps_)) / BPS_DENOMINATOR;

        // Approve router for exactly swapInput.
        IERC20(USDC).forceApprove(SWAP_ROUTER, swapInput);

        uint256 clawdBefore = IERC20(CLAWD).balanceOf(address(this));

        ISwapRouter02.ExactInputParams memory params = ISwapRouter02.ExactInputParams({
            path: swapPath,
            recipient: address(this),
            amountIn: swapInput,
            amountOutMinimum: amountOutMinimum
        });
        ISwapRouter02(SWAP_ROUTER).exactInput(params);

        uint256 clawdReceived = IERC20(CLAWD).balanceOf(address(this)) - clawdBefore;
        p.clawdAccrued += clawdReceived;

        emit DCAExecuted(positionId, swapInput, clawdReceived, keeperFee, protocolFee, msg.sender);
    }

    // ---------------------------------------------------------------------------------------------
    // Owner-only
    // ---------------------------------------------------------------------------------------------

    /// @notice Withdraw accumulated protocol fees (USDC) to the contract owner.
    function collectProtocolFees() external onlyOwner nonReentrant {
        uint256 amount = protocolFeeBalance;
        if (amount == 0) revert ZeroAmount();
        protocolFeeBalance = 0;
        IERC20(USDC).safeTransfer(owner(), amount);
        emit ProtocolFeesCollected(amount);
    }

    /// @notice Update the Uniswap V3 swap path (e.g. to skip WETH if a direct USDC/CLAWD pool exists).
    /// @dev Single-hop is 43 bytes (20 + 3 + 20). Multi-hop is longer (each extra hop adds 23 bytes).
    function setSwapPath(bytes calldata newPath) external onlyOwner {
        if (newPath.length < 43) revert InvalidPath();
        swapPath = newPath;
        emit SwapPathUpdated(newPath);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function currentEpoch() public view returns (uint256) {
        return block.timestamp / EPOCH_DURATION;
    }

    /// @notice Convenience check used by keeper UIs.
    function isRipe(uint256 positionId) external view returns (bool) {
        Position storage p = positions[positionId];
        if (!p.active) return false;
        if (p.usdcBalance == 0) return false;
        return currentEpoch() >= p.lastExecutedEpoch + p.intervalInEpochs;
    }

    function getPositionsByOwner(address owner_) external view returns (uint256[] memory) {
        return positionsByOwner[owner_];
    }

    /// @notice Filter a list of position ids down to those that are ripe right now.
    function getRipePositions(uint256[] calldata positionIds) external view returns (uint256[] memory) {
        uint256 currentEpoch_ = currentEpoch();
        uint256[] memory tmp = new uint256[](positionIds.length);
        uint256 count;
        for (uint256 i = 0; i < positionIds.length; ++i) {
            Position storage p = positions[positionIds[i]];
            if (!p.active) continue;
            if (p.usdcBalance == 0) continue;
            if (currentEpoch_ < p.lastExecutedEpoch + p.intervalInEpochs) continue;
            tmp[count++] = positionIds[i];
        }
        // Trim
        uint256[] memory out = new uint256[](count);
        for (uint256 j = 0; j < count; ++j) out[j] = tmp[j];
        return out;
    }
}
