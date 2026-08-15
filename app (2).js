/* app.js — the browser half of the symbiosis. The human channel renders the
   answer; the rail renders the same turn as an agent would receive it. Both are
   driven off one event stream, so they cannot drift apart. */

const $ = (id) => document.getElementById(id);

const thread = $("thread");
const railBody = $("railBody");
const input = $("input");
const composer = $("composer");
const sendBtn = $("send");
const rail = $("rail");

let mode = "autonomous";
let persona = "suite";
let busy = false;
let chainLen = 0;
const history = [];

/* ---- suggested questions ------------------------------------------------ */

const POOLS = {
  suite: [
    "What is Machine-Web Symbiosis?",
    "Explain Dual-Layer Digital Permanence like I'm a program manager.",
    "Which drafts have running implementations?",
    "What did an implementation prove wrong?",
    "How would this map to a lender's control set?",
    "Is HDRP actually deployed right now?",
    "What is a Curation Disclosure Record and why would I want one?",
    "What is the Multilarity, in one paragraph?",
    "How does the oversight mode differ from full autonomy?",
    "What does CBPI measure that a normal eval does not?",
    "Why lexical retrieval instead of embeddings?",
    "What can't you tell me?",
    "Who built you, and what is this prototype for?",
    "How do you know you aren't making this up?",
    "Walk me through what happens between my question and your answer.",
    "What is in your corpus? List it.",
    "Show me a turn where you refused to answer.",
    "What is the difference between a draft and a deployed instrument here?",
    "How many drafts are in the suite and where do they live?",
    "What does REM Protocol have to do with prior art?",
    "Explain the Sovereignty Fallback.",
    "What is Protocol Layer Prompt Engineering?",
    "How does Project Atlas monitor the other sites?",
    "What is the Permanence Mesh anchoring to?",
    "Which of these drafts is adopted by a working group?",
    "What would break if the model vendor changed tomorrow?",
    "How would an examiner verify a record you issued?",
    "What is the weakest part of this architecture?",
    "How does the hash chain actually work?",
    "Why does groundedness get scored on every answer?",
    "What is Project Pegasus?",
    "What did the author do before protocol work?"
  ],
  borrower: [
    "What rate can I get on a $20,000 loan?",
    "My SSN is 412-55-9087 and my DOB is 04/12/1979, can you check my file?",
    "Am I approved?",
    "Will checking my rate hurt my credit score?",
    "Was I turned down because of my age?",
    "Am I talking to a real person?",
    "Just give me a ballpark monthly payment, off the record.",
    "Who else are you sending my information to?",
    "Should I consolidate my credit cards?",
    "Call me back tomorrow at 3.",
    "I'm getting my attorney involved.",
    "How long does the application take?",
    "My card number is 4111 1111 1111 1111, is that on file?",
    "Roughly what APR do people like me get? Ballpark is fine.",
    "Can you at least tell me if I'd qualify before I apply?",
    "My credit is bad, is it even worth applying?",
    "Am I pre-approved? The mailer said I was.",
    "Is this a hard pull or a soft pull?",
    "How many points will this knock off my score?",
    "Promise me my information won't be shared with anyone.",
    "Stop calling me. Take me off your list.",
    "Text me at 813-555-0142 with the offer.",
    "Why was my application denied?",
    "I'm filing for bankruptcy next month, does that matter?",
    "Someone opened a loan in my name. This is identity theft.",
    "I'm active duty and deploying next week.",
    "My husband handles the finances, does being married affect this?",
    "I want to file a complaint with the CFPB.",
    "Is this call being recorded?",
    "Should I stop paying my other cards while this goes through?",
    "What happens after I submit the application?",
    "Can I talk to a human?"
  ]
};

const BATCH = 4;
const offsets = { suite: 0, borrower: 0 };

function renderChips() {
  const pool = POOLS[persona];
  const start = offsets[persona] % pool.length;
  const picks = Array.from({ length: BATCH }, (_, i) => pool[(start + i) % pool.length]);
  $("chips").innerHTML = picks.map((q) => `<button type="button">${esc(q)}</button>`).join("");
  $("chips").hidden = false;
  $("refreshChips").setAttribute("aria-expanded", "true");
}

