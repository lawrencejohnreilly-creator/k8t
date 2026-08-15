# K8T (Katie) — consumer lending governance prototype

Independent prototype by Lawrence John Reilly Jr. Not affiliated with,
commissioned by, or endorsed by Symple Lending. The lending policy corpus is
illustrative and is not approved compliance language.

A conversational agent with a governance layer, built on the Reilly Protocol
Suite and demonstrating **Machine-Web Symbiosis** ([draft-reilly-mws-00](https://datatracker.ietf.org/doc/draft-reilly-mws/)).

The claim MWS makes is that a web surface should serve people and agents from
the same substance, and disclose how the machine view was assembled. K8T
enforces that rather than describing it:

- Every route returns JSON under `Accept: application/json`.
- Every turn emits a **Curation Disclosure Record** ([draft-reilly-cogsov-00](https://www.ietf.org/archive/id/draft-reilly-cogsov-00.txt)) naming
  what was retrieved, what was withheld and why, which tools ran, and how many
  sentences of the answer carry a citation.
- CDRs are hash-linked into a chain that anyone can verify at `/api/chain/verify`.
- Side-effecting tools are held in a decision queue when human-oversight mode is
  on, matching the Sentinel Loop authority model used across the constellation.

Zero dependencies. One process. No build step.

---

## Run it

```bash
node --version          # 20 or newer
cp .env.example .env    # add ANTHROPIC_API_KEY
npm start               # http://localhost:8080
npm test                # 14 unit tests, no test framework installed
```

Without an API key the service still runs in **grounded mode**: it returns the
ranked corpus passages verbatim and still issues CDRs. A deploy that has not been
given a key is degraded, not broken.

## Two personas

**Suite** answers questions about the protocol work, streaming as it goes.

**Borrower** is a consumer-lending agent under the control set in `guardrails.js`.
Output is **buffered, not streamed**: it is screened before delivery, because you
cannot unsay a sentence a borrower has already read or heard. NPI is redacted
*before* the model call, so a Social Security number in a transcript never
reaches the model vendor, the logs or the warehouse.

Rules cover UDAAP (no quoted rate, payment, term, or approval language), ECOA and
Regulation B (prohibited basis, discouragement, adverse action), FCRA (inquiry
description), GLBA (NPI redaction, partner-sharing consent), TCPA (consent before
contact, revocation), all-party recording consent, and AI identity disclosure.
Every rule set is versioned and digested, so "the agent was operating under
policy 2026.08.14" is checkable rather than asserted. Full rule list, patterns
and remedies: `GET /api/guardrails`.

Every turn is attested, including clean ones. A control that only produces
evidence when it trips cannot be shown to have been running.

## Deploy: GitHub, then Railway

1. Create a repo and upload all 16 files **at the repo root**. The layout is flat
   on purpose so the files can be uploaded from a phone browser.
2. In Railway: New Project, Deploy from GitHub repo, pick the repo.
3. Variables: `ANTHROPIC_API_KEY`, optionally `K8T_MODEL`. Leave `PORT` alone,
   Railway sets it.
4. Settings, Networking, Generate Domain.

Railway's Nixpacks builder reads `package.json`, finds no dependencies to
install, and runs `npm start`.

## Architecture

| File | Role |
|---|---|
| `server.js` | HTTP, routing, SSE, rate limiting, content negotiation, static files |
| `agent.js` | Streaming tool-use loop against the Anthropic Messages API; grounded fallback |
| `retrieval.js` | BM25 with a term-coverage guard, snippet selection, groundedness scoring |
| `corpus.js` | The knowledge base. Edit this to change what K8T knows |
| `tools.js` | Tool schemas, executors, side-effect classification, host allowlist |
| `cdr.js` | Curation Disclosure Records, hash chain, oversight decision queue |
| `lending.js` | Borrower persona, approved disclosures, and the lending policy corpus |
| `guardrails.js` | Deterministic pre/post guardrail layer: NPI redaction, rule evaluation, compliance attestation |
| `index.html`, `styles.css`, `app.js` | Two-channel interface |
| `test.js` | Unit tests |

Retrieval is lexical, not vector-based. At this corpus size BM25 wins on latency
and, more to the point, every score in a CDR is a number a reader can reproduce
from the source text. An embedding score is not auditable by the person it is
being disclosed to.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/chat` | SSE stream (`retrieval`, `text`, `tool_use`, `tool_result`, `decision`, `cdr`, `done`). Send `Accept: application/json` for one complete document instead |
| `GET /api/corpus`, `/api/corpus/{id}` | Corpus index and full documents — the Sovereignty Fallback |
| `GET /api/search?q=` | Retrieval without generation |
| `GET /api/chain`, `/api/chain/verify` | Disclosure chain and its integrity check |
| `GET /api/cdr/{id}` | One record |
| `GET /api/guardrails` | Every rule, pattern, severity and remedy, plus the policy version and digest |
| `GET /api/queue`, `POST /api/queue/{id}/approve\|deny` | Human-oversight decisions |
| `GET /api/health` | Status, mode, corpus size, chain length |
| `GET /.well-known/mws.json`, `/llms.txt`, `/robots.txt` | Machine surfaces |

Rate limits are per IP, fixed window: 40 chat turns and 400 API calls per 10
minutes.

## Known limits

- The chain is in memory and bounded at 500 records. It proves nothing was
  altered within a process lifetime; it is not durable evidence. Durable
  anchoring is REM Protocol's job, and `anchor` is the field a REMID goes in.
- Rate limiting is per instance. Behind multiple replicas it undercounts.
- Retrieval is lexical, so a question that shares no vocabulary with the corpus
  retrieves nothing. That is the intended failure: K8T says it has no source
  rather than reaching for the nearest document.
- Regex guardrails are a floor, not a ceiling. They catch the categorical
  failures — a quoted APR, an approval promise, an unredacted SSN — that are
  unacceptable at any rate. Nuanced judgement stays with the model and, on the
  escalation paths, with a person. In production these would be paired with a
  classifier layer and a red-team suite, and the rule list would be owned by
  compliance rather than by an engineer.
- The lending policy corpus paraphrases regulatory obligations for a
  demonstration. It is not legal advice and is not a substitute for a compliance
  team's own approved language.
- The drafts are independent submissions, not adopted working group documents.
  The instruments are reference implementations, not fielded systems. K8T is
  instructed to say so, and that instruction is in `agent.js` where a reviewer
  can check it.

---

Lawrence John Reilly Jr. — REM Technologies & Consulting, LLC
