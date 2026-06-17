// Live settlement on Pharos testnet — the real thing.
//
// Runs the SDK's Sentinel-gated escrow pipeline against the deployed contract
// with real Circle testnet USDC, printing explorer-linked transaction hashes.
//
//   PRIVATE_KEY=0x...         # operating wallet (gas + USDC), never committed
//   ESCROW_ADDRESS=0x...      # from the deploy step
//   PHAROS_TESTNET_RPC=...    # optional, defaults to the public endpoint
//   PAYEE=0x...               # who gets paid (defaults to a throwaway)
//   AMOUNT_USD=1              # how much USDC to settle (small for a demo)
//
//   node scripts/live-settle.mjs
//
// Needs `ethers` (npm i ethers). The escrow moves USDC, so the operating wallet
// must hold testnet USDC from Circle's faucet (https://faucet.circle.com).

import { fundEscrow, release, PHAROS } from "../sdk/index.js";
import { PharosRpcAdapter } from "../sdk/rpc-adapter.js";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
const RPC = process.env.PHAROS_TESTNET_RPC || PHAROS.testnet.rpcUrl;
const PAYEE = process.env.PAYEE || "0x000000000000000000000000000000000000dEaD";
const AMOUNT_USD = Number(process.env.AMOUNT_USD || 1);

if (!PRIVATE_KEY || !ESCROW_ADDRESS) {
  console.error("Set PRIVATE_KEY and ESCROW_ADDRESS (and fund the wallet with testnet USDC).");
  process.exit(1);
}

const chain = new PharosRpcAdapter({ rpcUrl: RPC, privateKey: PRIVATE_KEY, escrowAddress: ESCROW_ADDRESS });
const payer = await chain.signer.getAddress();
const condition = `deliverable:live-demo:${Date.now()}`;

console.log("Pharos Clearing House — LIVE settlement");
console.log("network :", chain.network.name, `(chain ${chain.network.chainId})`);
console.log("payer   :", payer);
console.log("USDC bal:", (await chain.balanceOf(payer)) / 1e6, "USDC\n");

console.log("1) Funding escrow (approve + fund)…");
const fund = await fundEscrow({
  adapter: chain,
  plan: {
    payer, payee: PAYEE, amountUsd: AMOUNT_USD, condition,
    deadline: Date.now() + 3600_000, contractKnown: true, userConfirmed: true,
  },
});
if (!fund.settled) { console.error("Sentinel blocked:", fund.reasons); process.exit(1); }
console.log("   escrow", fund.escrowId, "tx:", `${chain.network.explorer}/tx/${fund.txHash}`);

console.log("2) Releasing on proof…");
const rel = await release({ adapter: chain, escrowId: fund.escrowId, proof: condition });
console.log("   released", rel.amountUsd ?? AMOUNT_USD, "USDC tx:", `${chain.network.explorer}/tx/${rel.txHash}`);

console.log("\nDONE — real USDC settled through a Sentinel-gated escrow on Pharos testnet.");
