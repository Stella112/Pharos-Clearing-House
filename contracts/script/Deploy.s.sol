// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ClearingHouseEscrow.sol";

/// @dev Deploy to Pharos testnet (chain 688688). The deployer key is read from
///      the PRIVATE_KEY environment variable and never stored in this repo.
///
///   forge script contracts/script/Deploy.s.sol:Deploy \
///     --rpc-url $PHAROS_TESTNET_RPC --broadcast
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        ClearingHouseEscrow escrow = new ClearingHouseEscrow();
        vm.stopBroadcast();
        console.log("ClearingHouseEscrow deployed at:", address(escrow));
    }
}
