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
npm test            # 18 tests, Node's built-in runner
npm run demo        # full pipeline: credit verdict -> Sentinel -> escrow -> release
npm run demo:paywall# two-agent x402 paywall loop
npm run demo:unsafe # Sentinel blocking unsafe settlements
npm run agent       # Treasurer Steward agent runs the pipeline autonomously
npm run dashboard   # live dashboard at http://localhost:8788 (drives the real agent)
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

## On-chain integration (Pharos testnet) — LIVE

The escrow is **deployed and verified live on Pharos Atlantic Testnet (chain
`688689`)**, with a real USDC settlement run end-to-end through it:

| | |
| --- | --- |
| **Escrow contract** | [`0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab`](https://atlantic.pharosscan.xyz/address/0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab) |
| **Fund tx** (approve + lock 2 USDC) | [`0xcaf1…02a9`](https://atlantic.pharosscan.xyz/tx/0xcaf19162a9845c6423536fb8740b231f1ac6cdfe66950ff2a24d04b92f0a02a9) |
| **Release tx** (proof → payee) | [`0x62ea…efef8`](https://atlantic.pharosscan.xyz/tx/0x62ea0119b6f790922e90906de8917ca65827b6776d45ab3818213d4ca05efef8) |
| **Network** | Pharos Atlantic Testnet · chain `688689` · RPC `https://atlantic.dplabs-internal.com` |

Real USDC moved through the Sentinel-gated escrow: the payer balance went 20 →
18 USDC and the payee received 2, settled only after a matching proof.

The contract is a clean, audit-friendly Solidity escrow
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

- Live chain: Pharos Atlantic Testnet `688689` (Pharos Testnet `688688` also supported)
- USDC (Circle testnet faucet): `0xcfc8330f4bcab529c625d12781b1c19466a9fc8b`
- Deployed escrow: `0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab` ([explorer](https://atlantic.pharosscan.xyz/address/0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab))

### Live settlement (real testnet, not simulation)

The same agent and SDK run against the real chain by swapping the in-memory
`SimulationAdapter` for the `PharosRpcAdapter` (`sdk/rpc-adapter.js`), which
signs actual transactions to the deployed escrow and Circle USDC. The core stays
zero-dependency; the live adapter needs `ethers` (an optional dependency).

```
export PRIVATE_KEY=...        # operating wallet, holds gas + testnet USDC
export ESCROW_ADDRESS=0x...   # from the deploy above
npm run live                  # real escrow fund -> release, prints explorer tx links
```

The operating wallet needs **PHRS** for gas and **testnet USDC** (from
[faucet.circle.com](https://faucet.circle.com)) because the escrow moves USDC.
The private key is read from the environment, lives only server-side, and is
never placed in the browser or the repo.

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
├── sdk/            # settlement SDK — sim adapter (zero-dep) + PharosRpcAdapter (live)
├── agent/          # Treasurer Steward — autonomous agent that drives the skill
├── dashboard/      # live web dashboard (runs the real agent in the browser)
├── scripts/        # live-settle.mjs — real escrow fund/release on testnet
├── mcp/server.js   # stdio MCP server exposing the tools
├── contracts/      # Foundry escrow contract + deploy script
├── demos/          # runnable demos (pipeline, paywall, safety)
├── test/           # Node built-in test suite
└── README.md
```

## Autonomous agent (Phase 2 preview)

The skill ships with a runnable **Treasurer Steward** agent (`agent/steward.js`)
that *drives* the Clearing House with no human in the loop beyond its standing
mandate. Given a queue of hire requests it autonomously scores each
counterparty, funds what's safe, refuses what's over budget, blocks what fails
Sentinel, then releases on delivery or reclaims on timeout:

```
npm run agent
```

The agent acts, but stays inside three fences:

- a **dedicated operating wallet**, not the user's main wallet;
- a **hard budget cap** it cannot spend past, tracked across mandates;
- the **same Sentinel gate** the skill enforces on every write.

It never reads or stores a private key — a `signer` is injected by the runtime
(the simulation adapter offline; an RPC adapter + keystore on testnet). This is
the bridge from a Phase 1 Skill to a Phase 2 Agent: the settlement skill is the
hands, the Steward is the autonomy around them.

A dashboard (`npm run dashboard`, then open http://localhost:8788) renders the
Steward working — operating wallet, budget meter, the mandate queue with
per-counterparty decisions, settlement outcomes, and the signed audit trail. It
imports and runs the **actual agent code**, not a mock. It has two modes:

- **Simulation** — the in-memory pipeline, always works, ideal for the walkthrough.
- **Live · testnet** — reads the operating wallet's **real** USDC/gas balances and
  runs **real** escrow settlements through the deployed contract, rendering each
  transaction's Atlantic explorer link as on-chain proof. Start it with the key
  held server-side (never sent to the browser):

  ```
  PRIVATE_KEY=0x... npm run dashboard:live    # http://localhost:8789
  ```

Served over HTTP (the bundled server does this); opening the file directly won't
work because the browser blocks ES-module imports over `file://`.

## Phase 2

In the Agent Arena, the Treasurer Steward graduates from preview to a deployed
agent that runs the full score → approve → settle pipeline live, invoking Credit
Bureau and Atlas Council as it goes.

The Steward is a natural fit for **ERC-8004 (Trustless Agents)**: it can carry a
portable on-chain identity and write Credit Bureau verdicts into an ERC-8004
reputation registry, so a counterparty's creditworthiness — and the Steward's
own settlement track record — become verifiable across the ecosystem. Identity
and reputation (ERC-8004) sit one layer above settlement (this escrow); together
they let agents transact with both safety and portable trust.

## License

MIT
