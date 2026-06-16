// Pharos Clearing House — x402 paywall helpers
//
// Two sides of the same flow:
//   paywallRequire()  -> a resource server builds an HTTP 402 challenge
//   paywallPay()      -> a paying agent settles the challenge and unlocks access
//
// The paying side still routes through Sentinel-gated settlement, so an agent
// cannot be drained by a malicious paywall — the same guards that protect a
// direct transfer protect an automatic pay-through.

import { settleX402 } from "./clearing.js";
import { sha } from "./chain.js";

// Server side: wrap a resource behind a price. Returns the 402 challenge an
// agent receives when it requests the resource without payment.
export function paywallRequire({ resource, priceUsd, payTo, ttlMs = 5 * 60 * 1000 }) {
  if (!resource) throw new Error("resource is required");
  if (typeof priceUsd !== "number" || priceUsd <= 0) throw new Error("priceUsd must be > 0");
  const nonce = sha(`${resource}|${payTo}|${Date.now()}|${Math.random()}`);
  return {
    status: 402,
    scheme: "x402",
    resource,
    priceUsd,
    payTo,
    nonce,
    // proof the agent must reproduce to release payment
    conditionHash: sha(`x402:${resource}:${nonce}`),
    expiresAt: Date.now() + ttlMs,
  };
}

// Client side: pay a 402 challenge and receive an access grant.
export async function paywallPay({ adapter, from, challenge, policy, signer, userConfirmed = true, creditVerdict }) {
  if (!challenge || challenge.scheme !== "x402") {
    return { kind: "paywall_pay", settled: false, reasons: ["not an x402 challenge"] };
  }
  if (Date.now() > challenge.expiresAt) {
    return { kind: "paywall_pay", settled: false, reasons: ["challenge expired"] };
  }

  const proof = `x402:${challenge.resource}:${challenge.nonce}`;
  const settlement = await settleX402({
    adapter,
    policy,
    signer,
    payment: {
      from,
      to: challenge.payTo,
      amountUsd: challenge.priceUsd,
      proof,
      expectedConditionHash: challenge.conditionHash,
      contractKnown: true,
      userConfirmed,
      creditVerdict,
    },
  });

  if (!settlement.settled) {
    return { kind: "paywall_pay", settled: false, reasons: settlement.reasons };
  }

  // Access token the resource server can verify against the settlement.
  return {
    kind: "paywall_pay",
    settled: true,
    network: settlement.network,
    resource: challenge.resource,
    txHash: settlement.txHash,
    amountUsd: challenge.priceUsd,
    accessToken: sha(`grant:${challenge.conditionHash}:${settlement.txHash}`),
    issuedAt: new Date().toISOString(),
  };
}

// Server side: verify an access token presented after payment.
export function paywallVerify({ challenge, settlementTxHash, presentedToken }) {
  const expected = sha(`grant:${challenge.conditionHash}:${settlementTxHash}`);
  return presentedToken === expected;
}
