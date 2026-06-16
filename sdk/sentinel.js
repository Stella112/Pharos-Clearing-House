// Pharos Clearing House — Sentinel gate
//
// This mirrors the Sentinel Shield decision layer from Pharos Atlas Council so
// the Clearing House runs standalone. To use the real thing instead, import
// `reviewAction` from the atlas-council SDK and pass its verdict straight into
// `gate()` below — the shapes are intentionally compatible.

import { isAddress } from "./chain.js";

export const DEFAULT_POLICY = {
  allowedNetworks: ["pharos-testnet", "pharos-mainnet", 688688, 688689],
  maxTransferUsd: 10000,
  requireUserConfirmedForWrites: true,
  requireKnownContractForWrites: true,
  minCreditScore: 55,
  minCreditConfidence: 0.4,
};

const ZERO = "0x0000000000000000000000000000000000000000";

// action: {
//   type, network, amountUsd, to, isWrite, contractKnown, userConfirmed,
//   creditVerdict?: { band, score, confidence, exposureCapUsd, criticalFlags[] }
// }
export function reviewAction(action = {}, policy = {}) {
  const p = { ...DEFAULT_POLICY, ...policy };
  const reasons = [];
  const blocks = [];
  const escalations = [];

  const net = action.network;
  if (net !== undefined && !p.allowedNetworks.includes(net)) {
    blocks.push(`network not allowed: ${net}`);
  }

  if (action.isWrite) {
    if (p.requireUserConfirmedForWrites && action.userConfirmed !== true) {
      blocks.push("write action requires explicit user confirmation");
    }
    if (p.requireKnownContractForWrites && action.contractKnown === false) {
      escalations.push("counterparty contract is not on the known-contract allowlist");
    }
  }

  if (typeof action.amountUsd === "number") {
    if (action.amountUsd <= 0) blocks.push("amount must be greater than zero");
    if (action.amountUsd > p.maxTransferUsd) {
      blocks.push(`amount ${action.amountUsd} exceeds policy limit ${p.maxTransferUsd}`);
    }
  }

  if (action.to !== undefined && (!isAddress(action.to) || action.to === ZERO)) {
    blocks.push("recipient address is missing or invalid (drain-pattern guard)");
  }

  // Optional Credit Bureau gate — composability hook.
  const cv = action.creditVerdict;
  if (cv) {
    if (Array.isArray(cv.criticalFlags) && cv.criticalFlags.length > 0) {
      blocks.push(`credit critical flags: ${cv.criticalFlags.join(", ")}`);
    }
    if (typeof cv.exposureCapUsd === "number" && typeof action.amountUsd === "number" &&
        action.amountUsd > cv.exposureCapUsd) {
      blocks.push(`amount exceeds credit exposure cap ${cv.exposureCapUsd}`);
    }
    if (typeof cv.score === "number" && cv.score < p.minCreditScore) {
      escalations.push(`credit score ${cv.score} below minimum ${p.minCreditScore}`);
    }
    if (typeof cv.confidence === "number" && cv.confidence < p.minCreditConfidence) {
      escalations.push(`credit confidence ${cv.confidence} below minimum ${p.minCreditConfidence}`);
    }
  }

  let decision = "approve";
  if (escalations.length) decision = "escalate";
  if (blocks.length) decision = "block";

  if (decision === "approve") reasons.push("all gates passed");
  reasons.push(...blocks, ...escalations);

  return {
    decision, // "approve" | "escalate" | "block"
    reasons,
    checks: {
      network: net,
      amountUsd: action.amountUsd ?? null,
      isWrite: !!action.isWrite,
      userConfirmed: !!action.userConfirmed,
      contractKnown: action.contractKnown ?? null,
      creditApplied: !!cv,
    },
  };
}

export function isApproved(verdict) {
  return verdict && verdict.decision === "approve";
}
