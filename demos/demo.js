// Full pipeline demo: a paying agent hires a service agent, funds an escrow
// gated by Sentinel (with a Credit Bureau verdict), and releases on delivery.
//
//   node demos/demo.js

import { fundEscrow, release, SimulationAdapter, unitsToUsd } from "../sdk/index.js";

const PAYER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PAYEE = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const line = (s) => console.log(s);

async function main() {
  const chain = new SimulationAdapter({ balances: { [PAYER]: 5000, [PAYEE]: 0 } });

  line("Pharos Clearing House — settlement pipeline\n");
  line(`Network: ${chain.network.name} (chain ${chain.network.chainId})`);
  line(`Payer  balance: $${unitsToUsd(await chain.balanceOf(PAYER))}`);
  line(`Payee  balance: $${unitsToUsd(await chain.balanceOf(PAYEE))}\n`);

  // A Credit Bureau verdict would normally come from $pharos-credit-bureau.
  const creditVerdict = { band: "prime", score: 78, confidence: 0.82, exposureCapUsd: 2000, criticalFlags: [] };
  line(`1) Credit Bureau verdict on payee: band=${creditVerdict.band} score=${creditVerdict.score} cap=$${creditVerdict.exposureCapUsd}`);

  // Fund escrow — Sentinel gates the write.
  const fund = await fundEscrow({
    adapter: chain,
    plan: {
      payer: PAYER,
      payee: PAYEE,
      amountUsd: 1500,
      condition: "deliverable:rwa-risk-report:sha:42abef",
      deadline: Date.now() + 7 * 24 * 3600 * 1000,
      contractKnown: true,
      userConfirmed: true,
      creditVerdict,
    },
  });
  line(`2) Sentinel decision: ${fund.sentinel.toUpperCase()} -> escrow ${fund.escrowId} funded ($${fund.amountUsd} locked, tx ${fund.txHash.slice(0, 14)}...)`);
  line(`   Payer balance after lock: $${unitsToUsd(await chain.balanceOf(PAYER))}`);

  // Service agent delivers; payer releases against the agreed proof.
  const rel = await release({ adapter: chain, escrowId: fund.escrowId, proof: "deliverable:rwa-risk-report:sha:42abef" });
  line(`3) Proof verified -> released $${rel.amountUsd} to payee (tx ${rel.txHash.slice(0, 14)}...)\n`);

  line(`Final payer balance: $${unitsToUsd(await chain.balanceOf(PAYER))}`);
  line(`Final payee balance: $${unitsToUsd(await chain.balanceOf(PAYEE))}`);
  line("\nResult: score -> approve -> settle, end to end, with funds only moving after proof.");
}

main();
