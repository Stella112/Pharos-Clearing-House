// Pharos Clearing House — settlement operations
//
// Every value-moving operation passes the Sentinel gate first. Nothing settles
// on an unapproved verdict. The skill receives a `signer` from the caller's
// runtime and forwards it to the adapter; it never reads or stores keys.

import { reviewAction, isApproved } from "./sentinel.js";
import { sha, usdToUnits, unitsToUsd } from "./chain.js";

function receipt(kind, verdict, extra) {
  return {
    kind,
    settled: true,
    network: extra.network,
    sentinel: verdict.decision,
    ...extra,
    issuedAt: new Date().toISOString(),
  };
}

function blocked(kind, verdict) {
  return {
    kind,
    settled: false,
    sentinel: verdict.decision,
    reasons: verdict.reasons,
  };
}

// Lock USDC against a Sentinel-approved plan; pays out only on proof.
export async function fundEscrow({ adapter, plan, policy, signer }) {
  const { payer, payee, amountUsd, condition, deadline, contractKnown, userConfirmed, creditVerdict } = plan;
  const verdict = reviewAction(
    {
      type: "escrow_fund",
      network: adapter.network.name,
      amountUsd,
      to: payee,
      isWrite: true,
      contractKnown,
      userConfirmed,
      creditVerdict,
    },
    policy
  );
  if (!isApproved(verdict)) return blocked("escrow_fund", verdict);

  const res = await adapter.escrowCreate({
    payer,
    payee,
    amountUnits: usdToUnits(amountUsd),
    condition,                    // raw — RPC adapter hashes with keccak256 on-chain
    conditionHash: sha(condition), // simulation adapter's local digest
    deadline,
    signer,
  });
  return receipt("escrow_fund", verdict, {
    network: adapter.network.name,
    escrowId: res.id,
    txHash: res.txHash,
    payer,
    payee,
    amountUsd,
    conditionHash: sha(condition),
    deadline,
  });
}

// Release escrowed funds when a proof satisfies the original condition.
export async function release({ adapter, escrowId, proof, signer }) {
  const res = await adapter.escrowRelease({ id: escrowId, proof, signer });
  return {
    kind: "escrow_release",
    settled: true,
    network: adapter.network.name,
    escrowId,
    txHash: res.txHash,
    paidTo: res.paidTo,
    amountUsd: unitsToUsd(res.amountUnits),
    issuedAt: new Date().toISOString(),
  };
}

// Return funds to the payer after the deadline if no valid proof arrived.
export async function refund({ adapter, escrowId, now = Date.now(), signer }) {
  const res = await adapter.escrowRefund({ id: escrowId, now, signer });
  return {
    kind: "escrow_refund",
    settled: true,
    network: adapter.network.name,
    escrowId,
    txHash: res.txHash,
    refundedTo: res.refundedTo,
    amountUsd: unitsToUsd(res.amountUnits),
    issuedAt: new Date().toISOString(),
  };
}

// Direct agent-to-agent x402 settlement: gate, then transfer on proof.
export async function settleX402({ adapter, payment, policy, signer }) {
  const { from, to, amountUsd, proof, expectedConditionHash, contractKnown, userConfirmed, creditVerdict } = payment;

  if (expectedConditionHash && sha(proof) !== expectedConditionHash) {
    return {
      kind: "x402_settle",
      settled: false,
      reasons: ["proof of delivery does not match the agreed condition"],
    };
  }

  const verdict = reviewAction(
    {
      type: "x402_settle",
      network: adapter.network.name,
      amountUsd,
      to,
      isWrite: true,
      contractKnown,
      userConfirmed,
      creditVerdict,
    },
    policy
  );
  if (!isApproved(verdict)) return blocked("x402_settle", verdict);

  const res = await adapter.transfer({ from, to, amountUnits: usdToUnits(amountUsd), signer });
  return receipt("x402_settle", verdict, {
    network: adapter.network.name,
    txHash: res.txHash,
    from,
    to,
    amountUsd,
  });
}
