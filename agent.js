/**
 * agent.js — K8T's reasoning loop.
 *
 * Streams from the Anthropic Messages API, executes tools between turns, and
 * emits typed events so the human channel and the machine channel can render
 * the same turn at the same time. If no API key is configured the loop degrades
 * to grounded mode: retrieved passages, verbatim, no narration. A deploy with
 * no key still answers and still issues CDRs.
 */

import { retrieve, snippet, groundedness } from "./retrieval.js";
import { byId } from "./corpus.js";
import { anthropicToolSpecs, runTool, isSideEffect } from "./tools.js";
import { issueCDR, enqueueDecision } from "./cdr.js";
import { screenInbound, screenOutbound, attest } from "./guardrails.js";
import { BORROWER_SYSTEM } from "./lending.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MODEL = process.env.K8T_MODEL || "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 4;
const MAX_TOKENS = 1400;

export const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const modelName = () => (hasKey() ? MODEL : "grounded-mode/no-model");

const SUITE_SYSTEM = `You are K8T, spoken "Katie". You are a conversational agent over the Reilly Protocol Suite — the IETF Internet-Draft suite authored by Lawrence John Reilly Jr. — and you are also a working demonstration of Machine-Web Symbiosis (draft-reilly-mws-00): everything you say to a person is emitted in parallel as a machine-readable record.

How you answer:
- Ground every substantive claim in the corpus. Call search_suite before answering anything about the suite, the drafts, the live instruments, or the author. Do not answer those from memory.
- Cite inline with the corpus id in square brackets, like [hdrp] or [cogsov], at the end of the sentence the source supports. A reader clicks these to reach the source, so put them where they actually belong.
- If the corpus does not cover something, say that directly and say what you would need. Never fill a gap with plausible detail. An uncited claim is a defect, not a flourish.
- Distinguish what is specified from what is deployed from what is claimed. "The draft defines X" and "the live instrument does X" are different sentences.
- If a question is outside the suite entirely — general protocol design, a technical concept, a career question — answer it normally from your own knowledge, and say plainly that you are answering outside the corpus.

Voice: direct, technically literate, no marketing register. Short paragraphs. You are talking to engineers, program managers and evaluators who will check what you said. Never oversell the work; the drafts are independent submissions, not adopted working group documents, and the instruments are reference implementations, not fielded systems. Being precise about that is more persuasive than any adjective.

Length: two to four short paragraphs unless asked for more. Lead with the answer.`;

const systemFor = (persona) => (persona === "borrower" ? BORROWER_SYSTEM : SUITE_SYSTEM);

/* --- SSE parsing ---------------------------------------------------------- */

async function streamAnthropic(body, onText, signal) {
  const res = await fetch(API_URL, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": API_VERSION
    },
    body: JSON.stringify({ ...body, stream: true })
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const blocks = [];
  let stopReason = null;
  let usage = null;
  let buffer = "";

  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";

    for (const frame of frames) {
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      let evt;
      try {
        evt = JSON.parse(dataLine.slice(5).trim());
      } catch {
        continue;
      }

      if (evt.type === "content_block_start") {
        blocks[evt.index] =
          evt.content_block.type === "tool_use"
            ? { type: "tool_use", id: evt.content_block.id, name: evt.content_block.name, json: "" }
            : { type: "text", text: "" };
      } else if (evt.type === "content_block_delta") {
        const block = blocks[evt.index];
        if (!block) continue;
        if (evt.delta.type === "text_delta") {
          block.text += evt.delta.text;
          onText(evt.delta.text);
        } else if (evt.delta.type === "input_json_delta") {
          block.json += evt.delta.partial_json;
        }
      } else if (evt.type === "message_delta") {
        stopReason = evt.delta?.stop_reason ?? stopReason;
        usage = evt.usage ?? usage;
      } else if (evt.type === "error") {
        throw new Error(evt.error?.message || "stream error");
      }
    }
  }

  const content = blocks.filter(Boolean).map((b) =>
    b.type === "tool_use"
      ? { type: "tool_use", id: b.id, name: b.name, input: safeJSON(b.json) }
      : { type: "text", text: b.text }
  );
  return { content, stopReason, usage };
}

const safeJSON = (s) => {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
};

/* --- the loop ------------------------------------------------------------- */

/**
 * @param {object} opts
 * @param {Array}  opts.history  [{role, content}] prior turns, text only
 * @param {string} opts.message  the new user message
 * @param {"autonomous"|"oversight"} opts.mode
 * @param {(event:string, data:object)=>void} opts.emit
 */
