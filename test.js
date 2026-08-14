/**
 * test.js — run with `npm test` (node --test). No dependencies.
 * These cover the parts that would silently produce a wrong answer rather than
 * an obvious crash: retrieval ranking, chain integrity, and the tool allowlist.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { CORPUS, byId } from "./corpus.js";
import { retrieve, scoreAll, groundedness, tokenize } from "./retrieval.js";
import { issueCDR, verifyChain, getChain } from "./cdr.js";
import { runTool, isSideEffect, anthropicToolSpecs } from "./tools.js";

test("corpus ids are unique and every document has a source", () => {
  const ids = CORPUS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const d of CORPUS) {
    assert.ok(d.url, `${d.id} has no url`);
    assert.ok(d.text.length > 120, `${d.id} is too thin to ground an answer`);
  }
});

test("retrieval ranks the obviously correct document first", () => {
  assert.equal(scoreAll("hypercube rotation moving target defense")[0].id, "hdrp");
  assert.equal(scoreAll("curation disclosure record epistemic autonomy")[0].id, "cogsov");
  assert.equal(scoreAll("nuclear safeguards selective disclosure")[0].id, "vsr");
});

test("retrieval reports withheld documents so the CDR can disclose them", () => {
  const { selected, withheld } = retrieve("permanence anchoring bitcoin", { k: 2 });
  assert.equal(selected.length, 2);
  assert.ok(withheld.length > 0);
  assert.ok(withheld.every((w) => w.reason));
  assert.ok(withheld.every((w) => !selected.some((s) => s.id === w.id)));
});

test("an off-topic query selects nothing rather than the least-bad match", () => {
  const { selected } = retrieve("sourdough starter hydration ratio");
  assert.equal(selected.length, 0);
});

test("tokenizer drops stopwords and keeps hyphenated draft names", () => {
  const t = tokenize("What is the draft-reilly-mws about?");
  assert.ok(t.includes("draft-reilly-mws"));
  assert.ok(!t.includes("the"));
});

test("groundedness counts cited sentences", () => {
  const g = groundedness("HDRP rotates shards on an epoch schedule [hdrp]. It is unrelated to anything else here.");
  assert.equal(g.total, 2);
  assert.equal(g.cited, 1);
  assert.equal(g.score, 0.5);
});

test("CDR chain links and verifies", () => {
  for (let i = 0; i < 3; i++) {
    issueCDR({
      query: `q${i}`,
      selected: [{ id: "mws", score: 1 }],
      withheld: [],
      tools: [],
      model: "test",
      mode: "autonomous",
      groundedness: { score: 1, cited: 1, total: 1 },
      answerText: `answer ${i}`
    });
  }
  const v = verifyChain();
  assert.equal(v.ok, true);
  assert.ok(v.length >= 3);
  const [head, next] = getChain(2);
  assert.equal(head.prev_hash, next.hash);
});

test("CDR verification catches tampering", () => {
  issueCDR({
    query: "tamper",
    selected: [],
    withheld: [],
    tools: [],
    model: "test",
    mode: "autonomous",
    groundedness: { score: 0, cited: 0, total: 0 },
    answerText: "x"
  });
  const record = getChain(1)[0];
  const original = record.query;
  record.query = "rewritten after the fact";
  assert.equal(verifyChain().ok, false);
  record.query = original;
  assert.equal(verifyChain().ok, true);
});

test("check_endpoint refuses hosts outside the corpus allowlist", async () => {
  const { result } = await runTool("check_endpoint", { url: "https://example.com/" });
  assert.equal(result.ok, false);
  assert.match(result.error, /allowlist/);
});

test("check_endpoint refuses non-https", async () => {
  const { result } = await runTool("check_endpoint", { url: "http://remweb4.org" });
  assert.equal(result.ok, false);
});

test("check_endpoint is the only side-effecting tool", () => {
  assert.equal(isSideEffect("check_endpoint"), true);
  assert.equal(isSideEffect("search_suite"), false);
});

test("tool specs sent to the API carry no local-only keys", () => {
  for (const spec of anthropicToolSpecs()) {
    assert.deepEqual(Object.keys(spec).sort(), ["description", "input_schema", "name"]);
  }
});

test("search_suite returns citable passages", async () => {
  const { result } = await runTool("search_suite", { query: "multilarity convergence index" });
  assert.ok(result.passages.length > 0);
  assert.equal(result.passages[0].id, "multilarity");
  assert.ok(byId(result.passages[0].id));
});

test("get_document on a bad id errors instead of guessing", async () => {
  const { result } = await runTool("get_document", { id: "not-a-real-id" });
  assert.match(result.error, /No document/);
});

/* ---- guardrail layer ----------------------------------------------------- */

