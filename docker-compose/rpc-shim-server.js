/**
 * diamond-node does not expose the `net` JSON-RPC namespace, so net_version,
 * net_listening and net_peerCount all return -32601. This proxy answers
 * those three methods locally — deriving the network id from eth_chainId,
 * 
 */

const http = require("node:http");

const UPSTREAM = process.env.UPSTREAM_RPC_URL || "https://rpc.bit.diamonds/rpc";
const PORT = Number(process.env.PORT || 8545);
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 30000);

const LOCAL_METHODS = new Set(["net_version", "net_listening", "net_peerCount"]);

let cachedNetVersion = null;

async function callUpstream(payload) {
  const res = await fetch(UPSTREAM, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
  return res.json();
}

/** Derive the network id from eth_chainId and cache it; it cannot change. */
async function getNetVersion() {
  if (cachedNetVersion !== null) return cachedNetVersion;
  const out = await callUpstream({
    jsonrpc: "2.0",
    id: "shim-chainid",
    method: "eth_chainId",
    params: [],
  });
  if (!out || typeof out.result !== "string") {
    throw new Error("eth_chainId did not return a result");
  }
  cachedNetVersion = BigInt(out.result).toString(10);
  console.log(`[shim] net_version resolved to ${cachedNetVersion}`);
  return cachedNetVersion;
}

async function answerLocally(req) {
  switch (req.method) {
    case "net_version":
      return { jsonrpc: "2.0", id: req.id, result: await getNetVersion() };
    case "net_listening":
      return { jsonrpc: "2.0", id: req.id, result: true };
    case "net_peerCount":
      // Not knowable without the net namespace; graph-node does not act on it.
      return { jsonrpc: "2.0", id: req.id, result: "0x1" };
    default:
      throw new Error(`not a local method: ${req.method}`);
  }
}

async function handlePayload(payload) {
  const isBatch = Array.isArray(payload);
  const items = isBatch ? payload : [payload];

  const results = new Array(items.length);
  const toForward = [];
  const forwardIndex = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && LOCAL_METHODS.has(item.method)) {
      try {
        results[i] = await answerLocally(item);
      } catch (err) {
        results[i] = {
          jsonrpc: "2.0",
          id: item.id ?? null,
          error: { code: -32603, message: `shim: ${err.message}` },
        };
      }
    } else {
      toForward.push(item);
      forwardIndex.push(i);
    }
  }

  if (toForward.length > 0) {
    const upstream = await callUpstream(isBatch ? toForward : toForward[0]);
    const list = Array.isArray(upstream) ? upstream : [upstream];

    const byId = new Map(list.map((r) => [JSON.stringify(r?.id), r]));
    for (let k = 0; k < forwardIndex.length; k++) {
      const sent = toForward[k];
      const matched = byId.get(JSON.stringify(sent?.id));
      results[forwardIndex[k]] = matched ?? list[k];
    }
  }

  return isBatch ? results : results[0];
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, upstream: UPSTREAM, netVersion: cachedNetVersion }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 12 * 1024 * 1024) {
      res.writeHead(413).end();
      req.destroy();
    }
  });
  req.on("end", async () => {
    try {
      const out = await handlePayload(JSON.parse(body));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (err) {
      console.error("[shim] error:", err.message);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: `shim: ${err.message}` },
        })
      );
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[shim] listening on :${PORT}, forwarding to ${UPSTREAM}`);
  getNetVersion().catch((e) =>
    console.error("[shim] could not prefetch net_version:", e.message)
  );
});
