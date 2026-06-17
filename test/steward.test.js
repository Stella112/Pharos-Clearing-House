import { test } from "node:test";
import assert from "node:assert/strict";

import { SimulationAdapter } from "../sdk/index.js";
import { TreasurerSteward } from "../agent/steward.js";

const OP = "0x1111111111111111111111111111111111111111";
const GOOD = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BAD = "0xdddddddddddddddddddddddddddddddddddddddd";

function steward(budgetUsd = 2000) {
  const chain = new SimulationAdapter({ balances: { [OP]: 5000 } });
  return { chain, agent: new TreasurerSteward({ adapter: chain, operatingWallet: OP, budgetUsd }) };
}

const m = (over = {}) => ({ id: "M", task: "t", payee: GOOD, maxUsd: 500, condition: "c", deadline: Date.now() + 60000, ...over });

test("steward funds a mandate within budget and credit", async () => {
  const { agent } = steward();
  const r = await agent.hire(m({ id: "M1", maxUsd: 1200 }));
  assert.equal(r.step, "escrow_funded");
  assert.equal(agent.committedUsd, 1200);
  assert.equal(agent.remainingBudgetUsd, 800);
});

test("steward refuses a mandate over its remaining budget", async () => {
  const { agent } = steward(1000);
  await agent.hire(m({ id: "M1", maxUsd: 800 }));
  const r = await agent.hire(m({ id: "M2", maxUsd: 500 }));
  assert.equal(r.step, "refused");
  assert.equal(agent.committedUsd, 800); // unchanged
});

test("steward is blocked by Sentinel on a sanctioned counterparty", async () => {
  const { agent } = steward();
  const r = await agent.hire(m({ id: "M1", payee: BAD, maxUsd: 300 }));
  assert.equal(r.step, "blocked");
  assert.equal(agent.committedUsd, 0);
});

test("steward releases on delivery", async () => {
  const { chain, agent } = steward();
  await agent.hire(m({ id: "M1", maxUsd: 1000, condition: "deliver#1" }));
  const r = await agent.settleOnDelivery("M1", "deliver#1");
  assert.equal(r.step, "released");
  assert.equal(await chain.balanceOf(GOOD), 1000 * 1e6);
});

test("steward reclaims on timeout and frees the budget", async () => {
  const { agent } = steward();
  await agent.hire(m({ id: "M1", maxUsd: 1000, deadline: 1000 }));
  assert.equal(agent.remainingBudgetUsd, 1000);
  const r = await agent.reclaimOnTimeout("M1", 2000);
  assert.equal(r.step, "refunded");
  assert.equal(agent.remainingBudgetUsd, 2000); // budget freed
});