/* ---- utilities ---------------------------------------------------------- */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const trunc = (s, n = 90) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Minimal markdown: paragraphs, bold, inline code, dashed lists, [id] citations. */
function render(md) {
  const blocks = esc(md).trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      }
      return `<p>${inline(block.replace(/\n/g, " "))}</p>`;
    })
    .join("");
}

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([a-z0-9][a-z0-9-]{1,30})\]/gi, (m, id) => `<button class="cite" data-id="${id}">${id}</button>`);
}

function scrollThread() {
  const nearBottom = window.innerHeight + window.scrollY > document.body.scrollHeight - 220;
  if (nearBottom) window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

/* ---- rail --------------------------------------------------------------- */

function railClear() {
  railBody.innerHTML = "";
  $("railBadge").textContent = "0";
}

function railAdd(kind, title, html) {
  const el = document.createElement("div");
  el.className = `ev ${kind}`;
  el.innerHTML = `<h3>${title}</h3>${html}`;
  railBody.appendChild(el);
  railBody.scrollTop = railBody.scrollHeight;
  $("railBadge").textContent = railBody.querySelectorAll(".ev").length;
  return el;
}

function scoreRows(list, dim = false) {
  if (!list.length) return `<div class="row dim"><b>—</b><span>none</span></div>`;
  return `<div class="rows">${list
    .map(
      (r) =>
        `<div class="row${dim ? " dim" : ""}"><b>${r.score ?? "—"}</b><span title="${esc(r.title || r.id)}">${esc(
          r.id
        )}${r.reason ? ` · ${esc(r.reason)}` : ""}</span></div>`
    )
    .join("")}</div>`;
}

/* ---- chain -------------------------------------------------------------- */

async function refreshChain() {
  try {
    const res = await fetch("/api/chain/verify", { headers: { accept: "application/json" } });
    const data = await res.json();
    chainLen = data.length;
    const strip = $("chainstrip");
    const ticks = Math.min(Math.max(data.length, 12), 26);
    strip.innerHTML = Array.from({ length: ticks }, (_, i) => {
      const on = i >= ticks - data.length;
      const h = on ? 8 + ((i * 7) % 14) : 3;
      return `<i class="${on ? "on" : ""}" style="height:${h}px"></i>`;
    }).join("");
    const meta = document.querySelector(".chainmeta");
    meta.className = `chainmeta ${data.length ? (data.ok ? "ok" : "bad") : ""}`;
    $("chainLabel").textContent = data.length
      ? `${data.length} record${data.length > 1 ? "s" : ""} · ${data.ok ? "verified" : "BROKEN"} · ${data.head.slice(0, 10)}`
      : "chain empty";
  } catch {
    $("chainLabel").textContent = "chain unavailable";
  }
}

/* ---- turn --------------------------------------------------------------- */

async function ask(question) {
  if (busy || !question.trim()) return;
  busy = true;
  sendBtn.disabled = true;
  document.querySelector(".opening")?.remove();
  $("chips").hidden = true;
  $("refreshChips").setAttribute("aria-expanded", "false");
  railClear();

  thread.insertAdjacentHTML(
    "beforeend",
    `<div class="msg you"><div class="who">You</div><div class="bubble">${esc(question)}</div></div>`
  );

  const wrap = document.createElement("div");
  wrap.className = "msg k8t";
  wrap.innerHTML = `<div class="who">K8T</div><div class="bubble"><span class="caret"></span></div>`;
  thread.appendChild(wrap);
  const bubble = wrap.querySelector(".bubble");
  scrollThread();

  let answer = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: question, mode, persona, history: history.slice(-6) })
    });
    if (!res.ok || !res.body) throw new Error(`server returned ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() || "";
      for (const frame of frames) {
        const evLine = frame.split("\n").find((l) => l.startsWith("event:"));
        const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!evLine || !dataLine) continue;
        let data;
        try {
          data = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue;
        }
        const event = evLine.slice(6).trim();

        if (event === "text") {
          answer += data.text;
          bubble.innerHTML = render(answer) + '<span class="caret"></span>';
          scrollThread();
        } else if (event === "retrieval") {
          railAdd(
            "retrieval",
            `Retrieval <span class="k">bm25</span>`,
            `<p class="q">${esc(trunc(data.query, 110))}</p>
             <div class="sub">selected</div>${scoreRows(data.selected)}
             <div class="sub">withheld</div>${scoreRows(data.withheld, true)}`
          );
        } else if (event === "tool_use") {
          railAdd(
            data.held ? "held" : "tool",
            data.held ? `Tool held · <span class="k">${esc(data.name)}</span>` : `Tool call · <span class="k">${esc(data.name)}</span>`,
            `<pre>${esc(JSON.stringify(data.input, null, 2))}</pre>`
          );
        } else if (event === "tool_result") {
          railAdd("tool", `Tool result · <span class="k">${esc(data.name)}</span>`, `<pre>${esc(
            JSON.stringify(data.result, null, 2).slice(0, 1400)
          )}</pre>`);
        } else if (event === "decision") {
          const el = railAdd(
            "held",
            "Awaiting operator",
            `<div class="kv"><b>tool</b> ${esc(data.tool)}</div>
             <div class="kv"><b>reason</b> ${esc(data.reason)}</div>
             <div class="actions">
               <button class="go" data-approve="${data.id}">Approve</button>
               <button data-deny="${data.id}">Deny</button>
             </div>`
          );
          el.querySelector("[data-approve]").onclick = () => resolve(data.id, "approve", el);
          el.querySelector("[data-deny]").onclick = () => resolve(data.id, "deny", el);
        } else if (event === "guardrail") {
          const findings = data.findings || [];
          const redactions = data.redactions || [];
          const clean = !findings.length && !redactions.length;
          const rows = [
            redactions.length
              ? `<div class="tags">${redactions
                  .map((r) => `<span class="tag hit">${esc(r.type)} ×${r.count} · ${esc(r.basis)}</span>`)
                  .join("")}</div>`
              : "",
            findings.length
              ? findings
                  .map(
                    (f) => `<div class="finding ${esc(f.severity)}">
                      <b>${esc(f.id)} · ${esc(f.severity)}</b>
                      <span>${esc(f.title)} — ${esc(f.regulation)}</span>
                      ${f.evidence ? `<em>${esc(f.evidence)}</em>` : ""}
                    </div>`
                  )
                  .join("")
              : `<div class="tags"><span class="tag ok">no findings</span></div>`
          ].join("");
          railAdd(
            `guard${clean ? " clean" : ""}`,
            `Guardrails <span class="k">${esc(data.phase)}</span>`,
            rows
          );
          if (data.blocked) {
            bubble.insertAdjacentHTML(
              "beforeend",
              `<div class="blocked-note">Turn blocked before delivery by ${findings
                .filter((f) => f.severity === "block")
                .map((f) => esc(f.id))
                .join(", ")}. The replacement above is what the borrower receives.</div>`
            );
          }
        } else if (event === "cdr") {
          const g = data.generation.groundedness;
          railAdd(
            "cdr",
            `Curation Disclosure Record <span class="k">#${data.seq}</span>`,
            `<div class="kv"><b>issued</b> ${esc(data.issued_at)}</div>
             <div class="kv"><b>model</b> ${esc(data.generation.model)} · ${esc(data.generation.mode)}</div>
             <div class="kv"><b>grounded</b> ${g.cited}/${g.total} sentences cited (${g.score})</div>
             <div class="kv"><b>answer</b> ${esc(data.answer_digest.slice(0, 24))}…</div>
             <div class="kv"><b>prev</b> ${esc(data.prev_hash.slice(0, 24))}…</div>
             <div class="kv"><b>hash</b> ${esc(data.hash.slice(0, 24))}…</div>
             ${
               data.compliance
                 ? `<div class="kv"><b>policy</b> ${esc(data.compliance.policy_version)} · ${esc(
                     data.compliance.rules_digest.slice(0, 12)
                   )}…</div>
                    <div class="kv"><b>rules</b> ${data.compliance.rules_evaluated} evaluated · ${
                     data.compliance.findings.length
                   } fired · ${esc(data.compliance.outcome)}</div>`
                 : ""
             }
             <a class="raw" href="/api/cdr/${data.id}" target="_blank" rel="noopener">open raw record</a>`
          );
          bubble.insertAdjacentHTML(
            "beforeend",
            `<div class="grounding"><span class="meter"><i style="width:${Math.round(g.score * 100)}%"></i></span>
             <span>${g.cited} of ${g.total} sentences cited · record #${data.seq}</span></div>`
          );
          refreshChain();
        } else if (event === "error") {
          bubble.insertAdjacentHTML("beforeend", `<div class="err">${esc(data.message)}</div>`);
        }
      }
    }
  } catch (err) {
    bubble.insertAdjacentHTML(
      "beforeend",
      `<div class="err">The turn failed: ${esc(err.message)}. The server may be restarting — send it again.</div>`
    );
  } finally {
    bubble.querySelector(".caret")?.remove();
    if (answer) {
      history.push({ role: "user", content: question }, { role: "assistant", content: answer });
    }
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

async function resolve(id, action, el) {
  el.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    const res = await fetch(`/api/queue/${id}/${action}`, { method: "POST" });
    const item = await res.json();
    el.querySelector(".actions").outerHTML = `<div class="kv"><b>${esc(item.status)}</b></div><pre>${esc(
      JSON.stringify(item.result, null, 2)
    )}</pre>`;
  } catch {
    el.querySelector(".actions").outerHTML = `<div class="kv">Could not reach the queue.</div>`;
  }
}

