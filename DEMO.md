# Demo recording guide (~90 seconds)

Goal: show an autonomous agent settling **real USDC on Pharos**, gated by
Sentinel — then prove it on the block explorer.

## Before you record (setup)

1. **Start the live dashboard** (key stays in your shell, never in the repo):
   ```powershell
   cd "C:\pharos skill\Pharos-Clearing-House"
   $env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
   $env:PRIVATE_KEY = (Get-Content "C:\pharos skill\_deploy\.wallet.json" | ConvertFrom-Json).privateKey
   npm run dashboard:live
   ```
   Open **http://localhost:8789** and switch the toggle to **Live · testnet**.
   Keep this terminal open the whole time — if you close it the dashboard freezes.

2. **Open a second browser tab** at the escrow on the explorer:
   https://atlantic.pharosscan.xyz/address/0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab

3. Confirm the wallet still has testnet USDC (each live click settles $1). Top up
   at https://faucet.circle.com if needed.

## Recording tool (Windows)

- **Game Bar** — press `Win + G`, hit record. Built in, no install.
- or **OBS Studio** (free) / **Loom** for nicer quality.
- Record at 1080p, capture the browser window. Speak over it.

## The 90-second script

**(0:00–0:12) Frame it.**
"Pharos Clearing House is the settlement layer for AI agents. In my stack the
Credit Bureau scores a counterparty, the Atlas Council gates the decision, and
the Clearing House actually moves the money — live on Pharos."
*(Show the dashboard header in Live mode: `chain 688689 · atlantic · LIVE`.)*

**(0:12–0:30) Real, not simulated.**
"This is a real operating wallet on Pharos Atlantic testnet — real USDC, real
gas — and my escrow contract, already deployed."
*(Point at the USDC balance, gas, and the linked escrow contract.)*

**(0:30–0:55) Autonomous settlement.**
Click **Run live settlement**.
"With one click, the Treasurer Steward agent scores the counterparty, clears the
Sentinel gate, funds an escrow on-chain, and releases on proof — no human in the
loop."
*(Watch the USDC balance drop, a new proof row appear, and the signed audit
trail fill in: credit → escrow_funded → released.)*

**(0:55–1:12) Prove it on-chain.** ← the money shot
Click the **fund** or **release** tx hash.
"And here it is on the Pharos explorer — a real, confirmed transaction. Nothing
simulated."
*(The Atlantic explorer tab shows the confirmed tx.)*

**(1:12–1:25) The safety gate.**
Flip the toggle to **Simulation** and click **Run mandate queue**.
"The same agent, fenced: it funds a good counterparty, blocks a sanctioned one
at the Sentinel gate, and refuses anything over its budget."

**(1:25–1:30) Close.**
"Three composable skills, one autonomous settlement agent, live on Pharos. In
Phase 2 the Treasurer Steward runs the whole score-approve-settle pipeline on its
own."

## CLI-only alternative (no browser)

If you prefer a terminal demo:
```
npm test               # 18/18 green
npm run agent          # autonomous pipeline: fund / block / refuse / reclaim
PRIVATE_KEY=0x... npm run live   # one real USDC escrow fund->release on Atlantic
```

## After recording

- Upload (YouTube unlisted / Loom / Drive) and paste the link into `SUBMISSION.md`.
- Add your email to `SUBMISSION.md`.
- Submit the repo link on DoraHacks.

## On-chain proof already live

- Escrow: `0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab`
  ([explorer](https://atlantic.pharosscan.xyz/address/0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab))
- Real settlements: escrows #1–#6, each a `fund` + `release` tx pair on Atlantic (688689).
