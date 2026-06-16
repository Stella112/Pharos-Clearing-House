#!/usr/bin/env node
// Pharos Clearing House — stdio MCP server (zero dependencies).
//
// Speaks JSON-RPC 2.0 over stdin/stdout, line-delimited, implementing the
// minimal MCP surface (initialize, tools/list, tools/call). Holds one
// in-memory SimulationAdapter per session so an agent can fund an escrow and
// release it across calls. For real settlement, replace the adapter with an
// RPC adapter and inject the caller's signer.
//
//   node mcp/server.js
//
// MCP client config:
//   { "mcpServers": { "pharos-clearing-house": { "command": "node", "args": ["mcp/server.js"] } } }

import {
  reviewAction,
  fundEscrow,
  release,
  refund,
  settleX402,
  paywallRequire,
  paywallPay,
  SimulationAdapter,
} from "../sdk/index.js";

const chain = new SimulationAdapter({
  balances: {
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": 100000,
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb": 0,
  },
});

const TOOLS = [
  {
    name: "clearing_review_action",
    description: "Run the Sentinel gate on a proposed settlement and return approve/escalate/block with reasons. Accepts an optional Credit Bureau verdict.",
    inputSchema: {
      type: "object",
      properties: {
        network: { type: "string" },
        amountUsd: { type: "number" },
        to: { type: "string" },
        isWrite: { type: "boolean" },
        contractKnown: { type: "boolean" },
        userConfirmed: { type: "boolean" },
        creditVerdict: { type: "object" },
      },
    },
    run: (a) => reviewAction(a),
  },
  {
    name: "clearing_fund_escrow",
    description: "Lock USDC in a conditional escrow against a Sentinel-approved plan. Pays out only on proof.",
    inputSchema: {
      type: "object",
      required: ["payer", "payee", "amountUsd", "condition", "deadline"],
      properties: {
        payer: { type: "string" }, payee: { type: "string" }, amountUsd: { type: "number" },
        condition: { type: "string" }, deadline: { type: "number" },
        contractKnown: { type: "boolean" }, userConfirmed: { type: "boolean" }, creditVerdict: { type: "object" },
      },
    },
    run: (a) => fundEscrow({ adapter: chain, plan: a }),
  },
  {
    name: "clearing_release",
    description: "Release an escrow to the payee when a proof satisfies the agreed condition.",
    inputSchema: { type: "object", required: ["escrowId", "proof"], properties: { escrowId: { type: "string" }, proof: { type: "string" } } },
    run: (a) => release({ adapter: chain, escrowId: a.escrowId, proof: a.proof }),
  },
  {
    name: "clearing_refund",
    description: "Refund an escrow to the payer after the deadline if no valid proof arrived.",
    inputSchema: { type: "object", required: ["escrowId"], properties: { escrowId: { type: "string" }, now: { type: "number" } } },
    run: (a) => refund({ adapter: chain, escrowId: a.escrowId, now: a.now }),
  },
  {
    name: "clearing_settle_x402",
    description: "Settle a direct agent-to-agent x402 payment on proof of delivery, gated by Sentinel.",
    inputSchema: {
      type: "object",
      required: ["from", "to", "amountUsd"],
      properties: {
        from: { type: "string" }, to: { type: "string" }, amountUsd: { type: "number" },
        proof: { type: "string" }, expectedConditionHash: { type: "string" },
        contractKnown: { type: "boolean" }, userConfirmed: { type: "boolean" }, creditVerdict: { type: "object" },
      },
    },
    run: (a) => settleX402({ adapter: chain, payment: a }),
  },
  {
    name: "clearing_paywall_require",
    description: "Server side: gate a resource behind a price and return an x402 402 challenge.",
    inputSchema: { type: "object", required: ["resource", "priceUsd", "payTo"], properties: { resource: { type: "string" }, priceUsd: { type: "number" }, payTo: { type: "string" }, ttlMs: { type: "number" } } },
    run: (a) => paywallRequire(a),
  },
  {
    name: "clearing_paywall_pay",
    description: "Client side: pay an x402 challenge through Sentinel-gated settlement and return an access grant.",
    inputSchema: { type: "object", required: ["from", "challenge"], properties: { from: { type: "string" }, challenge: { type: "object" }, userConfirmed: { type: "boolean" }, creditVerdict: { type: "object" } } },
    run: (a) => paywallPay({ adapter: chain, from: a.from, challenge: a.challenge, userConfirmed: a.userConfirmed, creditVerdict: a.creditVerdict }),
  },
];

const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function err(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "pharos-clearing-house", version: "0.1.0" },
      capabilities: { tools: {} },
    });
  }
  if (method === "notifications/initialized") return; // no response
  if (method === "tools/list") {
    return ok(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  }
  if (method === "tools/call") {
    const tool = byName[params?.name];
    if (!tool) return err(id, -32602, `unknown tool: ${params?.name}`);
    try {
      const result = await tool.run(params.arguments || {});
      return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    } catch (e) {
      return ok(id, { isError: true, content: [{ type: "text", text: `error: ${e.message}` }] });
    }
  }
  if (id !== undefined) err(id, -32601, `method not found: ${method}`);
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch {
      err(null, -32700, "parse error");
    }
  }
});
