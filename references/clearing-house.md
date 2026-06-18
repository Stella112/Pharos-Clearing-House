# Clearing House — on-chain operations reference

Machine-readable specs for driving the deployed `ClearingHouseEscrow` contract
with Foundry's `cast`. Network and contract addresses resolve from
[`assets/networks.json`](../assets/networks.json).

Resolved values (Pharos Atlantic Testnet):

- `RPC` = `https://atlantic.dplabs-internal.com`
- `ESCROW` = `0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab`
- `USDC` = `0xcfc8330f4bcab529c625d12781b1c19466a9fc8b` (6 decimals)
- `EXPLORER` = `https://atlantic.pharosscan.xyz`

The private key is read from `$PRIVATE_KEY` in the caller's shell — never printed,
never committed.

---

## fund-escrow

**Overview.** Lock USDC for a payee, releasable only by a `proof` whose
`keccak256` equals the `conditionHash`, until a unix `deadline`. USDC must be
approved to the escrow first, then `fund` pulls it in.

**Command Template.**
```bash
# 1) derive the condition hash from the agreed deliverable string
PROOF_HEX=$(cast from-utf8 "rwa-risk-report:v1")
CONDITION=$(cast keccak $PROOF_HEX)

# 2) approve the escrow to pull USDC (amount in 6-decimal base units; $1500 = 1500000000)
cast send $USDC "approve(address,uint256)" $ESCROW 1500000000 \
  --rpc-url $RPC --private-key $PRIVATE_KEY

# 3) fund: payee, token, amount, conditionHash, deadline(unix seconds)
cast send $ESCROW "fund(address,address,uint256,bytes32,uint64)" \
  0xPAYEE $USDC 1500000000 $CONDITION 1893456000 \
  --rpc-url $RPC --private-key $PRIVATE_KEY
```

**Parameters.**
| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| payee | address | yes | Who receives the funds on a valid proof. Must be non-zero. |
| token | address | yes | ERC-20 to escrow (use `$USDC`). |
| amount | uint256 | yes | Base units (USDC has 6 decimals; `$1` = `1000000`). |
| conditionHash | bytes32 | yes | `cast keccak` of the proof bytes the payee must reveal. |
| deadline | uint64 | yes | Unix seconds; must be in the future. |

**Output Parsing.**
| Field | Description |
| --- | --- |
| `EscrowFunded(id, payer, payee, token, amount, conditionHash, deadline)` | Emitted on success; `id` (first indexed topic) is the escrow id used by `release`/`refund`. |
| tx status `1` | Funding succeeded; read the new id with `cast call $ESCROW "nextId()(uint256)" --rpc-url $RPC`. |

**Error Handling.**
| Revert string | Cause | Suggested action |
| --- | --- | --- |
| `payee=0` | Payee is the zero address | Provide a valid recipient. |
| `token=0` | Token is the zero address | Pass the USDC address. |
| `amount=0` | Amount is zero | Use a positive base-unit amount. |
| `deadline in past` | Deadline ≤ current block time | Use a future unix timestamp. |
| `ERC20: insufficient allowance` | Approve step skipped or too small | Re-run the `approve` with ≥ amount. |

**Agent Guidelines.**
1. Run the Sentinel gate first (`clearing_review_action`); do not proceed unless it returns `approve`.
2. Derive `CONDITION` from the deliverable string and record both the string and hash.
3. Approve, then fund. Capture the `EscrowFunded` `id` from logs or `nextId()`.
4. Report the escrow id, amount, condition, deadline, and the explorer tx link.

---

## release-on-proof

**Overview.** Release escrow `id` to the payee by revealing the proof bytes whose
`keccak256` matches the stored `conditionHash`. Callable by payer or payee before
the deadline.

**Command Template.**
```bash
PROOF_HEX=$(cast from-utf8 "rwa-risk-report:v1")
cast send $ESCROW "release(uint256,bytes)" 1 $PROOF_HEX \
  --rpc-url $RPC --private-key $PRIVATE_KEY
```

**Parameters.**
| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| id | uint256 | yes | Escrow id from `fund`. |
| proof | bytes | yes | The deliverable bytes; `keccak256(proof)` must equal the stored condition. |

**Output Parsing.**
| Field | Description |
| --- | --- |
| `EscrowReleased(id, payee, amount)` | Emitted on success; funds transferred to the payee. |

**Error Handling.**
| Revert string | Cause | Suggested action |
| --- | --- | --- |
| `not open` | Already released/refunded | Read state with `getEscrow`; nothing to do. |
| `not party` | Caller is neither payer nor payee | Call from the payer or payee key. |
| `expired` | Past the deadline | Use `refund` instead. |
| `bad proof` | `keccak256(proof)` ≠ condition | Reveal the exact agreed proof bytes. |

**Agent Guidelines.**
1. Confirm the deliverable matches the agreed condition before revealing the proof.
2. Send `release`; verify the `EscrowReleased` event and the payee balance change.
3. Report the explorer tx link.

---

## refund-after-deadline

**Overview.** Return escrow `id` to the payer after the deadline if no valid
proof was presented.

**Command Template.**
```bash
cast send $ESCROW "refund(uint256)" 1 --rpc-url $RPC --private-key $PRIVATE_KEY
```

**Parameters.**
| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| id | uint256 | yes | Escrow id from `fund`. |

**Output Parsing.**
| Field | Description |
| --- | --- |
| `EscrowRefunded(id, payer, amount)` | Emitted on success; funds returned to the payer. |

**Error Handling.**
| Revert string | Cause | Suggested action |
| --- | --- | --- |
| `not open` | Already released/refunded | Read state with `getEscrow`. |
| `not expired` | Deadline not reached | Wait until after the deadline, or `release` with a proof. |

**Agent Guidelines.**
1. Confirm the current time is past the escrow deadline (`getEscrow`).
2. Send `refund`; verify `EscrowRefunded` and the payer balance change.

---

## read-an-escrow

**Overview.** Read an escrow's full state without a transaction.

**Command Template.**
```bash
cast call $ESCROW "getEscrow(uint256)((address,address,address,uint256,bytes32,uint64,uint8))" 1 --rpc-url $RPC
cast logs --address $ESCROW --rpc-url $RPC   # query EscrowFunded/Released/Refunded history
```

**Output Parsing.**
| Field | Description |
| --- | --- |
| payer / payee / token | Parties and escrowed token. |
| amount | Escrowed base units. |
| conditionHash | The proof commitment. |
| deadline | Unix seconds. |
| status | 0 None · 1 Open · 2 Released · 3 Refunded. |

**Agent Guidelines.**
1. Use this to confirm an escrow exists and is `Open` before `release`/`refund`.
2. Use `cast logs` to reconstruct a counterparty's settlement history (the same signal Credit Bureau reads).
