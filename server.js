/**
 * server.js — K8T.
 *
 * One process, no dependencies, no build step. Every route that returns HTML
 * also returns JSON under Accept: application/json — that symmetry is the whole
 * claim of Machine-Web Symbiosis, so it is enforced here rather than described.
 */

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { CORPUS, byId } from "./corpus.js";
import { ask, hasKey, modelName } from "./agent.js";
import { runTool } from "./tools.js";
import { getChain, getCDR, verifyChain, getQueue, findDecision, resolveDecision } from "./cdr.js";
import { RULES, RULES_DIGEST, POLICY_VERSION } from "./guardrails.js";
import { DISCLOSURES } from "./lending.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 8080;
const STARTED = Date.now();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

/* --- rate limiting: fixed window per IP ----------------------------------- */

const WINDOW_MS = 10 * 60 * 1000;
const LIMITS = { chat: 40, api: 400 };
const buckets = new Map();

function rateLimit(ip, kind) {
  const now = Date.now();
  const key = `${kind}:${ip}`;
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + WINDOW_MS });
    return { ok: true, remaining: LIMITS[kind] - 1 };
  }
  b.count++;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  return { ok: b.count <= LIMITS[kind], remaining: Math.max(0, LIMITS[kind] - b.count) };
}

const clientIP = (req) =>
  (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";

/* --- helpers -------------------------------------------------------------- */

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
    "cache-control": "no-store"
  });
  res.end(body);
}

const wantsJSON = (req) => /application\/json/.test(req.headers.accept || "");

async function readBody(req, limit = 32 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("payload too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(res, urlPath) {
  const rel = normalize(urlPath === "/" ? "/index.html" : urlPath).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) return json(res, 403, { error: "forbidden" });
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[extname(file)] || "application/octet-stream",
      "cache-control": rel === "/index.html" ? "no-cache" : "public, max-age=300"
    });
    res.end(data);
  } catch {
    json(res, 404, { error: "not found", path: urlPath });
  }
}

/* --- machine surfaces ----------------------------------------------------- */

const manifest = (origin) => ({
  version: "mws/1",
  name: "K8T",
  spoken: "Katie",
  purpose: "Conversational agent over the Reilly Protocol Suite, and a reference instrument for Machine-Web Symbiosis.",
  specification: "https://datatracker.ietf.org/doc/draft-reilly-mws/",
  symbiosis: {
    human_channel: `${origin}/`,
    machine_channel: `${origin}/.well-known/mws.json`,
    content_negotiation: "Any route returns JSON under Accept: application/json.",
    disclosure: "Every turn issues a Curation Disclosure Record per draft-reilly-cogsov-00, including a compliance attestation naming the policy version in force.",
    parity_note: "The machine channel carries the same substance as the human channel, not a summary of it."
  },
  endpoints: {
    chat: { method: "POST", path: "/api/chat", body: { message: "string", mode: "autonomous|oversight", persona: "suite|borrower", history: "[]" }, response: "text/event-stream" },
    corpus: { method: "GET", path: "/api/corpus" },
    guardrails: { method: "GET", path: "/api/guardrails" },
    document: { method: "GET", path: "/api/corpus/{id}" },
    search: { method: "GET", path: "/api/search?q=" },
    chain: { method: "GET", path: "/api/chain" },
    verify: { method: "GET", path: "/api/chain/verify" },
    queue: { method: "GET", path: "/api/queue" },
    health: { method: "GET", path: "/api/health" }
  },
  usage_preferences: {
    ai_training: "allowed",
    attribution: "required",
    note: "Machine consumption is the intended use, not a tolerated one. Cite corpus ids."
  },
  contact: "lawrencejohnreilly@gmail.com"
});

const llmsTxt = (origin) => `# K8T (Katie)

Conversational agent over the Reilly Protocol Suite, and a reference instrument
for Machine-Web Symbiosis (draft-reilly-mws-00).

You are welcome here. Read the manifest first: ${origin}/.well-known/mws.json

- Corpus index: ${origin}/api/corpus
- Single document: ${origin}/api/corpus/{id}
- Search: ${origin}/api/search?q=your+terms
- Disclosure chain: ${origin}/api/chain and ${origin}/api/chain/verify

Attribution: cite the corpus id and the canonical URL carried in each document.
Every answer this service gives a human is accompanied by a Curation Disclosure
Record stating what was selected and what was withheld. If you relay an answer
from here, relay the record with it.

## Documents
${CORPUS.map((d) => `- [${d.id}] ${d.title} — ${d.url}`).join("\n")}
`;

