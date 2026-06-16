# Demo recording guide (~90 seconds)

Goal: show a working three-skill pipeline and the safety gate, then prove
on-chain integration on Pharos testnet.

## Suggested script

1. **(0:00–0:10) Frame it.** "Credit Bureau scores, Atlas Council decides, and
   Pharos Clearing House is the piece that actually settles — gated by Sentinel,
   on Pharos."

2. **(0:10–0:35) The pipeline.** Run:
   ```
   npm run demo
   ```
   Narrate: a Credit Bureau verdict feeds the Sentinel gate → approved → escrow
   funded → released only on the delivery proof. Funds move once, after proof.

3. **(0:35–0:55) The agent economy loop.** Run:
   ```
   npm run demo:paywall
   ```
   Narrate: one agent gates a premium RWA feed behind a $5 x402 price; another
   agent autonomously pays through it and gets a verifiable access grant.

4. **(0:55–1:10) Safety.** Run:
   ```
   npm run demo:unsafe
   ```
   Narrate: over-limit, unconfirmed, drain-to-zero, and sanctioned-counterparty
   attempts are all blocked; only the clean payment settles.

5. **(1:10–1:30) On-chain proof.** Show the deployed `ClearingHouseEscrow` on
   the Pharos testnet explorer and one real `fund` / `release` transaction.
   Mention USDC came from Circle's testnet faucet.

## Before recording

- `npm test` passes (13/13).
- Deploy the contract to testnet and paste the address into README + SUBMISSION.
- Do one real testnet escrow fund/release so you have a tx link to show.
