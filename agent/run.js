// Treasurer Steward — autonomous run.
//
//   node agent/run.js
//
// A single agent, deployed with a $2,000 operating budget, processes a queue of
// hire mandates with no human in the loop. Watch it score each counterparty,
// fund what's safe, refuse what's over budget, and block what fails Sentinel —
// then settle the delivered work and reclaim a timed-out one.

import { SimulationAdapter, unitsToUsd } from "../sdk/index.js";
import { TreasurerSteward } from "./steward.js";

const OP_WALLET = "0x1111111111111111111111111111111111111111"; // the agent's own wallet
const GOOD = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"; // prime credit
const BAD  = "0xdddddddddddddddddddddddddddddddddddddddd"; // sanctioned

const line = (s = "") => console.log(s);
const deadline = () => Date.now() + 7 * 24 * 3600 * 1000;

async function main() {
  const chain = new SimulationAdapter({ balances: { [OP_WALLET]: 5000 } });
  const steward = new TreasurerSteward({ adapter: chain, operatingWallet: OP_WALLET, budgetUsd: 2000 });

  line("Treasurer Steward — autonomous settlement agent");
  line(`Operating wallet: ${OP_WALLET}`);
  line(`Budget: $${steward.budgetUsd}  |  on-chain balance: $${unitsToUsd(await chain.balanceOf(OP_WALLET))}\n`);

  // A queue of mandates the agent works through on its own.
  const mandates = [
    { id: "M1", task: "RWA risk report",       payee: GOOD, maxUsd: 1200, condition: "deliverable:rwa-report:sha:42abef", deadline: deadline() },
    { id: "M2", task: "compliance attestation", payee: BAD,  maxUsd: 300,  condition: "deliverable:attest:sha:9090",      deadline: deadline() },
    { id: "M3", task: "liquidity scan",         payee: GOOD, maxUsd: 600,  condition: "deliverable:liq-scan:sha:7711",    deadline: deadline() },
    { id: "M4", task: "yield backtest",         payee: GOOD, maxUsd: 500,  condition: "deliverable:backtest:sha:5151",    deadline: deadline() },
  ];

  line("— Processing mandate queue —");
  for (const m of mandates) {
    const r = await steward.hire(m);
    if (r.step === "escrow_funded") {
      line(`  ${m.id} ${m.task.padEnd(24)} FUNDED  $${r.amountUsd} -> ${m.payee.slice(0, 8)}…  (remaining $${r.remainingUsd})`);
    } else if (r.step === "refused") {
      line(`  ${m.id} ${m.task.padEnd(24)} REFUSED ${r.reason}`);
    } else if (r.step === "blocked") {
      line(`  ${m.id} ${m.task.padEnd(24)} BLOCKED Sentinel: ${r.reasons.join("; ")}`);
    }
  }

  line("\n— Outcomes —");
  // M1 delivers -> release. M3 never delivers -> reclaim after deadline.
  const rel = await steward.settleOnDelivery("M1", "deliverable:rwa-report:sha:42abef");
  line(`  M1 delivered -> released $${rel.amountUsd} (tx ${rel.txHash.slice(0, 12)}…)`);

  const ref = await steward.reclaimOnTimeout("M3", Date.now() + 8 * 24 * 3600 * 1000);
  line(`  M3 no delivery -> reclaimed $${ref.amountUsd}, budget freed (remaining $${ref.remainingUsd})`);

  line("\n— Final state —");
  line(`  Agent committed: $${steward.committedUsd}  |  remaining budget: $${steward.remainingBudgetUsd}`);
  line(`  Operating wallet balance: $${unitsToUsd(await chain.balanceOf(OP_WALLET))}`);
  line(`  Service agent ${GOOD.slice(0, 8)}… balance: $${unitsToUsd(await chain.balanceOf(GOOD))}`);
  line(`  Audit trail: ${steward.getAuditTrail().length} signed entries`);
  line("\nResult: one agent, one budget, score -> approve -> settle, fully autonomous and fenced.");
}

main();
