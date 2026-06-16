# DoraHacks Submission — Pharos Clearing House

> Skill-to-Agent Dual Cascade Hackathon (Phase 1: Skill Hackathon)
> Fill in the bracketed fields before submitting.

**Project name:** Pharos Clearing House

**One-liner:** x402 settlement, escrow, and paywalls for AI agents — gated by Sentinel, settled on Pharos.

**Repository:** https://github.com/Stella112/Pharos-Clearing-House

**Demo video:** [add link]

**Deployed escrow (Pharos testnet):** [add contract address + explorer link]

## What it is

Pharos Clearing House is the execution layer for autonomous agent commerce on Pharos. Most agent skills only decide; Clearing House acts — it turns an approved decision into a real on-chain transfer, holds funds in escrow until conditions are met, and lets agents pay each other over x402 without human intervention.

## Why it matters

It completes a working three-skill stack on Pharos: Credit Bureau assesses a counterparty, Atlas Council decides and gates, and Clearing House settles. This is the missing execution primitive that turns advisory agent skills into agents that can safely transact — directly serving Pharos's native x402 agent-payment economy.

## Composability

The Sentinel gate accepts a Credit Bureau verdict and mirrors the Atlas Council Sentinel Shield, so settlements can be conditioned on creditworthiness, compliance flags, and exposure caps. The demo shows skills invoking skills: a credit verdict feeds the gate, the gate approves, the Clearing House settles.

## Security

No private-key handling (writes are signed by a caller-supplied signer). No admin, upgrade path, or delegatecall in the escrow contract; reentrancy-guarded; funds move only along release-on-proof or refund-after-deadline. Every value-moving action is Sentinel-gated; unsafe transfers, unknown contracts, and unconfirmed writes are blocked (see `npm run demo:unsafe`).

## How to run

```
npm test
npm run demo
npm run demo:paywall
npm run demo:unsafe
npm run mcp
```

## Tools

clearing_review_action, clearing_fund_escrow, clearing_release, clearing_refund, clearing_settle_x402, clearing_paywall_require, clearing_paywall_pay

**Contact / email:** [add]
