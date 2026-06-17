// Pharos Clearing House — LIVE dashboard server.
//
//   PRIVATE_KEY=0x... npm run dashboard:live      -> http://localhost:8789/
//
// Serves the dashboard AND a tiny JSON API that reads real balances and runs
// real escrow settlements on Pharos Atlantic Testnet through the deployed
// contract. The operating-wallet key is read from the environment, lives only
// in this process, and is never sent to the browser. Needs `ethers`.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PHAROS } from "../sdk/index.js";
import { PharosRpcAdapter } from "../sdk/rpc-adapter.js";
import { TreasurerSteward } from "../agent/steward.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = process.env.PORT || 8789;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || "0xdE52Ac56708C05FE1f8F69D8074A543FAcB1Faab";
const RPC = process.env.PHAROS_TESTNET_RPC || PHAROS.atlantic.rpcUrl;
const PAYEE = process.env.PAYEE || "0x000000000000000000000000000000000000dEaD";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml" };

let adapter, steward, payer, network, ready = false, initError = null;
const settlements = [];

// Stands in for $pharos-credit-bureau scoring the counterparty. In the live demo
// it returns a prime verdict so the Sentinel gate approves; swap for the real
// Credit Bureau skill to gate live settlements on actual creditworthiness.
const liveCreditOracle = async () => ({ band: "prime", score: 78, confidence: 0.82, exposureCapUsd: 100000, criticalFlags: [] });

async function init() {
  if (!PRIVATE_KEY) { initError = "Set PRIVATE_KEY to enable live mode."; return; }
  adapter = new PharosRpcAdapter({ rpcUrl: RPC, privateKey: PRIVATE_KEY, escrowAddress: ESCROW_ADDRESS });
  network = await adapter.syncNetwork();
  payer = await adapter.signer.getAddress();
  steward = new TreasurerSteward({ adapter, operatingWallet: payer, budgetUsd: 100000, signer: adapter.signer, creditOracle: liveCreditOracle });
  ready = true;
  console.log(`Live mode: ${network.name} (chain ${network.chainId}) as ${payer}`);
}

const tx = (hash) => ({ hash, url: `${network.explorer}/tx/${hash}` });

async function readState() {
  const [gasWei, usdcUnits] = await Promise.all([adapter.provider.getBalance(payer), adapter.balanceOf(payer)]);
  return {
    ready, network: network.name, chainId: Number(network.chainId), explorer: network.explorer,
    payer, escrow: ESCROW_ADDRESS, escrowUrl: `${network.explorer}/address/${ESCROW_ADDRESS}`,
    gas: Number(gasWei) / 1e18, usdc: usdcUnits / 1e6, payee: PAYEE,
    settlements, audit: steward ? steward.getAuditTrail() : [],
  };
}

// One real escrow cycle driven by the Treasurer Steward agent: it scores the
// counterparty (Credit Bureau), passes the Sentinel gate, funds on-chain, then
// releases on proof — producing a signed audit trail with real tx hashes.
async function settle(amountUsd) {
  const id = "L" + Date.now();
  const condition = `live:${id}`;
  const hire = await steward.hire({ id, task: "live settlement", payee: PAYEE, maxUsd: amountUsd, condition, deadline: Date.now() + 3600_000 });
  if (hire.step !== "escrow_funded") return { ok: false, reasons: hire.reasons || [hire.reason] };
  const rel = await steward.settleOnDelivery(id, condition);
  const record = {
    at: new Date().toISOString(), amountUsd, escrowId: hire.escrowId,
    fund: tx(hire.txHash), release: tx(rel.txHash), payee: PAYEE,
  };
  settlements.unshift(record);
  return { ok: true, ...record, audit: steward.getAuditTrail() };
}

function sendJSON(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}

const server = createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  if (url === "/api/state") {
    if (!ready) return sendJSON(res, 503, { ready: false, error: initError });
    try { return sendJSON(res, 200, await readState()); }
    catch (e) { return sendJSON(res, 502, { error: e.shortMessage || e.message }); }
  }

  if (url === "/api/settle" && req.method === "POST") {
    if (!ready) return sendJSON(res, 503, { error: initError });
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const amountUsd = Number(JSON.parse(body || "{}").amountUsd || 1);
        sendJSON(res, 200, await settle(amountUsd));
      } catch (e) { sendJSON(res, 502, { ok: false, error: e.shortMessage || e.message }); }
    });
    return;
  }

  // static files
  let path = decodeURIComponent(url) === "/" ? "/dashboard/index.html" : decodeURIComponent(url);
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
});

await init();
server.listen(PORT, () => console.log(`Dashboard (live): http://localhost:${PORT}/  ${ready ? "[LIVE]" : "[" + initError + "]"}`));
