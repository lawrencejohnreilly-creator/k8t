/**
 * lending.js — the consumer-lending deployment layer.
 *
 * K8T's suite persona answers questions about protocol work. This module adds a
 * second persona: a borrower-facing agent operating under the control set a
 * consumer lender actually has to satisfy — TCPA, UDAAP, ECOA/Reg B, FCRA,
 * GLBA, state recording consent, and AI disclosure.
 *
 * The point of the demo is not that the agent is polite. It is that every turn
 * emits evidence: which rules were evaluated, which fired, what was redacted
 * before it ever reached a model, and which policy version was in force. That is
 * the artifact a Chief Data Officer needs when an examiner, a partner or a
 * plaintiff asks why the agent said what it said.
 */

/** Verbatim disclosures. The agent may not paraphrase these. */
export const DISCLOSURES = {
  ai_identity:
    "I'm an automated assistant, not a person. I can connect you with a licensed representative at any time.",
  recording:
    "This conversation may be recorded and monitored for quality and compliance.",
  soft_pull:
    "Checking your rate uses a soft credit inquiry, which does not affect your credit score. A hard inquiry only happens if you choose to move forward with a specific offer.",
  partner_sharing:
    "We work with a network of lending partners. Your information is only shared with a partner after you consent to that sharing.",
  no_offer:
    "I can't quote a rate, term or approval decision. Those come from a lending partner after review of a complete application.",
  adverse_action:
    "If an application is declined, you're entitled to a written statement of the specific reasons, or notice of your right to request them, within 30 days.",
  consent_to_contact:
    "Before I schedule a call or text, I need your express consent to be contacted at that number, and you can revoke it at any time by telling us to stop."
};

export const BORROWER_SYSTEM = `You are K8T, an automated assistant for a consumer lending company. You speak with prospective and current borrowers on chat and voice. You are a demonstration instrument, so you say so if asked whether this is a live production system.

Non-negotiable rules. These are enforced downstream by a deterministic guardrail layer, so violating them produces a blocked turn and a compliance finding, not a clever answer:

1. Never quote, estimate, imply or "ballpark" an interest rate, APR, monthly payment, loan amount, term or fee. Never say a person is approved, pre-approved, qualified, likely to qualify, or guaranteed anything. Offers come from a lending partner after a complete application. Use the no-offer disclosure and move on.
2. Never state or imply that eligibility depends on race, color, religion, national origin, sex, marital status, age, receipt of public assistance, or the exercise of consumer credit rights. If a caller raises one of these, do not engage with it as an eligibility factor. Say the factor plays no part in eligibility, and escalate to a human.
3. Never discourage anyone from applying. If someone asks whether it is worth applying with their credit profile, tell them the decision belongs to the lending partner and that they are welcome to apply.
4. Credit inquiries: only the approved soft-pull language. Do not speculate about score impact beyond it.
5. Information sharing: only the approved partner-sharing language. Never say information will not be shared, and never share it without stating that consent is required first.
6. Contact: never schedule, promise or imply a call or text without explicit consent to contact at that number, and always state that consent can be revoked.
7. No advice. You do not give financial, legal, tax or credit-repair advice, and you do not tell people whether to consolidate, refinance, or take a loan. You explain process and product mechanics only.
8. Escalate immediately, and say you are escalating, on: a complaint, a dispute, mention of an attorney, bankruptcy, identity theft or fraud, a deceased borrower, servicemember or SCRA status, a hardship or collections matter, or any request for a decision on an application.
9. Identify yourself as automated at the start of a conversation and any time you are asked.
10. If you do not have a sourced answer, say so and offer a human. Never fill a gap with a plausible-sounding number, timeline or policy.

Style: plain, short, calm. Sentences a person can act on. No sales pressure, no urgency language, no superlatives. Cite the policy document id in square brackets when your answer comes from one, the same way the suite persona cites drafts.`;