export async function ask({ history = [], message, mode = "autonomous", persona = "suite", emit, signal }) {
  // Inbound guardrails run before retrieval and before the model call. NPI is
  // removed here or not at all: once it reaches a vendor it is out of scope.
  const inbound = screenInbound(message);
  emit("guardrail", {
    phase: "inbound",
    persona,
    redactions: inbound.redactions,
    findings: inbound.findings,
    escalate: inbound.escalate
  });
  message = inbound.clean;
  // Pre-retrieval: the machine channel shows what was pulled before a token of
  // answer exists, so the reader sees the basis, not a justification after the fact.
  const pre = retrieve(message, { k: 4 });
  emit("retrieval", {
    query: message,
    selected: pre.selected.map((s) => ({ ...s, title: byId(s.id)?.title })),
    withheld: pre.withheld.map((s) => ({ ...s, title: byId(s.id)?.title }))
  });

  const disclosure = { selected: [...pre.selected], withheld: [...pre.withheld] };
  const toolLog = [];
  let answer = "";

  // In borrower mode the answer is buffered and screened before delivery.
  // Streaming is a UX luxury you do not get when the output is regulated: you
  // cannot unsay a sentence a person has already read or heard.
  const buffered = persona === "borrower";
  const deliver = (text) => {
    answer += text;
    if (!buffered) emit("text", { text });
  };

  if (!hasKey()) {
    answer = groundedFallback(message, pre);
    if (!buffered) emit("text", { text: answer });
  } else {
    const grounding = pre.selected
      .map((s) => {
        const doc = byId(s.id);
        return `[${doc.id}] ${doc.title} (${doc.url})\n${snippet(doc, message)}`;
      })
      .join("\n\n");

    // The API requires the first message to be a user turn; a truncated history
    // can start on an assistant turn.
    const priors = history.slice(-8);
    while (priors.length && priors[0].role !== "user") priors.shift();

    const messages = [
      ...priors,
      {
        role: "user",
        content: (inbound.escalate
          ? "<control note=\"guardrail\">An escalation rule fired on this message (" +
            inbound.findings.map((f) => f.id).join(", ") +
            "). Acknowledge briefly, do not attempt to resolve it, and hand off to a licensed representative.</control>\n\n"
          : "") + (grounding
          ? `${message}\n\n<pre_retrieved note="from the corpus, cite by id; call search_suite if you need more">\n${grounding}\n</pre_retrieved>`
          : message)
      }
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { content, stopReason } = await streamAnthropic(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemFor(persona),
          tools: anthropicToolSpecs(),
          messages
        },
        deliver,
        signal
      );

      if (stopReason !== "tool_use") break;

      const calls = content.filter((b) => b.type === "tool_use");
      // The API rejects empty text blocks, which streaming can produce between
      // tool calls. Echo back only blocks with substance.
      const echo = content.filter((b) => b.type === "tool_use" || (b.text && b.text.trim()));
      if (!echo.length) break;
      messages.push({ role: "assistant", content: echo });

      const results = [];
      for (const call of calls) {
        const held = mode === "oversight" && isSideEffect(call.name);
        emit("tool_use", { name: call.name, input: call.input, held });

        if (held) {
          const item = enqueueDecision({
            tool: call.name,
            input: call.input,
            reason: "Side-effecting tool called while human-oversight mode is on."
          });
          toolLog.push({ name: call.name, input: call.input, status: "held", decision_id: item.id });
          emit("decision", item);
          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: JSON.stringify({
              held_for_approval: true,
              decision_id: item.id,
              note: "Human-oversight mode is on. Tell the user the check is queued for approval and answer from the corpus."
            })
          });
          continue;
        }

        const { result, disclosure: d } = await runTool(call.name, call.input);
        if (d.selected) disclosure.selected.push(...d.selected);
        if (d.withheld) disclosure.withheld.push(...d.withheld);
        toolLog.push({ name: call.name, input: call.input, status: "executed" });
        emit("tool_result", { name: call.name, result });
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
      }

      messages.push({ role: "user", content: results });
    }
  }

  const dedupe = (arr) => {
    const seen = new Map();
    for (const r of arr) if (!seen.has(r.id) || (seen.get(r.id).score ?? 0) < (r.score ?? 0)) seen.set(r.id, r);
    return [...seen.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  };

  // Outbound guardrails read what the model produced. In borrower mode nothing
  // has been delivered yet, so a blocked turn is genuinely blocked rather than
  // retracted after the fact.
  const outbound = screenOutbound(answer);
  if (outbound.blocked) {
    answer = outbound.replacement;
  }
  emit("guardrail", {
    phase: "outbound",
    persona,
    findings: outbound.findings,
    blocked: outbound.blocked,
    escalate: outbound.escalate
  });
  if (buffered) emit("text", { text: answer });

  const cdr = issueCDR({
    query: message,
    selected: dedupe(disclosure.selected).map((s) => ({ ...s, title: byId(s.id)?.title, url: byId(s.id)?.url })),
    withheld: dedupe(disclosure.withheld),
    tools: toolLog,
    model: modelName(),
    mode,
    persona,
    compliance: attest({
      inbound,
      outbound,
      persona,
      escalated: inbound.escalate || outbound.escalate
    }),
    groundedness: groundedness(answer),
    answerText: answer
  });

  emit("cdr", cdr);
  return { answer, cdr };
}

/** No API key: return the corpus itself rather than a broken page. */
function groundedFallback(message, pre) {
  if (!pre.selected.length) {
    return `Grounded mode is on (no ANTHROPIC_API_KEY is configured), so I can only return corpus passages, and nothing in the corpus matched that question closely enough to return. Try asking about a specific draft, term or instrument — for example HDRP, Cognitive Sovereignty, or the Permanence Mesh.`;
  }
  const body = pre.selected
    .map((s) => {
      const doc = byId(s.id);
      return `**${doc.title}** [${doc.id}]\n${snippet(doc, message)}\nSource: ${doc.url}`;
    })
    .join("\n\n");
  return `Grounded mode: no model is configured, so these are the matching corpus passages verbatim, ranked by relevance. Set ANTHROPIC_API_KEY to get a synthesized answer.\n\n${body}`;
}