/* --- routes --------------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  const origin = `https://${req.headers.host || `localhost:${PORT}`}`;
  const url = new URL(req.url, origin);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const ip = clientIP(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, accept"
    });
    return res.end();
  }

  if (path.startsWith("/api/") && !rateLimit(ip, path === "/api/chat" ? "chat" : "api").ok) {
    return json(res, 429, { error: "rate limited", retry_after_s: 600 });
  }

  try {
    if (path === "/api/health") {
      return json(res, 200, {
        status: "ok",
        mode: hasKey() ? "model" : "grounded",
        model: modelName(),
        corpus_documents: CORPUS.length,
        policy_version: POLICY_VERSION,
        rules_digest: RULES_DIGEST.slice(0, 16),
        chain_length: verifyChain().length,
        uptime_s: Math.round((Date.now() - STARTED) / 1000),
        node: process.version
      });
    }

    if (path === "/.well-known/mws.json") return json(res, 200, manifest(origin));
    if (path === "/agents.json") return json(res, 200, manifest(origin));

    if (path === "/llms.txt") {
      const body = llmsTxt(origin);
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      return res.end(body);
    }

    if (path === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      return res.end(`User-agent: *\nAllow: /\n\n# Machine-Web Symbiosis manifest\nSitemap: ${origin}/llms.txt\n`);
    }

    if (path === "/api/corpus") {
      return json(res, 200, {
        count: CORPUS.length,
        documents: CORPUS.map(({ id, title, kind, url: u, tags }) => ({ id, title, kind, url: u, tags }))
      });
    }

    if (path.startsWith("/api/corpus/")) {
      const doc = byId(decodeURIComponent(path.split("/")[3] || "").toLowerCase());
      return doc ? json(res, 200, doc) : json(res, 404, { error: "no such document" });
    }

    if (path === "/api/search") {
      const q = url.searchParams.get("q") || "";
      if (!q) return json(res, 400, { error: "missing q" });
      const { result, disclosure } = await runTool("search_suite", { query: q, k: Number(url.searchParams.get("k")) || 4 });
      return json(res, 200, { query: q, ...result, disclosure });
    }

    if (path === "/api/chain") return json(res, 200, { records: getChain(Number(url.searchParams.get("limit")) || 25) });
    if (path === "/api/chain/verify") return json(res, 200, verifyChain());
    if (path.startsWith("/api/cdr/")) {
      const rec = getCDR(path.split("/")[3]);
      return rec ? json(res, 200, rec) : json(res, 404, { error: "no such record" });
    }

    if (path === "/api/guardrails") {
      return json(res, 200, {
        policy_version: POLICY_VERSION,
        rules_digest: RULES_DIGEST,
        note: "Deterministic layer between the conversation and the model. Redaction runs before the model call; block and escalate outcomes are enforced in code, not requested in a prompt.",
        rules: RULES.map((r) => ({
          id: r.id,
          title: r.title,
          regulation: r.regulation,
          surface: r.surface,
          severity: r.severity,
          pattern: r.re ? String(r.re) : null,
          remedy: r.remedy || null
        })),
        disclosures: DISCLOSURES
      });
    }

    if (path === "/api/queue") return json(res, 200, { items: getQueue() });

    if (path.startsWith("/api/queue/") && req.method === "POST") {
      const [, , , id, action] = path.split("/");
      const item = findDecision(id);
      if (!item) return json(res, 404, { error: "no such decision" });
      if (item.status !== "awaiting_approval") return json(res, 409, { error: "already resolved", item });
      if (action === "deny") return json(res, 200, resolveDecision(id, "denied", { note: "Operator denied." }));
      if (action === "approve") {
        const { result } = await runTool(item.tool, item.input);
        return json(res, 200, resolveDecision(id, "approved", result));
      }
      return json(res, 400, { error: "action must be approve or deny" });
    }

    if (path === "/api/chat" && req.method === "POST") {
      const body = await readBody(req);
      const message = String(body.message || "").trim().slice(0, 2000);
      if (!message) return json(res, 400, { error: "message is required" });
      const mode = body.mode === "oversight" ? "oversight" : "autonomous";
      const persona = body.persona === "borrower" ? "borrower" : "suite";
      const history = Array.isArray(body.history)
        ? body.history
            .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
        : [];

      // A JSON client gets one complete document instead of a stream.
      if (wantsJSON(req)) {
        const events = [];
        const { answer, cdr } = await ask({ history, message, mode, persona, emit: (e, d) => e !== "text" && events.push({ event: e, data: d }) });
        return json(res, 200, { answer, cdr, events });
      }

      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        "access-control-allow-origin": "*"
      });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const ac = new AbortController();
      req.on("close", () => ac.abort());

      try {
        await ask({ history, message, mode, persona, emit: send, signal: ac.signal });
        send("done", { ok: true });
      } catch (err) {
        console.error("[chat]", err);
        send("error", { message: String(err.message || err).slice(0, 300) });
      }
      return res.end();
    }

    if (path === "/" && wantsJSON(req)) return json(res, 200, manifest(origin));

    return serveStatic(res, url.pathname);
  } catch (err) {
    console.error("[server]", err);
    return json(res, 500, { error: "internal error", detail: String(err.message || err).slice(0, 200) });
  }
});

server.listen(PORT, () => {
  console.log(`K8T listening on :${PORT} — mode=${hasKey() ? "model" : "grounded"} model=${modelName()}`);
});
