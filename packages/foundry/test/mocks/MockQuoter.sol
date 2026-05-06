// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal Uniswap V3 QuoterV2 mock returning a configurable rate.
contract MockQuoter {
    uint256 public rateNumerator;
    uint256 public rateDenominator;

    constructor(uint256 _rateNum, uint256 _rateDenom) {
        rateNumerator = _rateNum;
        rateDenominator = _rateDenom;
    }

    function setRate(uint256 num, uint256 denom) external {
        rateNumerator = num;
        rateDenominator = denom;
    }

    function quoteExactInput(bytes memory, /* path */ uint256 amountIn)
        external
        view
        returns (
            uint256 amountOut,
            uint160[] memory sqrtPriceX96AfterList,
            uint32[] memory initializedTicksCrossedList,
            uint256 gasEstimate
        )
    {
        amountOut = (amountIn * rateNumerator) / rateDenominator;
        sqrtPriceX96AfterList = new uint160[](0);
        initializedTicksCrossedList = new uint32[](0);
        gasEstimate = 0;
    }
}
