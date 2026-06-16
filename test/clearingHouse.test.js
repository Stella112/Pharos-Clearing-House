import { test } from "node:test";
import assert from "node:assert/strict";

import {
  reviewAction,
  fundEscrow,
  release,
  refund,
  settleX402,
  paywallRequire,
  paywallPay,
  paywallVerify,
  SimulationAdapter,
} from "../sdk/index.js";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // payer / agent A
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"; // payee / agent B
const ZERO = "0x0000000000000000000000000000000000000000";

function chain() {
  return new SimulationAdapter({ balances: { [A]: 10000, [B]: 0 } });
}

test("sentinel approves a clean write", () => {
  const v = reviewAction({
    network: "pharos-testnet",
    amountUsd: 500,
    to: B,
    isWrite: true,
    contractKnown: true,
    userConfirmed: true,
  });
  assert.equal(v.decision, "approve");
});

test("sentinel blocks an unconfirmed write", () => {
  const v = reviewAction({ network: "pharos-testnet", amountUsd: 500, to: B, isWrite: true, userConfirmed: false, contractKnown: true });
  assert.equal(v.decision, "block");
});

test("sentinel blocks over-limit transfer", () => {
  const v = reviewAction({ network: "pharos-testnet", amountUsd: 50000, to: B, isWrite: true, userConfirmed: true, contractKnown: true });
  assert.equal(v.decision, "block");
});

test("sentinel blocks zero/invalid recipient (drain guard)", () => {
  const v = reviewAction({ network: "pharos-testnet", amountUsd: 100, to: ZERO, isWrite: true, userConfirmed: true, contractKnown: true });
  assert.equal(v.decision, "block");
});

test("sentinel blocks on credit critical flag", () => {
  const v = reviewAction({
    network: "pharos-testnet", amountUsd: 100, to: B, isWrite: true, userConfirmed: true, contractKnown: true,
    creditVerdict: { score: 80, confidence: 0.9, exposureCapUsd: 1000, criticalFlags: ["sanctioned_counterparty"] },
  });
  assert.equal(v.decision, "block");
});

test("sentinel escalates on unknown contract", () => {
  const v = reviewAction({ network: "pharos-testnet", amountUsd: 100, to: B, isWrite: true, userConfirmed: true, contractKnown: false });
  assert.equal(v.decision, "escalate");
});

test("escrow funds, then releases on valid proof", async () => {
  const c = chain();
  const fund = await fundEscrow({
    adapter: c,
    plan: { payer: A, payee: B, amountUsd: 1000, condition: "delivery#42", deadline: Date.now() + 60000, contractKnown: true, userConfirmed: true },
  });
  assert.equal(fund.settled, true);
  assert.equal(await c.balanceOf(A), 9000 * 1e6);

  const rel = await release({ adapter: c, escrowId: fund.escrowId, proof: "delivery#42" });
  assert.equal(rel.settled, true);
  assert.equal(await c.balanceOf(B), 1000 * 1e6);
});

test("escrow release rejects a wrong proof", async () => {
  const c = chain();
  const fund = await fundEscrow({
    adapter: c,
    plan: { payer: A, payee: B, amountUsd: 1000, condition: "delivery#42", deadline: Date.now() + 60000, contractKnown: true, userConfirmed: true },
  });
  await assert.rejects(() => release({ adapter: c, escrowId: fund.escrowId, proof: "wrong" }));
});

test("escrow refunds only after the deadline", async () => {
  const c = chain();
  const t0 = 1_000_000;
  const fund = await fundEscrow({
    adapter: c,
    plan: { payer: A, payee: B, amountUsd: 1000, condition: "x", deadline: t0 + 100, contractKnown: true, userConfirmed: true },
  });
  await assert.rejects(() => refund({ adapter: c, escrowId: fund.escrowId, now: t0 + 50 }));
  const r = await refund({ adapter: c, escrowId: fund.escrowId, now: t0 + 200 });
  assert.equal(r.settled, true);
  assert.equal(await c.balanceOf(A), 10000 * 1e6);
});

test("x402 settle blocked without confirmation", async () => {
  const c = chain();
  const r = await settleX402({ adapter: c, payment: { from: A, to: B, amountUsd: 25, contractKnown: true, userConfirmed: false } });
  assert.equal(r.settled, false);
  assert.equal(await c.balanceOf(B), 0);
});

test("x402 settle succeeds with proof + confirmation", async () => {
  const c = chain();
  const r = await settleX402({ adapter: c, payment: { from: A, to: B, amountUsd: 25, contractKnown: true, userConfirmed: true } });
  assert.equal(r.settled, true);
  assert.equal(await c.balanceOf(B), 25 * 1e6);
});

test("paywall: agent pays through a 402 and receives a verifiable grant", async () => {
  const c = chain();
  const challenge = paywallRequire({ resource: "/rwa/yield-feed", priceUsd: 5, payTo: B });
  const pay = await paywallPay({ adapter: c, from: A, challenge });
  assert.equal(pay.settled, true);
  assert.equal(await c.balanceOf(B), 5 * 1e6);
  assert.ok(paywallVerify({ challenge, settlementTxHash: pay.txHash, presentedToken: pay.accessToken }));
});

test("paywall: expired challenge is rejected", async () => {
  const c = chain();
  const challenge = paywallRequire({ resource: "/x", priceUsd: 5, payTo: B, ttlMs: -1 });
  const pay = await paywallPay({ adapter: c, from: A, challenge });
  assert.equal(pay.settled, false);
});