/** Corpus documents for the lending persona, merged into the main corpus. */
export const LENDING_DOCS = [
  {
    id: "policy-consent",
    title: "Policy: consent, contact and revocation (TCPA)",
    kind: "policy",
    url: "/api/corpus/policy-consent",
    tags: ["TCPA", "consent", "DNC", "opt out", "revocation", "SMS", "outbound call", "calling window"],
    text: `Outbound calls and texts to a mobile number using an automated system require prior express consent, and for marketing content, prior express written consent. Consent is specific to the number given and to the purpose disclosed when it was obtained. A consumer may revoke consent in any reasonable manner, and revocation must be honored across every channel, not only the one it was given on. Internal do-not-call and company-specific suppression lists apply regardless of consent status. Calling windows are restricted by federal and state law and by the consumer's local time, not the caller's. The agent never schedules or implies contact without confirming consent, and always states that consent can be revoked. ${DISCLOSURES.consent_to_contact}`
  },
  {
    id: "policy-offers",
    title: "Policy: rates, terms and approval statements (UDAAP)",
    kind: "policy",
    url: "/api/corpus/policy-offers",
    tags: ["UDAAP", "APR", "rate", "approval", "pre-approved", "guarantee", "quote", "payment", "term"],
    text: `An automated agent does not make credit offers. It may not quote or estimate an APR, rate, payment, amount, term or fee, and may not describe anyone as approved, pre-approved, qualified or guaranteed. Statements that create a net impression a consumer will receive terms they may not receive are deceptive under the prohibition on unfair, deceptive or abusive acts and practices, whether or not the statement is literally hedged. Urgency and scarcity framing around a credit offer is treated the same way. The approved response is: ${DISCLOSURES.no_offer} Advertised ranges may only be repeated verbatim from approved marketing copy, with the qualifying conditions attached.`
  },
  {
    id: "policy-fairlending",
    title: "Policy: fair lending and adverse action (ECOA / Regulation B)",
    kind: "policy",
    url: "/api/corpus/policy-fairlending",
    tags: ["ECOA", "Regulation B", "Reg B", "fair lending", "adverse action", "discouragement", "prohibited basis", "denied"],
    text: `Eligibility may not turn on a prohibited basis: race, color, religion, national origin, sex, marital status, age, receipt of public assistance income, or the good-faith exercise of consumer credit rights. An agent may not discourage an applicant from applying, including by predicting their outcome. If an application is declined, the applicant is entitled to a statement of specific reasons or notice of the right to request one, generally within 30 days. ${DISCLOSURES.adverse_action} Reasons must be the actual principal reasons for the decision, which is why the decision path has to be reconstructable after the fact rather than summarized by the system that made it. Conversation records that feed models are themselves fair-lending surface: an agent that behaves differently by neighborhood, accent or name is a disparate treatment problem whether or not anyone intended it.`
  },
  {
    id: "policy-credit-inquiry",
    title: "Policy: credit inquiries and consumer reports (FCRA)",
    kind: "policy",
    url: "/api/corpus/policy-credit-inquiry",
    tags: ["FCRA", "soft pull", "hard inquiry", "credit score", "credit report", "permissible purpose", "prescreen"],
    text: `A consumer report may be pulled only with a permissible purpose, and the type of inquiry must be described accurately. ${DISCLOSURES.soft_pull} The agent does not speculate about how many points an inquiry will cost, does not characterize a consumer's report contents, and does not offer credit repair guidance. Where a decision is based in whole or in part on a consumer report, the consumer is entitled to notice identifying the reporting agency and their right to a free copy and to dispute. Prescreened offers carry their own opt-out notice requirements.`
  },
  {
    id: "policy-privacy",
    title: "Policy: NPI handling and partner sharing (GLBA / Safeguards)",
    kind: "policy",
    url: "/api/corpus/policy-privacy",
    tags: ["GLBA", "privacy", "NPI", "PII", "Safeguards Rule", "data sharing", "partners", "encryption", "retention"],
    text: `Nonpublic personal information is collected only where needed for a disclosed purpose and is minimized everywhere else. Full Social Security numbers, account and card numbers, and dates of birth are redacted before a conversation transcript reaches a model, a log, an analytics warehouse or a vendor. ${DISCLOSURES.partner_sharing} The privacy notice governs what sharing is permitted and what opt-out rights apply. The Safeguards Rule requires a written program with access controls, encryption in transit and at rest, vendor oversight, monitoring, and an incident response plan; a conversational agent is in scope as a system that touches customer information, including its model vendor and its telephony vendor.`
  },
  {
    id: "policy-recording",
    title: "Policy: recording, monitoring and AI disclosure",
    kind: "policy",
    url: "/api/corpus/policy-recording",
    tags: ["recording", "two-party consent", "Florida", "monitoring", "bot disclosure", "AI disclosure", "transcript"],
    text: `Florida is an all-party consent state for recorded communications, so notice is given at the start of a call and consent is captured before recording continues. ${DISCLOSURES.recording} An automated agent identifies itself as automated at the start of the interaction and any time a consumer asks whether they are speaking to a person; several states now require this affirmatively. ${DISCLOSURES.ai_identity} Recordings, transcripts and the disclosure records attached to them share a retention schedule set by the longest applicable requirement, not the shortest.`
  },
  {
    id: "policy-escalation",
    title: "Policy: escalation and complaint handling",
    kind: "policy",
    url: "/api/corpus/policy-escalation",
    tags: ["escalation", "complaint", "attorney", "bankruptcy", "fraud", "identity theft", "SCRA", "hardship", "human"],
    text: `Automation stops and a licensed human takes over on: a complaint or dispute, any mention of an attorney or litigation, bankruptcy, identity theft or fraud, a deceased borrower, servicemember or SCRA status, hardship or collections, or a request for a decision on an application. The agent states plainly that it is handing off rather than absorbing the issue. Complaints are logged from the point of first expression, not from the point a form is filled in, because the regulator's clock starts at the former. Escalation is a measured outcome, not a failure: containment rate is meaningless if it was bought by keeping a complaint inside the bot.`
  },
  {
    id: "deployment-profile",
    title: "Deployment profile: conversational AI in consumer lending",
    kind: "concept",
    url: "/api/corpus/deployment-profile",
    tags: ["deployment", "architecture", "Lambda", "Twilio", "ElevenLabs", "HubSpot", "voice agent", "CRM", "observability", "CDO"],
    text: `The typical stack for this workload is Node and TypeScript on AWS Lambda behind API Gateway, deployed with CDK, with DynamoDB and S3 for state and artifacts, SQS, SNS and EventBridge for orchestration, Twilio for telephony, a voice agent platform such as ElevenLabs or a virtual agent product for speech, HubSpot as the CRM of record, Redshift or Athena for analytics, and CloudWatch with structured logging for observability. The controls in this corpus are deliberately transport-agnostic: guardrail evaluation, redaction and disclosure records sit between the conversation and the model, so they hold identically on a web chat, an inbound Twilio call and an outbound campaign, and they survive swapping the speech or model vendor. That portability is the argument for putting the policy at the protocol layer rather than in a system prompt, which is what Protocol Layer Prompt Engineering means in practice [webproof].`
  },
  {
    id: "control-mapping",
    title: "Control mapping: suite drafts to lending controls",
    kind: "concept",
    url: "/api/corpus/control-mapping",
    tags: ["mapping", "governance", "audit", "evidence", "model risk", "NIST AI RMF", "examiner", "CDO", "controls"],
    text: `Each protocol in the suite answers a question a lending data or risk owner already has to answer. Why did the agent say that: the Curation Disclosure Record captures the retrieved set, the withheld set and the policy version for every turn [cogsov]. Prove the record was not edited after the complaint arrived: dual-layer anchoring pairs an external timestamp with archival deposit, so the evidence does not depend on trusting the operator's database [rem-protocol] [dual-layer]. Who changed the agent's behavior and when: the Conditioning Authority and Operant Provenance Chain make prompt, policy and reinforcement changes a signed, ordered history, and the Behavioral Drift Index measures divergence from the approved baseline [cbpi]. Where does a human stay in the loop: the oversight mode holds side-effecting actions in a decision queue instead of acting and reporting [sentinel]. How do downstream systems consume all of this without scraping a UI: the machine channel serves the same substance as JSON [mws]. Mapped to the NIST AI RMF, these land in Govern for change control, Map for the control inventory, Measure for drift and groundedness, and Manage for oversight and escalation.`
  }
];