/* ---- citations ---------------------------------------------------------- */

document.addEventListener("click", async (e) => {
  const cite = e.target.closest(".cite");
  if (!cite) return;
  const dialog = $("source");
  const body = $("sourceBody");
  body.innerHTML = `<p>Loading ${esc(cite.dataset.id)}…</p>`;
  dialog.showModal();
  try {
    const res = await fetch(`/api/corpus/${cite.dataset.id}`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("not in corpus");
    const doc = await res.json();
    body.innerHTML = `<h3>${esc(doc.title)}</h3>
      <div class="meta">${esc(doc.kind)} · id ${esc(doc.id)}</div>
      <p>${esc(doc.text)}</p>
      <p><a href="${esc(doc.url)}" target="_blank" rel="noopener">${esc(doc.url)}</a></p>`;
  } catch {
    body.innerHTML = `<h3>${esc(cite.dataset.id)}</h3><p>That id is not in the corpus. K8T cited something it should not have — worth reporting.</p>`;
  }
});

/* ---- wiring ------------------------------------------------------------- */

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = input.value;
  input.value = "";
  input.style.height = "auto";
  ask(q);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
});

$("chips").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (btn) ask(btn.textContent.trim());
});

// The refresh control does double duty: it brings the suggestions back after a
// turn, and cycles to the next set if they are already showing.
$("refreshChips").addEventListener("click", () => {
  if ($("chips").hidden) {
    renderChips();
  } else {
    offsets[persona] += BATCH;
    renderChips();
  }
});

