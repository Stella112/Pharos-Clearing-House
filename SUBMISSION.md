# DoraHacks Submission — Pharos Clearing House

> Skill-to-Agent Dual Cascade Hackathon (Phase 1: Skill Hackathon)
> Fill in the bracketed fields before submitting.

**Project name:** Pharos Clearing House

**One-liner:** x402 settlement, escrow, and paywalls for AI agents — gated by Sentinel, settled on Pharos.

**Repository:** https://github.com/Stella112/Pharos-Clearing-House

**Demo video:** [add link]

**Deployed escrow (Pharos Atlantic Testnet, chain 688689):** [`0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab`](https://atlantic.pharosscan.xyz/address/0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab)

**Live settlement proof (real USDC):** fund [`0xcaf1…02a9`](https://atlantic.pharosscan.xyz/tx/0xcaf19162a9845c6423536fb8740b231f1ac6cdfe66950ff2a24d04b92f0a02a9) · release [`0x62ea…efef8`](https://atlantic.pharosscan.xyz/tx/0x62ea0119b6f790922e90906de8917ca65827b6776d45ab3818213d4ca05efef8)

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

## Phase 2 roadmap

Clearing House becomes a **Treasurer Steward agent** running score → approve →
settle autonomously. The Steward is a natural fit for **ERC-8004 (Trustless
Agents)** — carrying a portable on-chain identity and writing Credit Bureau
verdicts into a reputation registry, so creditworthiness and settlement track
record become verifiable across the ecosystem. Identity/reputation (ERC-8004)
sits above settlement (this escrow); together they give agents safe *and*
portable-trust transactions.

**Contact / email:** [add]
