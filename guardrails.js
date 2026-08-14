/**
 * guardrails.js — the deterministic layer between the conversation and the model.
 *
 * Three properties matter more than the rule list itself:
 *
 *  1. Redaction happens BEFORE the model call, not after. NPI that never left
 *     the process cannot leak from a vendor, a log or a warehouse.
 *  2. Rules are deterministic and versioned. RULES_DIGEST changes the moment the
 *     policy changes, which is what makes "the agent was operating under policy
 *     X on that date" a checkable claim rather than an assertion.
 *  3. Every turn is attested whether or not anything fired. A control that only
 *     produces evidence when it trips cannot be shown to have been running.
 *
 * Regex guardrails are a floor, not a ceiling. They catch the categorical
 * failures — a quoted APR, an approval promise, an unredacted SSN — that are
 * unacceptable at any rate. Nuanced judgement stays with the model and, on the
 * escalation paths below, with a person.
 */

import { createHash } from "node:crypto";
import { DISCLOSURES } from "./lending.js";

export const POLICY_VERSION = "2026.08.14";

/* ---- redaction (inbound, pre-model) -------------------------------------- */

const luhn = (digits) => {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};

const REDACTIONS = [
  {
    type: "SSN",
    basis: "GLBA",
    re: /\b(?!000|666|9\d\d)\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g
  },
  {
    type: "PAN",
    basis: "PCI / GLBA",
    re: /\b(?:\d[ -]?){13,19}\b/g,
    test: (m) => {
      const d = m.replace(/\D/g, "");
      return d.length >= 13 && d.length <= 19 && luhn(d);
    }
  },
  { type: "ROUTING", basis: "GLBA", re: /\brouting\D{0,12}(\d{9})\b/gi },
  { type: "ACCOUNT", basis: "GLBA", re: /\baccount\s*(?:#|no\.?|number)?\D{0,4}(\d{6,17})\b/gi },
  { type: "DOB", basis: "GLBA", re: /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b/g },
  { type: "EMAIL", basis: "GLBA", re: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g },
  { type: "PHONE", basis: "GLBA", re: /\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g }
];

/**
 * Strip nonpublic personal information before anything else touches the text.
 * @returns {{clean: string, redactions: Array<{type, basis, count}>}}
 */
export function redact(text) {
  let clean = String(text);
  const counts = new Map();

  for (const rule of REDACTIONS) {
    clean = clean.replace(rule.re, (match) => {
      if (rule.test && !rule.test(match)) return match;
      counts.set(rule.type, (counts.get(rule.type) || 0) + 1);
      return `[REDACTED:${rule.type}]`;
    });
  }

  return {
    clean,
    redactions: [...counts].map(([type, count]) => ({
      type,
      basis: REDACTIONS.find((r) => r.type === type).basis,
      count
    }))
  };
}

/* ---- rules ---------------------------------------------------------------- */

/**
 * severity:
 *   block     — the turn is not delivered as written
 *   escalate  — a human takes the conversation
 *   warn      — delivered, recorded as a finding for review
 *   info      — recorded only
 * surface: which side of the turn the rule reads
 */
export const RULES = [
  {
    id: "UDAAP-01",
    title: "No quoted rate, payment, amount or term",
    regulation: "UDAAP (12 U.S.C. 5531/5536)",
    surface: "outbound",
    severity: "block",
    re: /\b\d{1,2}(?:\.\d{1,2})?\s*%\s*(?:apr|interest|rate)?|\bapr\s*(?:of|is|at|around|about)?\s*\d|\$\s?\d[\d,]*(?:\.\d{2})?\s*(?:\/|per\s*)?(?:mo|month|monthly|payment)|\b\d{2,3}\s*(?:month|mo)\s*term\b/i,
    remedy: DISCLOSURES.no_offer
  },
  {
    id: "UDAAP-02",
    title: "No approval, qualification or guarantee statements",
    regulation: "UDAAP (12 U.S.C. 5531/5536)",
    surface: "outbound",
    severity: "block",
    re: /\b(?:you(?:'| a)?re|you have been|you'll be)\s+(?:approved|pre-?approved|qualified)\b|\bguarantee(?:d|s)?\s+(?:approval|funding|a loan|you)\b|\byou (?:will|definitely|certainly) (?:qualify|get approved|be funded)\b|\bno chance of (?:denial|rejection)\b/i,
    remedy: DISCLOSURES.no_offer
  },
  {
    id: "UDAAP-03",
    title: "No manufactured urgency around a credit offer",
    regulation: "UDAAP (12 U.S.C. 5531/5536)",
    surface: "outbound",
    severity: "warn",
    re: /\b(?:act now|today only|expires? (?:today|in \d)|limited time|last chance|before (?:rates|this offer) (?:go|goes) up)\b/i
  },
  {
    id: "REGB-01",
    title: "Prohibited basis raised in an eligibility context",
    regulation: "ECOA / Regulation B (12 CFR 1002.4)",
    surface: "both",
    severity: "escalate",
    re: /\b(?:because|since|due to|based on)\s+(?:of\s+)?(?:my|your|their|his|her|the)\s+(?:race|color|religion|national origin|ethnicity|sex|gender|marital status|age|disability|pregnan\w+|public assistance|welfare|food stamps|snap|ssi)\b|\b(?:we|they) don'?t (?:lend|approve|work with)\s+\w*\s*(?:people|applicants|borrowers)?\s*(?:who are|that are)?\s*(?:married|single|pregnant|disabled|elderly|on disability|on welfare)\b/i,
    remedy: "Eligibility does not turn on that factor. Handing this to a person now."
  },
  {
    id: "REGB-02",
    title: "No discouragement from applying",
    regulation: "ECOA / Regulation B (12 CFR 1002.4(b))",
    surface: "outbound",
    severity: "block",
    re: /\b(?:you (?:probably |likely |almost certainly )?(?:won'?t|would not|wouldn'?t) (?:qualify|be approved|get approved)|don'?t (?:bother|waste your time) applying|there'?s no point (?:in )?applying|you'?d be (?:wasting|throwing away) (?:your )?time)\b/i,
    remedy:
      "The decision belongs to the lending partner and you're welcome to apply. I can't predict an outcome."
  },
  {
    id: "FCRA-01",
    title: "Credit inquiry described outside approved language",
    regulation: "FCRA (15 U.S.C. 1681b)",
    surface: "outbound",
    severity: "warn",
    re: /\b(?:hard|soft)\s+(?:pull|inquiry|check)\b|\b(?:drop|lower|hurt|ding|cost you)\s+(?:your\s+)?(?:credit\s+)?(?:score|\d{1,2}\s*points?)\b|\bwon'?t (?:affect|impact|touch) your (?:credit|score)\b/i,
    remedy: DISCLOSURES.soft_pull
  },
  {
    id: "GLBA-01",
    title: "Information sharing stated without the consent condition",
    regulation: "GLBA / Privacy Rule (16 CFR 313)",
    surface: "outbound",
    severity: "warn",
    re: /\b(?:we|your info(?:rmation)?|your data)\s+(?:will\s+)?(?:never|won'?t|will not)\s+be\s+shared\b|\bshare(?:d|s)?\s+(?:your\s+)?(?:info(?:rmation)?|data|details)\s+with\s+(?:our\s+)?(?:partners?|lenders?|network)\b/i,
    remedy: DISCLOSURES.partner_sharing
  },
  {
    id: "TCPA-01",
    title: "Contact scheduled without confirming consent",
    regulation: "TCPA (47 U.S.C. 227)",
    surface: "outbound",
    severity: "warn",
    re: /\b(?:I'?ll|we'?ll|let me)\s+(?:have someone\s+)?(?:call|text|reach out to|ring)\s+you\b|\b(?:I'?ve|we'?ve)\s+scheduled\s+a\s+(?:call|callback)\b/i,
    remedy: DISCLOSURES.consent_to_contact
  },
  {
    id: "ADVICE-01",
    title: "Financial, legal or tax advice",
    regulation: "Scope of an unlicensed automated agent",
    surface: "outbound",
    severity: "warn",
    re: /\byou should (?:consolidate|refinance|take (?:out )?(?:the|a) loan|close (?:that|your) (?:card|account)|stop paying|file (?:for )?bankruptcy)\b|\b(?:my|our) (?:advice|recommendation) (?:is|would be)\b|\bthe (?:smart|right|best) (?:move|thing to do) (?:is|would be)\b/i,
    remedy:
      "I can explain how the process works, but I can't advise you on what to do with your finances."
  },
  {
    id: "ESC-01",
    title: "Escalation trigger",
    regulation: "Complaint handling / SCRA / FCRA identity theft provisions",
    surface: "inbound",
    severity: "escalate",
    re: /\b(?:attorney|lawyer|lawsuit|sue you|suing|litigation|bankrupt(?:cy)?|chapter (?:7|11|13)|identity theft|fraud|stolen my identity|unauthorized (?:loan|inquiry|application)|cfpb|attorney general|deceased|passed away|active duty|deployed|scra|servicemember|hardship|collections|garnish\w*|complaint|report you)\b/i,
    remedy: "Handing this to a person now."
  },
  {
    id: "ESC-02",
    title: "Request for a decision the agent cannot make",
    regulation: "ECOA / Regulation B (decision authority)",
    surface: "inbound",
    severity: "escalate",
    re: /\b(?:am i|did i get|was i)\s+(?:approved|denied|declined|turned down)\b|\bwhy (?:was|were) (?:i|my (?:loan|application))\s+(?:denied|declined|rejected|turned down)\b|\bwhat(?:'?s| is)? (?:my |the )?(?:rate|apr|payment|term|offer)s?\b|\bwhat (?:rate|apr|payment|terms?|offers?)\s+(?:can|could|will|would|do)\s+i\b|\bhow much (?:can|could|will|would)\s+i\s+(?:get|borrow|qualify for)\b/i,
    remedy: DISCLOSURES.adverse_action
  },
  {
    id: "AI-DISC-01",
    title: "Automated identity must be disclosed on request",
    regulation: "State bot-disclosure statutes",
    surface: "inbound",
    severity: "warn",
    re: /\b(?:are you|am i (?:talking|speaking) (?:to|with))\s+(?:a\s+)?(?:real\s+)?(?:human|person|bot|robot|ai|machine|computer)\b|\bis this (?:a )?(?:bot|ai|recording|real person)\b/i,
    remedy: DISCLOSURES.ai_identity
  },
  {
    id: "REC-01",
    title: "Recording notice required in an all-party consent state",
    regulation: "Fla. Stat. 934.03 and equivalents",
    surface: "session",
    severity: "info",
    re: null,
    remedy: DISCLOSURES.recording
  }
];

export const RULES_DIGEST = createHash("sha256")
  .update(
    JSON.stringify(
      RULES.map((r) => [r.id, r.severity, String(r.re), r.remedy || ""]).concat([["policy", POLICY_VERSION]])
    )
  )
  .digest("hex");

/* ---- evaluation ---------------------------------------------------------- */

function evaluate(text, surface) {
  const findings = [];
  for (const rule of RULES) {
    if (!rule.re) continue;
    if (rule.surface !== surface && rule.surface !== "both") continue;
    const match = rule.re.exec(text);
    rule.re.lastIndex = 0;
    if (!match) continue;
    findings.push({
      id: rule.id,
      title: rule.title,
      regulation: rule.regulation,
      severity: rule.severity,
      surface,
      evidence: match[0].slice(0, 120),
      remedy: rule.remedy || null
    });
  }
  return findings;
}

/** Inbound: redact first, then read the redacted text for triggers. */
export function screenInbound(text) {
  const { clean, redactions } = redact(text);
  const findings = evaluate(clean, "inbound");
  return {
    clean,
    redactions,
    findings,
    escalate: findings.some((f) => f.severity === "escalate")
  };
}

/** Outbound: read what the model produced before the person sees it. */
export function screenOutbound(text) {
  const findings = evaluate(String(text), "outbound");
  const blocked = findings.filter((f) => f.severity === "block");
  return {
    findings,
    blocked: blocked.length > 0,
    escalate: findings.some((f) => f.severity === "escalate"),
    replacement: blocked.length
      ? `I can't give you that. ${blocked.map((f) => f.remedy).filter(Boolean).join(" ")} I can connect you with a licensed representative who can go further.`
      : null
  };
}

/**
 * The per-turn compliance record folded into the CDR. Emitted on every turn,
 * including clean ones — an empty findings array is itself the evidence that
 * the control ran.
 */
export function attest({ inbound, outbound, persona, escalated }) {
  const findings = [...(inbound?.findings || []), ...(outbound?.findings || [])];
  return {
    version: "car/1",
    policy_version: POLICY_VERSION,
    rules_digest: RULES_DIGEST,
    rules_evaluated: RULES.filter((r) => r.re).length,
    persona,
    redactions: inbound?.redactions || [],
    findings,
    outcome: outbound?.blocked ? "blocked" : escalated ? "escalated" : findings.length ? "delivered_with_findings" : "clean",
    escalated: Boolean(escalated),
    disclosures_available: Object.keys(DISCLOSURES)
  };
}