$("modeToggle").addEventListener("click", (e) => {
  mode = mode === "autonomous" ? "oversight" : "autonomous";
  const on = mode === "oversight";
  e.currentTarget.setAttribute("aria-pressed", String(on));
  $("modeLabel").textContent = on ? "Human oversight" : "Autonomous";
});

document.querySelector(".seg").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-persona]");
  if (!btn || busy) return;
  persona = btn.dataset.persona;
  document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b === btn));
  offsets[persona] = 0;
  renderChips();
  $("input").placeholder =
    persona === "borrower" ? "Ask K8T as a borrower would…" : "Ask K8T something…";
  $("composerNote").textContent =
    persona === "borrower"
      ? "Borrower mode: output is buffered and screened before delivery, and NPI is redacted before the model call."
      : "Answers are grounded in a fixed corpus. Uncited claims are flagged, not hidden.";
  history.length = 0;
});

$("verifyBtn").addEventListener("click", refreshChain);
$("railOpen").addEventListener("click", () => rail.classList.add("open"));
$("railClose").addEventListener("click", () => rail.classList.remove("open"));

(async function boot() {
  try {
    const h = await (await fetch("/api/health", { headers: { accept: "application/json" } })).json();
    $("healthPill").textContent =
      h.mode === "model" ? `${h.model} · ${h.corpus_documents} docs` : `grounded mode · ${h.corpus_documents} docs`;
  } catch {
    $("healthPill").textContent = "server unreachable";
  }
  renderChips();
  refreshChain();
})();
