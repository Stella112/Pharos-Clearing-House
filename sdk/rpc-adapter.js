// Pharos Clearing House — live RPC adapter (real testnet settlement).
//
// Implements the same ChainAdapter surface as SimulationAdapter, but against the
// real Pharos testnet: it signs transactions to the deployed ClearingHouseEscrow
// contract and the Circle testnet USDC token. Drop it in place of the simulation
// adapter and the agent / SDK / dashboard settle for real, with explorer-linked
// tx hashes.
//
//   import { PharosRpcAdapter } from "pharos-clearing-house/sdk/rpc-adapter.js";
//   const chain = new PharosRpcAdapter({ rpcUrl, privateKey, escrowAddress });
//
// Requires `ethers` (npm i ethers). The private key is supplied by the runtime
// (env/keystore) and lives only here — never in the browser, never in the repo.

import { ethers } from "ethers";
import { PHAROS, USDC_DECIMALS } from "./chain.js";

const ESCROW_ABI = [
  "function fund(address payee,address token,uint256 amount,bytes32 conditionHash,uint64 deadline) returns (uint256 id)",
  "function release(uint256 id,bytes proof)",
  "function refund(uint256 id)",
  "function nextId() view returns (uint256)",
  "function getEscrow(uint256 id) view returns (tuple(address payer,address payee,address token,uint256 amount,bytes32 conditionHash,uint64 deadline,uint8 status))",
  "event EscrowFunded(uint256 indexed id,address indexed payer,address indexed payee,address token,uint256 amount,bytes32 conditionHash,uint64 deadline)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
];

const toSeconds = (deadline) => (deadline > 1e12 ? Math.floor(deadline / 1000) : Math.floor(deadline));
const conditionToHash = (condition) => ethers.keccak256(ethers.toUtf8Bytes(condition));

export class PharosRpcAdapter {
  constructor({ rpcUrl, privateKey, escrowAddress, usdcAddress, network = PHAROS.testnet }) {
    if (!escrowAddress) throw new Error("escrowAddress required");
    this._network = network;
    this.usdcAddress = usdcAddress || network.usdc;
    this.provider = new ethers.JsonRpcProvider(rpcUrl || network.rpcUrl, undefined, { staticNetwork: true });
    this.signer = privateKey ? new ethers.Wallet(privateKey, this.provider) : null;
    this.escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, this.signer || this.provider);
    this.usdc = new ethers.Contract(this.usdcAddress, ERC20_ABI, this.signer || this.provider);
  }

  get network() {
    return this._network;
  }

  _explorer(hash) {
    return `${this._network.explorer}/tx/${hash}`;
  }

  // USDC balance, normalized to the SDK's integer-units convention (1e6).
  async balanceOf(owner) {
    const raw = await this.usdc.balanceOf(owner);
    // raw is already in token units (6 decimals) — same as usdToUnits output.
    return Number(raw);
  }

  async escrowCreate({ payee, amountUnits, condition, deadline }) {
    const amount = BigInt(amountUnits);
    const escrowAddr = await this.escrow.getAddress();

    // Approve the escrow to pull USDC, only if the allowance is short.
    const owner = await this.signer.getAddress();
    const current = await this.usdc.allowance(owner, escrowAddr);
    if (current < amount) {
      const a = await this.usdc.approve(escrowAddr, amount);
      await a.wait();
    }

    const tx = await this.escrow.fund(payee, this.usdcAddress, amount, conditionToHash(condition), toSeconds(deadline));
    const rcpt = await tx.wait();

    // Resolve the new escrow id from the EscrowFunded event (fallback: nextId()).
    let id;
    for (const log of rcpt.logs) {
      try {
        const parsed = this.escrow.interface.parseLog(log);
        if (parsed && parsed.name === "EscrowFunded") { id = parsed.args.id; break; }
      } catch {}
    }
    if (id === undefined) id = await this.escrow.nextId();
    return { id: id.toString(), txHash: tx.hash, explorer: this._explorer(tx.hash) };
  }

  async escrowRelease({ id, proof }) {
    const tx = await this.escrow.release(BigInt(id), ethers.toUtf8Bytes(proof));
    await tx.wait();
    const e = await this.escrow.getEscrow(BigInt(id));
    return { id, txHash: tx.hash, explorer: this._explorer(tx.hash), paidTo: e.payee, amountUnits: Number(e.amount) };
  }

  async escrowRefund({ id }) {
    const tx = await this.escrow.refund(BigInt(id));
    await tx.wait();
    const e = await this.escrow.getEscrow(BigInt(id));
    return { id, txHash: tx.hash, explorer: this._explorer(tx.hash), refundedTo: e.payer, amountUnits: Number(e.amount) };
  }

  // Direct USDC transfer (x402 settle path).
  async transfer({ to, amountUnits }) {
    const tx = await this.usdc.transfer(to, BigInt(amountUnits));
    await tx.wait();
    return { txHash: tx.hash, explorer: this._explorer(tx.hash), to };
  }
}