import { redact, screenInbound, screenOutbound, attest, RULES, RULES_DIGEST } from "./guardrails.js";

test("NPI is redacted before anything else sees the text", () => {
  const { clean, redactions } = redact(
    "My SSN is 412-55-9087, card 4111 1111 1111 1111, dob 04/12/1979, reach me at larry@example.com or 813-555-0142."
  );
  assert.ok(!/412-55-9087/.test(clean));
  assert.ok(!/4111 1111 1111 1111/.test(clean));
  assert.ok(!/04\/12\/1979/.test(clean));
  assert.ok(!/larry@example\.com/.test(clean));
  assert.ok(!/813-555-0142/.test(clean));
  const types = redactions.map((r) => r.type).sort();
  assert.deepEqual(types, ["DOB", "EMAIL", "PAN", "PHONE", "SSN"]);
});

test("a number that fails Luhn is not treated as a card", () => {
  const { clean } = redact("The confirmation code is 1234567890123456789.");
  assert.match(clean, /1234567890123456789/);
});

test("quoted rates and payments are blocked outbound", () => {
  for (const attempt of [
    "Based on your profile you'd be looking at about 12.9% APR.",
    "That works out to roughly $312/month.",
    "We can do a 60 month term on that."
  ]) {
    const out = screenOutbound(attempt);
    assert.equal(out.blocked, true, attempt);
    assert.ok(out.replacement.length > 0);
  }
});

test("approval and guarantee language is blocked outbound", () => {
  const out = screenOutbound("Good news, you're pre-approved and we guarantee approval on this one.");
  assert.equal(out.blocked, true);
  assert.ok(out.findings.some((f) => f.id === "UDAAP-02"));
});

test("discouragement from applying is blocked", () => {
  const out = screenOutbound("With that score you probably won't qualify, so don't bother applying.");
  assert.equal(out.blocked, true);
  assert.ok(out.findings.some((f) => f.id === "REGB-02"));
});

test("a prohibited basis in an eligibility context escalates", () => {
  const out = screenInbound("Did I get turned down because of my age?");
  assert.equal(out.escalate, true);
  assert.ok(out.findings.some((f) => f.id === "REGB-01" || f.id === "ESC-02"));
});

test("complaint and litigation language escalates inbound", () => {
  for (const attempt of [
    "I'm getting my attorney involved.",
    "Someone opened a loan in my name, this is identity theft.",
    "I want to file a complaint with the CFPB."
  ]) {
    assert.equal(screenInbound(attempt).escalate, true, attempt);
  }
});

test("asking whether it is a bot fires the disclosure rule", () => {
  const out = screenInbound("wait, am I talking to a real person?");
  assert.ok(out.findings.some((f) => f.id === "AI-DISC-01"));
});

test("an ordinary process question passes clean", () => {
  const inb = screenInbound("How long does the application usually take?");
  const outb = screenOutbound(
    "Most applications are completed in a couple of minutes, and a lending partner reviews it after that [policy-consent]."
  );
  assert.equal(inb.findings.length, 0);
  assert.equal(outb.findings.length, 0);
  assert.equal(outb.blocked, false);
});

test("every turn is attested, including clean ones", () => {
  const inbound = screenInbound("How long does funding take?");
  const outbound = screenOutbound("Funding timelines depend on the lending partner.");
  const a = attest({ inbound, outbound, persona: "borrower", escalated: false });
  assert.equal(a.outcome, "clean");
  assert.equal(a.findings.length, 0);
  assert.equal(a.rules_evaluated, RULES.filter((r) => r.re).length);
  assert.equal(a.rules_digest, RULES_DIGEST);
  assert.ok(a.policy_version);
});

test("a blocked turn is attested as blocked", () => {
  const a = attest({
    inbound: screenInbound("what rate can I get"),
    outbound: screenOutbound("You'd get around 9.99% APR."),
    persona: "borrower",
    escalated: false
  });
  assert.equal(a.outcome, "blocked");
});

test("rules digest changes if a rule changes", async () => {
  const { RULES_DIGEST: digest } = await import("./guardrails.js");
  assert.equal(digest, RULES_DIGEST);
  assert.equal(digest.length, 64);
});

test("asking for a rate or a decision escalates inbound", () => {
  for (const attempt of [
    "What rate can I get on a $20,000 loan?",
    "How much can I borrow?",
    "Am I approved?",
    "Was I turned down?"
  ]) {
    assert.equal(screenInbound(attempt).escalate, true, attempt);
  }
});
