/**
 * cdr.js — Curation Disclosure Records and the chain they link into.
 *
 * Per draft-reilly-cogsov-00, a CDR states what an agent selected on the
 * reader's behalf, what it withheld, and on what basis. Here each turn produces
 * one CDR, hash-linked to the previous one, so the disclosure history itself
 * cannot be quietly rewritten. Storage is in-memory with a bounded ring — this
 * is an instrument, not an archive of record. Durable anchoring is REM
 * Protocol's job, and the anchor field is where a REMID belongs once minted.
 */

import { createHash, randomUUID } from "node:crypto";

const MAX_RECORDS = 500;
const GENESIS = "0".repeat(64);

const chain = [];
const queue = [];

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Deterministic serialization: key order must not depend on insertion order. */
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(",")}}`;
}

export function issueCDR({
  query,
  selected,
  withheld,
  tools,
  model,
  mode,
  persona = "suite",
  compliance = null,
  groundedness,
  answerText
}) {
  const prev_hash = chain.length ? chain[chain.length - 1].hash : GENESIS;
  const body = {
    version: "cdr/1",
    id: randomUUID(),
    seq: chain.length + 1,
    issued_at: new Date().toISOString(),
    query,
    curation: {
      retriever: "bm25/k=4",
      selected,
      withheld,
      selection_basis: "lexical relevance to the query over a fixed, human-curated corpus"
    },
    tools,
    generation: { model, mode, persona, groundedness },
    compliance,
    answer_digest: sha256(String(answerText || "")),
    sovereignty_fallback: {
      note: "Every cited id resolves to its full source text and canonical URL.",
      corpus: "/api/corpus",
      document: "/api/corpus/{id}"
    },
    anchor: null,
    prev_hash
  };
  const record = { ...body, hash: sha256(canonical(body)) };
  chain.push(record);
  if (chain.length > MAX_RECORDS) chain.splice(0, chain.length - MAX_RECORDS);
  return record;
}

export function getChain(limit = 25) {
  return chain.slice(-limit).reverse();
}

export function getCDR(id) {
  return chain.find((r) => r.id === id) || null;
}

export function verifyChain() {
  const checked = [];
  let ok = true;
  for (let i = 0; i < chain.length; i++) {
    const { hash, ...body } = chain[i];
    const recomputed = sha256(canonical(body));
    const expectedPrev = i === 0 ? chain[0].prev_hash : chain[i - 1].hash;
    const linkOk = body.prev_hash === expectedPrev;
    const hashOk = recomputed === hash;
    if (!linkOk || !hashOk) ok = false;
    checked.push({ seq: body.seq, hash_ok: hashOk, link_ok: linkOk });
  }
  return {
    ok,
    length: chain.length,
    head: chain.length ? chain[chain.length - 1].hash : GENESIS,
    checked: checked.slice(-25),
    verified_at: new Date().toISOString()
  };
}

/* ---- human-oversight decision queue -------------------------------------- */

export function enqueueDecision({ tool, input, reason }) {
  const item = {
    id: randomUUID().slice(0, 8),
    tool,
    input,
    reason,
    status: "awaiting_approval",
    created_at: new Date().toISOString(),
    result: null
  };
  queue.unshift(item);
  if (queue.length > 50) queue.pop();
  return item;
}

export const getQueue = () => queue;
export const findDecision = (id) => queue.find((q) => q.id === id) || null;

export function resolveDecision(id, status, result) {
  const item = findDecision(id);
  if (!item) return null;
  item.status = status;
  item.result = result;
  item.resolved_at = new Date().toISOString();
  return item;
}
