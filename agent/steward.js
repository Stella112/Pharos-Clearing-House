// Pharos Clearing House — Treasurer Steward agent
//
// The Phase 2 agent that *drives* the Clearing House skill autonomously. Given a
// mandate ("hire agent X for task Y, up to $Z, release on delivery"), the
// Steward runs the full pipeline with no human in the loop beyond the standing
// policy it was deployed with:
//
//   1. pull a Credit Bureau verdict on the counterparty   (score)
//   2. run the Sentinel gate                               (approve / block)
//   3. fund a conditional escrow                           (settle)
//   4. verify proof of delivery -> release                 (settle)
//
// Safety model — the agent acts, but stays inside three fences:
//   * a DEDICATED operating wallet, not the user's main wallet;
//   * a HARD budget cap it cannot spend past, tracked across mandates;
//   * the SAME Sentinel gate the skill enforces on every single write.
// It never reads or stores a private key — a `signer` is injected by the
// runtime (here, the SimulationAdapter; on testnet, an RPC adapter + keystore).

import { fundEscrow, release, refund, reviewAction, unitsToUsd } from "../sdk/index.js";

// Stand-in for $pharos-credit-bureau. In production the Steward invokes the
// Credit Bureau skill; here a deterministic oracle keeps the agent runnable
// offline. Same verdict shape the Sentinel gate already understands.
const DEFAULT_CREDIT_ORACLE = async (address) => {
  const known = {
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb": { band: "prime", score: 78, confidence: 0.82, exposureCapUsd: 2000, criticalFlags: [] },
    "0xcccccccccccccccccccccccccccccccccccccccc": { band: "subprime", score: 41, confidence: 0.7, exposureCapUsd: 500, criticalFlags: [] },
    "0xdddddddddddddddddddddddddddddddddddddddd": { band: "blocked", score: 12, confidence: 0.9, exposureCapUsd: 0, criticalFlags: ["sanctioned_counterparty"] },
  };
  return known[address.toLowerCase()] || { band: "unrated", score: 50, confidence: 0.3, exposureCapUsd: 250, criticalFlags: [] };
};

export class TreasurerSteward {
  // operatingWallet: the agent's own delegated address (funds live here).
  // budgetUsd:       hard ceiling the agent may commit across all mandates.
  constructor({ adapter, operatingWallet, budgetUsd, policy = {}, creditOracle = DEFAULT_CREDIT_ORACLE, signer }) {
    if (!adapter) throw new Error("adapter required");
    if (!operatingWallet) throw new Error("operatingWallet required");
    if (typeof budgetUsd !== "number" || budgetUsd <= 0) throw new Error("budgetUsd must be > 0");
    this.adapter = adapter;
    this.wallet = operatingWallet;
    this.budgetUsd = budgetUsd;
    this.committedUsd = 0;
    this.policy = policy;
    this.creditOracle = creditOracle;
    this.signer = signer;
    this.audit = [];
    this.openEscrows = new Map(); // mandateId -> { escrowId, amountUsd, condition }
  }

  get remainingBudgetUsd() {
    return this.budgetUsd - this.committedUsd;
  }

  _log(step, detail) {
    const entry = { at: new Date().toISOString(), step, ...detail };
    this.audit.push(entry);
    return entry;
  }

  // Autonomously evaluate and fund a mandate. Returns a decision record.
  // mandate: { id, task, payee, maxUsd, condition, deadline }
  async hire(mandate) {
    const { id, task, payee, maxUsd, condition, deadline } = mandate;

    // 1) Credit Bureau — the agent scores the counterparty before committing.
    const creditVerdict = await this.creditOracle(payee);
    this._log("credit", { mandate: id, payee, band: creditVerdict.band, score: creditVerdict.score });

    // 2) Budget fence — the agent refuses to exceed its delegated mandate,
    //    independent of (and before) the Sentinel gate.
    if (maxUsd > this.remainingBudgetUsd) {
      return this._log("refused", {
        mandate: id, task, reason: `over budget: $${maxUsd} requested, $${this.remainingBudgetUsd} remaining`, settled: false,
      });
    }

    // 3) Sentinel gate + escrow funding — the skill's own safety layer.
    const fund = await fundEscrow({
      adapter: this.adapter,
      signer: this.signer,
      policy: this.policy,
      plan: {
        payer: this.wallet,
        payee,
        amountUsd: maxUsd,
        condition,
        deadline,
        contractKnown: true,
        userConfirmed: true, // the standing mandate IS the confirmation
        creditVerdict,
      },
    });

    if (!fund.settled) {
      return this._log("blocked", { mandate: id, task, sentinel: fund.sentinel, reasons: fund.reasons, settled: false });
    }

    this.committedUsd += maxUsd;
    this.openEscrows.set(id, { escrowId: fund.escrowId, amountUsd: maxUsd, condition });
    return this._log("escrow_funded", {
      mandate: id, task, payee, escrowId: fund.escrowId, amountUsd: maxUsd,
      txHash: fund.txHash, committedUsd: this.committedUsd, remainingUsd: this.remainingBudgetUsd, settled: true,
    });
  }

  // The counterparty delivered: verify the proof and release the escrow.
  async settleOnDelivery(mandateId, proof) {
    const open = this.openEscrows.get(mandateId);
    if (!open) throw new Error(`no open escrow for mandate ${mandateId}`);
    const rel = await release({ adapter: this.adapter, escrowId: open.escrowId, proof, signer: this.signer });
    this.openEscrows.delete(mandateId);
    return this._log("released", { mandate: mandateId, escrowId: open.escrowId, amountUsd: rel.amountUsd, txHash: rel.txHash, settled: true });
  }

  // No valid delivery before the deadline: reclaim the funds, free the budget.
  async reclaimOnTimeout(mandateId, now = Date.now()) {
    const open = this.openEscrows.get(mandateId);
    if (!open) throw new Error(`no open escrow for mandate ${mandateId}`);
    const r = await refund({ adapter: this.adapter, escrowId: open.escrowId, now, signer: this.signer });
    this.committedUsd -= open.amountUsd; // budget freed back up
    this.openEscrows.delete(mandateId);
    return this._log("refunded", { mandate: mandateId, escrowId: open.escrowId, amountUsd: r.amountUsd, remainingUsd: this.remainingBudgetUsd, settled: true });
  }

  getAuditTrail() {
    return this.audit;
  }
}
