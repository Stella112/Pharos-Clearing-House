# x402 settlement & paywall flow

Pharos supports the x402 protocol natively for machine-to-machine agent
payments. The Clearing House implements two x402 patterns on top of the same
Sentinel-gated settlement core.

## Direct settlement (`settle_x402`)

1. Two agents agree on a deliverable and a condition hash.
2. The service agent delivers and provides a proof.
3. `settle_x402` verifies the proof against `expectedConditionHash`, runs the
   Sentinel gate, and transfers USDC on approval.

Funds never move if the proof mismatches or the gate blocks.

## Paywall (`paywall_require` + `paywall_pay`)

Server side (resource owner):

1. `paywall_require({ resource, priceUsd, payTo })` returns an HTTP 402
   challenge: `{ status: 402, scheme: "x402", resource, priceUsd, payTo, nonce,
   conditionHash, expiresAt }`.

Client side (paying agent):

2. `paywall_pay({ from, challenge })` reconstructs the expected proof from the
   challenge, settles via the Sentinel-gated `settle_x402`, and returns an
   `accessToken`.

Server side again:

3. `paywall_verify({ challenge, settlementTxHash, presentedToken })` confirms
   the token before serving the resource.

Because the paying side flows through the Sentinel gate, a malicious or
over-priced paywall cannot drain an agent: the same limits, confirmation, and
credit checks that protect a direct transfer protect an automatic pay-through.

## Why gate the paywall

An agent that auto-pays every 402 it encounters is a wallet-drain waiting to
happen. Routing pay-through settlement through Sentinel turns "pay automatically"
into "pay automatically, within policy, to known counterparties, under the
exposure cap."
