// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMintableMock {
    function mint(address to, uint256 amount) external;
}

/// @notice Minimal Uniswap V3 SwapRouter02 mock.
/// @dev Supports `exactInput` against a configurable input/output token pair. Pulls the input token from
///      the caller via transferFrom and mints `amountOut = amountIn * rateNumerator / rateDenominator` of
///      the output token to the recipient. If `forceOutput` is non-zero, that exact value overrides the
///      normal rate (used to simulate slippage failures).
contract MockSwapRouter {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    address public inputToken;
    address public outputToken;
    uint256 public rateNumerator; // outputAmount = amountIn * num / denom
    uint256 public rateDenominator;
    uint256 public forceOutput; // when > 0, return this exact amount instead

    // Tracks if we should attempt reentrancy on next swap.
    address public reentrancyTarget;
    bytes public reentrancyCalldata;

    constructor(address _inputToken, address _outputToken, uint256 _rateNum, uint256 _rateDenom) {
        inputToken = _inputToken;
        outputToken = _outputToken;
        rateNumerator = _rateNum;
        rateDenominator = _rateDenom;
    }

    function setRate(uint256 num, uint256 denom) external {
        rateNumerator = num;
        rateDenominator = denom;
    }

    function setForceOutput(uint256 amount) external {
        forceOutput = amount;
    }

    function setReentrancy(address target, bytes calldata data) external {
        reentrancyTarget = target;
        reentrancyCalldata = data;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut) {
        // Pull input.
        IERC20(inputToken).transferFrom(msg.sender, address(this), params.amountIn);

        // Optional reentrancy attempt.
        if (reentrancyTarget != address(0)) {
            (bool ok,) = reentrancyTarget.call(reentrancyCalldata);
            // We don't expect this to succeed; the contract should revert from its reentrancy guard.
            ok; // silence unused
        }

        if (forceOutput > 0) {
            amountOut = forceOutput;
        } else {
            amountOut = (params.amountIn * rateNumerator) / rateDenominator;
        }

        require(amountOut >= params.amountOutMinimum, "Too little received");

        // Mint outputs to recipient (we control the mock token).
        IMintableMock(outputToken).mint(params.recipient, amountOut);
    }
}
