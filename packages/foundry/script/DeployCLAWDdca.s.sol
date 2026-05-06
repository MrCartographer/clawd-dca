// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ScaffoldETHDeploy } from "./DeployHelpers.s.sol";
import { CLAWDdca } from "../contracts/CLAWDdca.sol";

/**
 * @notice Deploy script for CLAWDdca.
 * @dev The constructor argument is the JOB CLIENT's address — they receive ownership directly,
 *      bypassing the deployer wallet. This matches the LeftClaw rule that every deployed contract
 *      sets `job.client` as owner.
 *
 * Run with:
 *   yarn deploy --file DeployCLAWDdca.s.sol --network base
 */
contract DeployCLAWDdca is ScaffoldETHDeploy {
    /// @notice Job #99 client address — owner of the deployed CLAWDdca.
    address public constant JOB_CLIENT = 0x8d6FB6C5f77155FEF58629325ad62E295329e22D;

    function run() external ScaffoldEthDeployerRunner {
        new CLAWDdca(JOB_CLIENT);
    }
}
