import { LENDING_DOCS } from "./lending.js";

/**
 * corpus.js — K8T's grounded knowledge base.
 *
 * Every answer K8T gives is retrieved from this file. Nothing here is invented
 * at runtime: if a claim is not in the corpus, K8T says so rather than filling
 * the gap from model prior. Edit this file to change what K8T knows.
 *
 * Entry shape:
 *   id     stable slug, used in citations and in /api/corpus/:id
 *   title  human label
 *   kind   draft | site | concept | bio
 *   url    canonical source (Datatracker, live instrument, etc.)
 *   tags   extra retrieval surface (aliases, codenames, acronyms)
 *   text   the actual grounding text
 */

const SUITE = [
  {
    id: "mws",
    title: "Machine-Web Symbiosis (draft-reilly-mws-00)",
    kind: "draft",
    url: "https://datatracker.ietf.org/doc/draft-reilly-mws/",
    tags: ["MWS", "symbiosis", "Licklider", "man-computer symbiosis", "agentic web"],
    text: `Machine-Web Symbiosis (MWS) is the framework draft that extends J.C.R. Licklider's 1960 "Man-Computer Symbiosis" to the web as it is actually consumed today: by autonomous agents at least as much as by people. The premise is that a web page and its machine-readable twin should not be two different artifacts maintained at two different levels of care. A symbiotic surface publishes the same substance on both channels at the same URL, discloses how the machine channel was assembled, and lets either party verify the other's view. K8T is a reference instrument for MWS: every response streams to a human channel and a machine channel simultaneously, and the machine channel is a first-class deliverable rather than a scraped afterthought.`
  },
  {
    id: "cogsov",
    title: "Cognitive Sovereignty (draft-reilly-cogsov-00)",
    kind: "draft",
    url: "https://www.ietf.org/archive/id/draft-reilly-cogsov-00.txt",
    tags: ["CogSov", "CDR", "Curation Disclosure Record", "Sovereignty Fallback", "epistemic autonomy"],
    text: `Cognitive Sovereignty defines how a human retains epistemic autonomy over content that an agent has curated on their behalf. Its two core mechanisms are the Curation Disclosure Record (CDR), which states what an agent selected, what it withheld, and on what basis, and the Sovereignty Fallback, which is the reader's ability to reach the unfiltered underlying source at any point. The draft was submitted to the IETF Datatracker on July 18, 2026. K8T implements both: it emits a CDR for every turn (retrieved set, withheld set with scores, tools invoked, model, groundedness) and every citation resolves to the underlying corpus entry and its canonical URL.`
  },
  {
    id: "rem-protocol",
    title: "REM Protocol (draft-reilly-rem-protocol-02) - codename ALICE",
    kind: "draft",
    url: "https://datatracker.ietf.org/doc/draft-reilly-rem-protocol/",
    tags: ["REM", "ALICE", "prior art", "35 USC 102", "defensive publication", "REMID"],
    text: `REM Protocol is the origin draft of the suite, first submitted as draft-reilly-rem-protocol-00 in September 2025. It establishes Dual-Layer Digital Permanence: an external timestamp layer (Bitcoin via OpenTimestamps) paired with an archival deposit layer (DOI via Zenodo), so a record's existence and its content are provable independently. Revision -02 documents the protocol's function as a prior art record system under 35 U.S.C. 102(a)(1), adding a defensive publication mode and the Full versus Partial REM Record distinction. The live system runs at remweb4.org with a multi-agent autonomous pipeline. REM Protocol is common law trademarked.`
  },
  {
    id: "dual-layer",
    title: "Dual-Layer Digital Permanence",
    kind: "concept",
    url: "https://remweb4.org",
    tags: ["permanence", "OpenTimestamps", "Zenodo", "DOI", "IPFS", "anchoring"],
    text: `Dual-Layer Digital Permanence is the methodology applied consistently across the suite. Layer one is an external, adversarially expensive timestamp - Bitcoin block inclusion via OpenTimestamps - which proves a hash existed before a point in time without trusting the publisher. Layer two is archival deposit - Zenodo DOI, IPFS, IETF submission - which proves what the hash was over and keeps the artifact retrievable. Neither layer alone is sufficient: a timestamp without an archive proves existence of nothing readable, and an archive without a timestamp proves content without a date. The correct term is Dual-Layer Digital Permanence, not Dual-Layer Permanence.`
  },
  {
    id: "hdrp",
    title: "Hypercube Data Rotation Protocol (draft-reilly-hdrp-00) - Project Rubik's Cube",
    kind: "draft",
    url: "https://datatracker.ietf.org/doc/draft-reilly-hdrp/",
    tags: ["HDRP", "Rubik's Cube", "moving target defense", "shards", "hypercube", "epochs"],
    text: `HDRP defines a hypercube shard topology with rotation-based moving target defense: data shards are placed on the vertices of a hypercube and rotated on an epoch schedule, so an attacker's map of where data lives expires faster than they can exploit it. Each epoch is committed to a hash-linked chain, making rotation history verifiable rather than asserted. The live instrument has committed and chain-verified thousands of epochs continuously. Zenodo record: https://zenodo.org/records/21501410. REM-verified at REMID:2026.0723/ee786ae7.`
  },
  {
    id: "cbpi",
    title: "Cognitive Behavioral Provenance and Integrity (draft-reilly-cbpi-00)",
    kind: "draft",
    url: "https://datatracker.ietf.org/doc/draft-reilly-cbpi/",
    tags: ["CBPI", "operant conditioning", "behavioral drift", "RER", "FBA", "agent integrity"],
    text: `CBPI applies operant conditioning and applied behavior analysis to autonomous AI agents. Its primitives are the Reinforcement Event Record (what reinforced the agent and when), the Operant Provenance Chain (the hash-linked history of those events), the Conditioning Authority (who is permitted to reinforce), the Behavioral Drift Index (a measured divergence from baseline behavior), and Functional Behavior Assessment applied to agent misbehavior. The argument is that agent alignment claims are unauditable unless the reinforcement history itself is a provenance artifact. Live reference instrument: cbpi-web4-production.up.railway.app.`
  },
  {
    id: "multilarity",
    title: "The Multilarity (draft-reilly-multilarity-00)",
    kind: "draft",
    url: "https://datatracker.ietf.org/doc/draft-reilly-multilarity/",
    tags: ["Multilarity", "singularity", "MI", "CCR", "convergence", "plural intelligence"],
    text: `The Multilarity is the counter-thesis to the technological Singularity: superhuman aggregate capability with an irreducibly plural locus of intelligence rather than convergence to one. It defines five Multilarity Conditions (MC-1 plural loci through MC-5 negotiated interfaces), measurable indicators including the Cross-Correlation Ratio, Locus Diversity, Divergent Hypothesis Load, Autonomy Reserve and a composite Multilarity Index, the Multilarity Attestation Record, and a catalogue of convergence pathologies. The live instrument runs an eight-agent pipeline (seven measuring, one sentinel remediating) and has run tens of thousands of epochs, including a run where the reference ecology fully converged - the failure mode the draft predicts.`
  },
  {
    id: "vsr",
    title: "Verifiable Safeguards Records (draft-reilly-vsr-00)",
    kind: "draft",
    url: "https://datatracker.ietf.org/doc/draft-reilly-vsr/",
    tags: ["VSR", "SCITT", "nuclear", "safeguards", "IAEA", "selective disclosure", "COSE"],
    text: `VSR targets the SCITT working group and applies commitment-based transparency to nuclear material accountancy. A Safeguards Attestation Record is a COSE_Sign1 over a salted per-field Merkle root, which allows selective disclosure: an inspector can be shown one field without the operator revealing the rest. It adds transit-matching reconciliation and discrepancy records, dual-layer anchoring for century-scale repository horizons, hash-migration bridging records for when SHA-256 stops being adequate, and a normative non-proliferation section. It cites the SLAFKA and SLUMBAT prototypes as prior art. Author organization on the draft: REM Technologies & Consulting, LLC.`
  },
  {
    id: "bulk-subtree",
    title: "Bulk Subtree Proofs (draft-reilly-plants-bulk-subtree-proofs-01)",
    kind: "draft",
    url: "https://github.com/lawrencejohnreilly-creator/bulk-subtree-proofs",
    tags: ["PLANTS", "Merkle", "subtree", "consistency proof", "transparency log"],
    text: `A companion optimization to draft-ietf-plants-merkle-tree-certs, addressing the open item in that draft's Section 7.4 with a bulk subtree consistency proof. The -00 construction was found incorrect when implemented against a reference verifier; -01 corrects it by tiling the log with full subtrees at landmark breakpoints and verifying by descent. The repository holds a Python reference implementation, a browser verifier and test suites, and the verifier is deployed live. This one is worth citing in interviews for the right reason: the draft was revised because the implementation falsified it, which is the intended relationship between specification and running code.`
  },
  {
    id: "atlas",
    title: "Project Atlas",
    kind: "site",
    url: "https://project-atlas-production-297c.up.railway.app",
    tags: ["Atlas", "monitoring", "anchors", "constellation", "sentinel"],
    text: `Project Atlas is the CBPI backbone instrument: a nine-agent pipeline (resolver, reachability, integrity, provenance, Conditioning Authority, drift, FBA, sentinel, anchor) running live DNS, HTTPS and digest checks against the Web4 constellation and against eight external permanence anchors - the IETF archive and Datatracker, the FUNET mirror, Zenodo, two IPFS gateways, an OpenTimestamps calendar and GitHub. Anchors carry expect semantics of live, dynamic or immutable, and an immutability violation is forced to operator review even when the instrument is running in autonomous mode. It has held all sixteen checks green in production.`
  },
  {
    id: "orion",
    title: "Project Orion and Project Looking Glass",
    kind: "site",
    url: "https://project-orion-production.up.railway.app",
    tags: ["Orion", "Looking Glass", "unified site", "suite index", "verification layers"],
    text: `Project Orion is the unified surface over the whole draft suite, with autonomous agents on both backend and frontend, verifying each draft against three independent sources: the IETF archive, the FUNET mirror and the OTEnet mirror in Greece. Project Looking Glass (draft-reilly-looking-glass-00) is the integrative draft that unifies the suite with the live self-healing site, laid out as a seven-phase implementation. Together they answer the question an evaluator actually asks about a large draft suite: does any of it run, and can I check that myself.`
  },
  {
    id: "permanence-mesh",
    title: "Permanence Mesh (remweb4.org/mesh)",
    kind: "site",
    url: "https://remweb4.org/mesh",
    tags: ["mesh", "Wayback", "Memento", "Software Heritage", "Arquivo.pt", "Common Crawl", "ALICE"],
    text: `The Permanence Mesh extends REM Protocol anchoring across keyless archival layers that require no API keys: Wayback Machine, Memento aggregation, Arquivo.pt, Common Crawl and Software Heritage, alongside the Bitcoin and OpenTimestamps anchors. Agents fifteen through twenty operate it under the ALICE codename, reporting per-record mesh coverage. The design point is redundancy of custodians rather than redundancy of copies: five archives under one operator is one failure domain, five archives under five jurisdictions is five.`
  },
  {
    id: "sentinel",
    title: "Sentinel Loop (remweb4.org/sentinel)",
    kind: "site",
    url: "https://remweb4.org/sentinel",
    tags: ["sentinel", "self-healing", "remediation", "decision queue", "human oversight"],
    text: `The Sentinel Loop is the remediation half of every instrument in the constellation. Measuring agents raise findings; the sentinel proposes and applies remediations. In autonomous mode it acts and records; in human-oversight mode the remediation lands in a decision queue and waits for an operator. The same toggle appears in K8T: side-effecting tools are held for approval when oversight mode is on, and the held decision is visible in the machine channel rather than hidden in a log.`
  },
  {
    id: "webproof",
    title: "WebProof and PLPES",
    kind: "concept",
    url: "https://remweb4.org",
    tags: ["WebProof", "PLPE", "PLPES", "Protocol Layer Prompt Engineering", "compliance engine"],
    text: `WebProof is content provenance for web-delivered artifacts: a page carries a verifiable claim about what it was when it was published. PLPE - Protocol Layer Prompt Engineering - is the practice of encoding operating constraints at the protocol layer rather than in a prompt, so behavior survives model swaps; PLPES is its enforcement specification, with a production compliance engine and an autonomous compliance monitoring agent built against it. Both are coined terms in the suite, alongside Cognitive Sovereignty, Dual-Layer Digital Permanence, Machine-Web Symbiosis and EternaMark.`
  },
  {
    id: "aipref",
    title: "Verifiable Compliance Records for AI Usage Preferences (draft-reilly-aipref-compliance-00)",
    kind: "draft",
    url: "https://datatracker.ietf.org/doc/draft-reilly-aipref-compliance/",
    tags: ["AIPREF", "AI usage preferences", "AUCR", "robots", "crawler compliance"],
    text: `Targeted at the AIPREF working group, this draft defines the AI Usage Compliance Record as the missing evidence layer for AI usage preference expressions. Preference vocabularies tell a crawler what it may do; nothing tells the publisher what the crawler actually did. The AUCR is a verifiable record of observed compliance, using the bulk subtree proof construction for efficient audit over large logs. It is the enforcement complement to the disclosure work in Cognitive Sovereignty.`
  },
  {
    id: "pegasus",
    title: "Project Pegasus",
    kind: "site",
    url: "https://project-pegasus-demo-production.up.railway.app",
    tags: ["Pegasus", "missile defense", "C2", "battle management", "human on the loop", "DoD"],
    text: `Project Pegasus is a missile-defense-oriented concept demo framed around integrated command and control and battle management, under an explicit authority model of fully autonomous with human oversight. It draws three suite components together: HDRP rotation for C2 mesh resilience, WebProof and Curation Disclosure Records for track provenance, and Cognitive Sovereignty for human-on-the-loop decision authority. It is a concept demonstrator, not a fielded system.`
  },
  {
    id: "suite",
    title: "The Reilly Protocol Suite",
    kind: "concept",
    url: "https://datatracker.ietf.org/person/lawrencejohnreilly@gmail.com",
    tags: ["suite", "IETF", "internet-drafts", "layers", "count"],
    text: `The suite is an independently authored body of IETF Internet-Drafts spanning twenty-five active documents as of August 2026, across five protocol layers, from permanence and prior art records at the base through transparency logs, agent integrity, sovereignty and application-layer instruments. Its distinguishing property is that most drafts have a running reference instrument deployed publicly, and several have been revised because the instrument contradicted the specification. Work began with draft-reilly-rem-protocol-00 in September 2025.`
  },
  {
    id: "author",
    title: "About the author",
    kind: "bio",
    url: "https://www.linkedin.com/in/lawrence-reilly-—-creator-of-web4-the-quantum-ai-internet-5bb80412b",
    tags: ["Larry", "Reilly", "bio", "background", "contact", "hire", "resume"],
    text: `Lawrence John Reilly Jr. is a Web4 computer scientist working in the Tampa Bay area. He is an independent protocol author with an active suite of IETF Internet-Drafts, an IT technician for the Tampa Bay Rays, and Web and Technology Co-Chair for the NDIA Greater Tampa Bay Chapter. He is a U.S. Army Signal Corps veteran with a B.A. in Forensic Psychology and a Counter-Terrorism minor from John Jay College, holds an IBM Quantum Computing certification and CompTIA Security+, and operates REM Technologies & Consulting, LLC. He is speaking at the Google Transparency.dev Summit, September 29 to October 1, 2026, on Dual-Layer Digital Permanence. Contact: lawrencejohnreilly@gmail.com.`
  },
  {
    id: "k8t",
    title: "K8T (Katie) - what this instrument is",
    kind: "site",
    url: "/",
    tags: ["K8T", "Katie", "this site", "how it works", "architecture", "stack"],
    text: `K8T, spoken as Katie, is a conversational agent over the Reilly Protocol Suite and a reference implementation of Machine-Web Symbiosis. Architecture: a zero-dependency Node service, a BM25 retriever over a hand-curated corpus, a streaming tool-use loop against the Anthropic Messages API, and a hash-linked Curation Disclosure Record chain. Every turn produces a CDR listing what was retrieved, what was withheld and why, which tools ran, and a groundedness score; the chain is verifiable at /api/chain/verify. The same content is served to agents at /.well-known/mws.json, /llms.txt and via Accept: application/json on any route. Without an API key the service still answers in grounded mode, returning retrieved corpus passages with no model narration.`
  }
];

export const CORPUS = [...SUITE, ...LENDING_DOCS];

export const byId = (id) => CORPUS.find((d) => d.id === id) || null;
