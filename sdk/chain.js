// Pharos Clearing House — chain layer
//
// The Clearing House never holds, reads, or prints private keys. Any write
// action is performed through an injected `signer` callback supplied by the
// caller's wallet/runtime. The default adapter is a deterministic in-memory
// simulation so the skill runs offline with zero dependencies; swap in an
// RPC-backed adapter for real Pharos testnet settlement.

export const PHAROS = {
  testnet: {
    name: "pharos-testnet",
    chainId: 688688,
    rpcUrl: "https://testnet.dplabs-internal.com", // override via env in real runs
    explorer: "https://testnet.pharosscan.xyz",
    // Circle testnet USDC on Pharos
    usdc: "0xcfc8330f4bcab529c625d12781b1c19466a9fc8b",
  },
  mainnet: {
    name: "pharos-mainnet",
    chainId: 688689,
  },
};

export const USDC_DECIMALS = 6;
const ZERO = "0x0000000000000000000000000000000000000000";

export function usdToUnits(usd) {
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) {
    throw new Error("amountUsd must be a non-negative finite number");
  }
  return Math.round(usd * 10 ** USDC_DECIMALS);
}

export function unitsToUsd(units) {
  return Number(units) / 10 ** USDC_DECIMALS;
}

export function isAddress(a) {
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
}

// Base interface — documents the surface a real RPC adapter must implement.
export class ChainAdapter {
  get network() {
    throw new Error("not implemented");
  }
  async balanceOf(/* owner */) {
    throw new Error("not implemented");
  }
  async escrowCreate(/* { payer, payee, amountUnits, conditionHash, deadline, signer } */) {
    throw new Error("not implemented");
  }
  async escrowRelease(/* { id, proof, caller, signer } */) {
    throw new Error("not implemented");
  }
  async escrowRefund(/* { id, caller, now, signer } */) {
    throw new Error("not implemented");
  }
  async transfer(/* { from, to, amountUnits, signer } */) {
    throw new Error("not implemented");
  }
}

// Deterministic in-memory chain for offline demos and tests.
export class SimulationAdapter extends ChainAdapter {
  constructor({ balances = {}, network = PHAROS.testnet } = {}) {
    super();
    this._network = network;
    this._bal = new Map(Object.entries(balances).map(([k, v]) => [k.toLowerCase(), usdToUnits(v)]));
    this._escrows = new Map();
    this._seq = 0;
    this._txSeq = 0;
  }

  get network() {
    return this._network;
  }

  _txHash() {
    this._txSeq += 1;
    return "0xsim" + String(this._txSeq).padStart(60, "0");
  }

  _credit(addr, units) {
    const k = addr.toLowerCase();
    this._bal.set(k, (this._bal.get(k) || 0) + units);
  }

  _debit(addr, units) {
    const k = addr.toLowerCase();
    const cur = this._bal.get(k) || 0;
    if (cur < units) throw new Error(`insufficient balance for ${addr}`);
    this._bal.set(k, cur - units);
  }

  async balanceOf(owner) {
    return this._bal.get(owner.toLowerCase()) || 0;
  }

  async escrowCreate({ payer, payee, amountUnits, conditionHash, deadline }) {
    this._debit(payer, amountUnits); // funds locked in the vault
    this._seq += 1;
    const id = "esc_" + this._seq;
    this._escrows.set(id, {
      id,
      payer,
      payee,
      amountUnits,
      conditionHash,
      deadline,
      status: "open",
    });
    return { id, txHash: this._txHash(), locked: amountUnits };
  }

  async escrowRelease({ id, proof }) {
    const e = this._escrows.get(id);
    if (!e) throw new Error("unknown escrow");
    if (e.status !== "open") throw new Error(`escrow not open (${e.status})`);
    if (sha(proof) !== e.conditionHash) throw new Error("proof does not satisfy condition");
    e.status = "released";
    this._credit(e.payee, e.amountUnits);
    return { id, txHash: this._txHash(), paidTo: e.payee, amountUnits: e.amountUnits };
  }

  async escrowRefund({ id, now }) {
    const e = this._escrows.get(id);
    if (!e) throw new Error("unknown escrow");
    if (e.status !== "open") throw new Error(`escrow not open (${e.status})`);
    if (now <= e.deadline) throw new Error("escrow not past deadline yet");
    e.status = "refunded";
    this._credit(e.payer, e.amountUnits);
    return { id, txHash: this._txHash(), refundedTo: e.payer, amountUnits: e.amountUnits };
  }

  async transfer({ from, to, amountUnits }) {
    if (!isAddress(to) || to === ZERO) throw new Error("invalid recipient");
    this._debit(from, amountUnits);
    this._credit(to, amountUnits);
    return { txHash: this._txHash(), from, to, amountUnits };
  }

  escrow(id) {
    return this._escrows.get(id) || null;
  }
}

// Tiny deterministic non-cryptographic digest used to bind a proof to a
// condition in the simulation. Real deployments use keccak256 on-chain.
export function sha(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h1 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  let h2 = 0xc2b2ae35 ^ h1;
  for (let i = s.length - 1; i >= 0; i--) {
    h2 ^= s.charCodeAt(i);
    h2 = Math.imul(h2, 0x85ebca77) >>> 0;
  }
  return "0x" + (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}
