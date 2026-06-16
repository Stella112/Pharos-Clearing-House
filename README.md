# Pharos Clearing House

**x402 settlement, escrow, and paywalls for AI agents — gated by Sentinel, settled on Pharos.**

Pharos Clearing House is the execution layer for autonomous agent commerce on Pharos. Where most agent skills only *decide*, Clearing House *acts*: it turns an approved decision into a real on-chain transfer, holds funds in escrow until conditions are met, and lets agents pay each other over x402 without human intervention.

It is the settlement counterpart to a full agent-finance stack — the [Credit Bureau](https://github.com/Stella112/Pharos-Credit-Bureau) assesses counterparties, the [Atlas Council](https://github.com/Stella112/-Pharos-Atlas-Council) decides and gates, and the **Clearing House** settles. Nothing moves until a Sentinel-approved verdict and explicit confirmation clear it, so autonomous payments stay safe by design: the skill acts only on an approved decision and never handles private keys.

## Core capabilities

- **Conditional escrow** — lock USDC against an approved plan, release on proof-of-delivery, refund on timeout.
- **x402 agent payments** — settle agent-to-agent payments on proof, the way Pharos's native x402 protocol intends.
- **x402 paywalls** — let one agent gate a resource behind a price and another agent autonomously pay through it to unlock access, closing the full pay-for-service loop.
- **Sentinel-gated execution** — every payment passes a security, policy, and credit check before funds move; unsafe transfers, unknown contracts, and unconfirmed writes are blocked.

## Skill invocation

Install from GitHub:

```
npx skills add https://github.com/Stella112/Pharos-Clearing-House
```

Use:

```
$pharos-clearing-house
```

Example:

```
Use $pharos-clearing-house to settle this hire: I approved paying agent
0xbbbb... up to $1,500 for an RWA risk report. Lock it in escrow against the
deliverable hash and release only when the report is delivered.
```

## Run locally

No install required — the SDK and demos are dependency-free and run on Node 18+.

```
npm test            # 13 tests, Node's built-in runner
npm run demo        # full pipeline: credit verdict -> Sentinel -> escrow -> release
npm run demo:paywall# two-agent x402 paywall loop
npm run demo:unsafe # Sentinel blocking unsafe settlements
npm run mcp         # start the stdio MCP server
```

## The pipeline

```
Credit Bureau (score)  ->  Atlas / Sentinel (approve)  ->  Clearing House (settle)
```

The Clearing House is the third institution in the stack. Its Sentinel gate
accepts a Credit Bureau verdict directly, so a settlement can be conditioned on
creditworthiness, compliance flags, and exposure caps — not just policy limits.

## Tools

| Tool | Purpose |
| --- | --- |
| `clearing_review_action` | Sentinel gate → approve / escalate / block with reasons. |
| `clearing_fund_escrow` | Lock USDC in a conditional escrow against an approved plan. |
| `clearing_release` | Release escrow to payee on a matching proof. |
| `clearing_refund` | Refund escrow to payer after the deadline. |
| `clearing_settle_x402` | Settle a direct agent-to-agent x402 payment on proof. |
| `clearing_paywall_require` | Gate a resource and return a 402 challenge (server side). |
| `clearing_paywall_pay` | Pay a 402 challenge and receive an access grant (client side). |

### SDK usage

```js
import { fundEscrow, release, SimulationAdapter } from "pharos-clearing-house";

const chain = new SimulationAdapter({ balances: { "0xaaaa...": 5000 } });

const fund = await fundEscrow({
  adapter: chain,
  plan: {
    payer: "0xaaaa...",
    payee: "0xbbbb...",
    amountUsd: 1500,
    condition: "deliverable:rwa-risk-report:sha:42abef",
    deadline: Date.now() + 7 * 24 * 3600 * 1000,
    contractKnown: true,
    userConfirmed: true,
    creditVerdict: { band: "prime", score: 78, confidence: 0.82, exposureCapUsd: 2000, criticalFlags: [] },
  },
});

await release({ adapter: chain, escrowId: fund.escrowId, proof: "deliverable:rwa-risk-report:sha:42abef" });
```

### MCP usage

```
npm run mcp
```

```json
{
  "mcpServers": {
    "pharos-clearing-house": { "command": "node", "args": ["mcp/server.js"] }
  }
}
```

## On-chain integration (Pharos testnet)

The escrow logic is deployable as a clean, audit-friendly Solidity contract
(`contracts/src/ClearingHouseEscrow.sol`): no admin, no upgrade path, no
delegatecall, reentrancy-guarded, funds move along exactly two paths
(release-on-proof, refund-after-deadline).

```
cd contracts
forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std
export PRIVATE_KEY=...            # stays in your shell, never in the repo
export PHAROS_TESTNET_RPC=...     # Pharos testnet RPC
forge script script/Deploy.s.sol:Deploy --rpc-url $PHAROS_TESTNET_RPC --broadcast
```

- Chain ID: `688688`
- USDC (Circle testnet faucet): `0xcfc8330f4bcab529c625d12781b1c19466a9fc8b`
- **Deployed escrow address:** _add after deploy, with an explorer link_

## Safety model

Clearing House never executes a write unless the Sentinel gate returns
`approve`. It does not request, store, or print private keys; writes are signed
by a caller-supplied `signer`. The bundled Sentinel mirrors the Sentinel Shield
from Atlas Council and can be swapped for the real one (compatible verdict
shape). Sentinel blocks or escalates on unsupported networks, over-limit
amounts, unconfirmed writes, invalid/zero recipients, unknown contracts, and
Credit Bureau critical flags or exposure-cap breaches.

## Project shape

```
.
├── SKILL.md is at skills/pharos-clearing-house/SKILL.md
├── sdk/            # dependency-free settlement SDK (sentinel, chain, clearing, x402)
├── mcp/server.js   # stdio MCP server exposing the tools
├── contracts/      # Foundry escrow contract + deploy script
├── demos/          # runnable demos (pipeline, paywall, safety)
├── test/           # Node built-in test suite
└── README.md
```

## Phase 2

In the Agent Arena, Clearing House becomes the foundation of a **Treasurer
Steward agent** that runs the full score → approve → settle pipeline
autonomously, invoking Credit Bureau and Atlas Council as it goes.

## License

MIT
