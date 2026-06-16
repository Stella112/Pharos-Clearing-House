# Sentinel policy

The Clearing House Sentinel gate runs before any value moves. It returns one of
`approve`, `escalate`, or `block`, with reasons. Decision precedence: any block
condition → `block`; else any escalation → `escalate`; else `approve`.

## Default policy

| Field | Default | Meaning |
| --- | --- | --- |
| `allowedNetworks` | `["pharos-testnet","pharos-mainnet",688688,688689]` | Networks settlement is permitted on. |
| `maxTransferUsd` | `10000` | Hard policy ceiling per action. |
| `requireUserConfirmedForWrites` | `true` | Writes need explicit confirmation. |
| `requireKnownContractForWrites` | `true` | Unknown contracts escalate. |
| `minCreditScore` | `55` | Below this, escalate (when a credit verdict is supplied). |
| `minCreditConfidence` | `0.4` | Below this, escalate. |

## Block conditions

- Network not in `allowedNetworks`.
- `amountUsd <= 0` or `> maxTransferUsd`.
- Write without `userConfirmed === true`.
- Recipient missing, malformed, or the zero address (drain-pattern guard).
- Credit verdict carries any `criticalFlags`.
- `amountUsd` exceeds the credit verdict's `exposureCapUsd`.

## Escalate conditions

- Write to a contract not on the known-contract allowlist.
- Credit score below `minCreditScore`, or confidence below `minCreditConfidence`.

## Credit Bureau verdict shape

```
{ band, score, confidence, exposureCapUsd, criticalFlags: [] }
```

This is the verdict emitted by `$pharos-credit-bureau`. Passing it into the gate
conditions settlement on creditworthiness, not just policy limits. The same
shape is produced by the Atlas Council Sentinel, so either can drive the gate.
