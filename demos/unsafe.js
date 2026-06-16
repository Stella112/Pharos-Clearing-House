// Safety demo: the Clearing House refuses to move funds on unsafe actions.
//
//   node demos/unsafe.js

import { settleX402, SimulationAdapter, unitsToUsd } from "../sdk/index.js";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const ZERO = "0x0000000000000000000000000000000000000000";
const line = (s) => console.log(s);

async function attempt(label, chain, payment) {
  const r = await settleX402({ adapter: chain, payment });
  const status = r.settled ? "SETTLED" : "BLOCKED";
  line(`- ${label}: ${status}`);
  if (!r.settled) r.reasons.forEach((x) => line(`    reason: ${x}`));
}

async function main() {
  const chain = new SimulationAdapter({ balances: { [A]: 100000, [B]: 0 } });
  line("Pharos Clearing House — Sentinel safety demo\n");

  await attempt("over policy limit ($50,000)", chain, { from: A, to: B, amountUsd: 50000, contractKnown: true, userConfirmed: true });
  await attempt("unconfirmed write", chain, { from: A, to: B, amountUsd: 25, contractKnown: true, userConfirmed: false });
  await attempt("drain to zero address", chain, { from: A, to: ZERO, amountUsd: 25, contractKnown: true, userConfirmed: true });
  await attempt("sanctioned counterparty (credit flag)", chain, {
    from: A, to: B, amountUsd: 25, contractKnown: true, userConfirmed: true,
    creditVerdict: { score: 90, confidence: 0.9, exposureCapUsd: 1000, criticalFlags: ["sanctioned_counterparty"] },
  });
  await attempt("clean $25 payment", chain, { from: A, to: B, amountUsd: 25, contractKnown: true, userConfirmed: true });

  line(`\nPayee received only the clean payment: $${unitsToUsd(await chain.balanceOf(B))}`);
}

main();
