---
name: pharos-clearing-house
description: >
  Settlement and escrow execution layer for AI agents on Pharos. Use when an
  agent needs to actually move value after a decision has been approved: fund a
  conditional escrow, release or refund it on proof, settle an agent-to-agent
  x402 payment, or pay through an x402 paywall to unlock a resource. Every
  value-moving action passes a Sentinel gate (security + policy + optional
  Credit Bureau verdict) before funds move, and the skill never handles private
  keys. Do not use this skill to assess a counterparty (use Credit Bureau) or to
  plan a strategy (use Atlas Council) — use it to execute an already-approved plan.
---

# Pharos Clearing House

Pharos Clearing House is the execution layer for autonomous agent commerce on
Pharos. Where most skills only decide, Clearing House acts: it turns an approved
decision into a real on-chain transfer, holds funds in escrow until conditions
are met, and lets agents pay each other over x402 without human intervention.

It is the settlement counterpart to a full agent-finance stack: the **Credit
Bureau** assesses counterparties, the **Atlas Council** decides and gates, and
the **Clearing House** settles.

## When to use

- An agent has an approved plan and needs to **lock funds** until a deliverable arrives → `fund_escrow`, then `release` / `refund`.
- Two agents transact and one must **pay on proof of delivery** → `settle_x402`.
- An agent must **pay for a gated resource** (data feed, model call, RWA access) priced over x402 → `paywall_pay`.
- A service agent wants to **charge for a resource** → `paywall_require`.

## Safety model

Nothing settles unless the Sentinel gate returns `approve`. The gate blocks or
escalates on: unsupported network, amount over policy limit, unconfirmed writes,
invalid/zero recipient (drain guard), unknown contracts, and — when a Credit
Bureau verdict is supplied — critical flags, exposure-cap breaches, or low
score/confidence. The skill forwards a caller-supplied `signer` to the chain
adapter and never reads, stores, or prints private keys.

The bundled Sentinel mirrors the Sentinel Shield from `$pharos-atlas-council`.
To use the real Atlas Sentinel, pass its `reviewAction` verdict into this
skill's gate — the shapes are compatible.

## Tools

| Tool | Purpose |
| --- | --- |
| `clearing_review_action` | Run the Sentinel gate; returns approve / escalate / block + reasons. |
| `clearing_fund_escrow` | Lock USDC in a conditional escrow against an approved plan. |
| `clearing_release` | Release escrow to payee on a proof matching the condition. |
| `clearing_refund` | Refund escrow to payer after the deadline. |
| `clearing_settle_x402` | Settle a direct agent-to-agent x402 payment on proof. |
| `clearing_paywall_require` | Server side: gate a resource and return a 402 challenge. |
| `clearing_paywall_pay` | Client side: pay a 402 challenge and receive an access grant. |

## Example invocation

```
Use $pharos-clearing-house to settle this hire: I approved paying agent
0xbbbb... up to $1,500 for an RWA risk report. Lock it in escrow against the
deliverable hash and release only when the report is delivered.
```

## Network

Deployed live on Pharos Atlantic Testnet (chain `688689`); Pharos Testnet
(`688688`) also supported. USDC via Circle's testnet faucet
(`0xcfc8330f4bcab529c625d12781b1c19466a9fc8b`). Escrow contract
(`contracts/src/ClearingHouseEscrow.sol`) deployed at
`0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab`
([explorer](https://atlantic.pharosscan.xyz/address/0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab)),
with a real USDC fund→release settled through it on-chain.

## Layers

- **Skill**: this `SKILL.md` for the Pharos Skill Engine / Codex.
- **SDK**: `sdk/` — deterministic, dependency-free settlement logic.
- **MCP**: `mcp/server.js` — the same tools over stdio for any MCP client.
