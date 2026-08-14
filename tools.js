/**
 * tools.js — the tools K8T may call, and the authority model over them.
 *
 * side_effect: true means the tool leaves the process — outbound network. Those
 * are the ones that get held in human-oversight mode, matching the Sentinel
 * Loop authority model used across the constellation.
 */

import { CORPUS, byId } from "./corpus.js";
import { retrieve, snippet } from "./retrieval.js";

export const TOOL_SPECS = [
  {
    name: "search_suite",
    description:
      "Search the grounded corpus of the Reilly Protocol Suite. Use this whenever the question touches a draft, a coined term, a live instrument, or the author's background. Returns ranked passages with ids to cite.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms, not a full sentence." },
        k: { type: "integer", description: "How many documents to return (1-6). Default 4." }
      },
      required: ["query"]
    }
  },
  {
    name: "get_document",
    description:
      "Fetch the complete text and canonical URL of one corpus document by id. Use when a search snippet is not enough to answer precisely.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "Corpus id, e.g. 'hdrp'." } },
      required: ["id"]
    }
  },
  {
    name: "list_documents",
    description:
      "List every corpus document with id, title and kind. Use for questions about scope, coverage, or what K8T knows.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "check_endpoint",
    description:
      "Check whether a live instrument in the Web4 constellation is currently reachable, returning HTTP status and latency. Only URLs already present in the corpus may be checked.",
    side_effect: true,
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "An https URL that appears in the corpus." } },
      required: ["url"]
    }
  }
];

/** Anthropic rejects unknown keys, so strip the local authority flag. */
export const anthropicToolSpecs = () =>
  TOOL_SPECS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

export const isSideEffect = (name) =>
  Boolean(TOOL_SPECS.find((t) => t.name === name)?.side_effect);

const allowedHosts = new Set(
  CORPUS.map((d) => {
    try {
      return new URL(d.url).host;
    } catch {
      return null;
    }
  }).filter(Boolean)
);

export async function checkEndpoint(url) {
  let target;
  try {
    target = new URL(url);
  } catch {
    return { ok: false, error: "Not a valid URL." };
  }
  if (target.protocol !== "https:") return { ok: false, error: "Only https is permitted." };
  if (!allowedHosts.has(target.host)) {
    return { ok: false, error: `Host ${target.host} is not in the corpus allowlist.` };
  }
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: { "user-agent": "K8T/1.0 (+machine-web-symbiosis reference instrument)" }
    });
    return {
      ok: res.ok,
      url: target.toString(),
      status: res.status,
      latency_ms: Date.now() - started,
      checked_at: new Date().toISOString()
    };
  } catch (err) {
    return {
      ok: false,
      url: target.toString(),
      error: err.name === "AbortError" ? "timed out after 12s" : String(err.message || err),
      latency_ms: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute a tool. Returns { result, disclosure } where disclosure is the
 * summary shown in the machine channel and folded into the CDR.
 */
export async function runTool(name, input = {}) {
  if (name === "search_suite") {
    const k = Math.min(Math.max(Number(input.k) || 4, 1), 6);
    const { selected, withheld } = retrieve(String(input.query || ""), { k });
    const passages = selected.map((s) => {
      const doc = byId(s.id);
      return {
        id: doc.id,
        title: doc.title,
        url: doc.url,
        score: s.score,
        passage: snippet(doc, String(input.query || ""))
      };
    });
    return {
      result: passages.length
        ? { passages }
        : { passages: [], note: "No corpus document met the relevance floor. Say so plainly." },
      disclosure: { selected, withheld }
    };
  }

  if (name === "get_document") {
    const doc = byId(String(input.id || "").toLowerCase());
    if (!doc) return { result: { error: `No document with id '${input.id}'.` }, disclosure: {} };
    return { result: doc, disclosure: { selected: [{ id: doc.id, score: null, matched: ["direct fetch"] }] } };
  }

  if (name === "list_documents") {
    return {
      result: { count: CORPUS.length, documents: CORPUS.map(({ id, title, kind, url }) => ({ id, title, kind, url })) },
      disclosure: {}
    };
  }

  if (name === "check_endpoint") {
    const result = await checkEndpoint(String(input.url || ""));
    return { result, disclosure: {} };
  }

  return { result: { error: `Unknown tool '${name}'.` }, disclosure: {} };
}
