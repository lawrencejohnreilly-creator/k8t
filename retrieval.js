/**
 * retrieval.js — BM25 over the corpus. No dependencies, no embeddings service,
 * no vector database. At this corpus size lexical retrieval is both faster and
 * easier to audit, and auditability is the point: every score below is a number
 * a reader can reproduce.
 */

import { CORPUS } from "./corpus.js";

const K1 = 1.5;
const B = 0.75;

const STOP = new Set(
  "a an the of and or to in on for with is are was were be been it its this that these those what which who whom how why when where do does did can could should would will i you he she they we as at by from not no yes about into over under more most some any all your my our their".split(
    " "
  )
);

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\-.]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function docText(doc) {
  return `${doc.title} ${doc.tags.join(" ")} ${doc.tags.join(" ")} ${doc.text}`;
}

// Index is built once at module load. Corpus is static.
const INDEX = CORPUS.map((doc) => {
  const tokens = tokenize(docText(doc));
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return { id: doc.id, tf, len: tokens.length };
});

const AVG_LEN = INDEX.reduce((s, d) => s + d.len, 0) / INDEX.length;

const DF = new Map();
for (const d of INDEX) for (const t of d.tf.keys()) DF.set(t, (DF.get(t) || 0) + 1);

function idf(term) {
  const df = DF.get(term) || 0;
  return Math.log(1 + (INDEX.length - df + 0.5) / (df + 0.5));
}

/**
 * Score every document, return all of them sorted. The caller decides the cut
 * line — the documents below it are the "withheld" set in the CDR, which is
 * why nothing is discarded here.
 */
export function scoreAll(query) {
  const qTokens = [...new Set(tokenize(query))];
  return INDEX.map((d) => {
    let score = 0;
    const matched = [];
    for (const t of qTokens) {
      const f = d.tf.get(t);
      if (!f) continue;
      matched.push(t);
      score += idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / AVG_LEN)));
    }
    return { id: d.id, score: Number(score.toFixed(4)), matched };
  }).sort((a, b) => b.score - a.score);
}

/**
 * @returns {{selected: Array, withheld: Array, query: string}}
 */
export function retrieve(query, { k = 4, floor = 0.6 } = {}) {
  const ranked = scoreAll(query);
  // Coverage guard: on a multi-word question, one incidental term in common is
  // not grounding. Without this, "sourdough hydration ratio" retrieves the
  // Multilarity draft because it contains the word "ratio".
  const qLen = new Set(tokenize(query)).size;
  const minMatched = qLen >= 3 ? 2 : 1;
  const hits = ranked.filter((r) => r.score >= floor && r.matched.length >= minMatched);
  const selected = hits.slice(0, k);
  const withheld = ranked
    .filter((r) => !selected.some((s) => s.id === r.id))
    .filter((r) => r.score > 0)
    .slice(0, 6)
    .map((r) => ({
      ...r,
      reason:
        r.matched.length < minMatched
          ? "insufficient term coverage"
          : r.score < floor
          ? "below relevance floor"
          : "outside top-k"
    }));
  return { query, selected, withheld };
}

/** Best-matching sentences from a document, for compact grounding blocks. */
export function snippet(doc, query, maxChars = 620) {
  const q = new Set(tokenize(query));
  const sentences = doc.text.split(/(?<=\.)\s+/);
  const ranked = sentences
    .map((s, i) => {
      const overlap = tokenize(s).filter((t) => q.has(t)).length;
      return { s, i, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap || a.i - b.i);

  const picked = [];
  let len = 0;
  for (const r of ranked) {
    if (len + r.s.length > maxChars && picked.length) break;
    picked.push(r);
    len += r.s.length;
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map((r) => r.s)
    .join(" ");
}

/** Groundedness: share of the answer's sentences that carry a [id] citation. */
export function groundedness(answer) {
  const sentences = String(answer)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
  if (!sentences.length) return { score: 0, cited: 0, total: 0 };
  const cited = sentences.filter((s) => /\[[a-z0-9-]+\]/i.test(s)).length;
  return {
    score: Number((cited / sentences.length).toFixed(2)),
    cited,
    total: sentences.length
  };
}
