// x402 paywall demo: a data agent gates an RWA feed behind a price; a buyer
// agent autonomously pays through the 402 and unlocks access.
//
//   node demos/paywall.js

import { paywallRequire, paywallPay, paywallVerify, SimulationAdapter, unitsToUsd } from "../sdk/index.js";

const BUYER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SELLER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const line = (s) => console.log(s);

async function main() {
  const chain = new SimulationAdapter({ balances: { [BUYER]: 100, [SELLER]: 0 } });
  line("Pharos Clearing House — x402 paywall loop\n");

  // SELLER side: gate a premium resource behind a $5 price.
  const challenge = paywallRequire({ resource: "/rwa/yield-feed/premium", priceUsd: 5, payTo: SELLER });
  line(`1) Seller agent gates ${challenge.resource} -> HTTP 402, price $${challenge.priceUsd}`);

  // BUYER side: pay through the challenge (Sentinel-gated under the hood).
  const pay = await paywallPay({ adapter: chain, from: BUYER, challenge });
  if (!pay.settled) {
    line(`   payment blocked: ${pay.reasons.join(", ")}`);
    return;
  }
  line(`2) Buyer agent pays $${pay.amountUsd} via x402 (tx ${pay.txHash.slice(0, 14)}...) -> access token issued`);

  // SELLER side: verify the grant before serving the resource.
  const ok = paywallVerify({ challenge, settlementTxHash: pay.txHash, presentedToken: pay.accessToken });
  line(`3) Seller verifies access token: ${ok ? "VALID -> serves the feed" : "INVALID -> denies"}\n`);

  line(`Buyer  balance: $${unitsToUsd(await chain.balanceOf(BUYER))}`);
  line(`Seller balance: $${unitsToUsd(await chain.balanceOf(SELLER))}`);
  line("\nResult: a full pay-for-service loop between two agents, settled on Pharos.");
}

main();
