// TACET — free OpenRouter model benchmark for the LlmReader queue.
//
// Throwaway tooling (NOT shipped in the demo path). It runs the REAL reader
// prompt (buildReaderSystem + buildReaderUserContent, ported verbatim from
// src/readers/llm-reader.ts) over a balanced gold set of claims the two real
// readers AGREED on, and scores each free model on: reachability, valid-lean
// rate, accuracy vs gold, latency, HTTP 403/429, and <think> leakage.
//
// Usage:  node bench/free-model-bench.mjs            (full run)
//         node bench/free-model-bench.mjs --claims 6 (fewer claims, faster)
//
// Reads OPENROUTER_API_KEY (or SUMMARY_API_KEY) from .env. Never prints the key.

import { readFileSync } from "node:fs";

// ---- env (tiny .env reader; no dep) ---------------------------------------
function loadEnv(path = ".env") {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* no .env — rely on real env */ }
}
loadEnv();

const API_KEY = process.env.OPENROUTER_API_KEY ?? process.env.SUMMARY_API_KEY;
if (!API_KEY) { console.error("No OPENROUTER_API_KEY / SUMMARY_API_KEY in env."); process.exit(1); }
const BASE = "https://openrouter.ai/api/v1";

// ---- the candidate fleet (from the user's tested list) --------------------
// reasoning: give 4096 max_tokens so CoT doesn't eat the output.
const MODELS = [
  { id: "baidu/cobuddy:free" },
  { id: "poolside/laguna-m.1:free" },
  { id: "openai/gpt-oss-120b:free", note: "input moderation (403 on flagged terms)" },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free" },
  { id: "meta-llama/llama-3.3-70b-instruct:free" },
  { id: "qwen/qwen3-coder:free" },
  { id: "mistralai/mistral-nemo:free" },
  { id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free" },
  { id: "minimax/minimax-m2.5:free", note: "input moderation" },
  { id: "deepseek/deepseek-v4-flash:free", reasoning: true },
  { id: "tngtech/trinity-large-thinking:free", reasoning: true },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", reasoning: true, note: "leaks <think>" },
  { id: "google/gemma-4-26b-a4b-it:free" },
  { id: "nvidia/nemotron-3-nano-30b-a3b:free" },
];

// ---- REAL reader prompt (verbatim port of src/readers/llm-reader.ts) -------
function buildReaderSystem(referenceHypothesis) {
  return [
    "You are an UNDECIDED, position-agnostic reader. Take no side a priori, and",
    "use no outside knowledge — read ONLY the structured evidence you are given",
    "(central claim, cited evidence, summary). You do NOT judge whether anything",
    "is TRUE, and you do NOT judge whether the paper is internally coherent.",
    "",
    "You answer one symmetric question — not 'defend' and not 'attack':",
    "  what origin does THIS evidence support, RELATIVE TO the reference hypothesis?",
    "",
    "REFERENCE HYPOTHESIS — the recognizedly inconclusive state of the question.",
    "Do not try to prove it or refute it; weigh only what THIS evidence adds:",
    `  ${referenceHypothesis}`,
    "",
    "Emit exactly one lean, relative to that hypothesis:",
    '  "supports"     — the evidence reinforces the natural-zoonotic hypothesis',
    "                   (e.g. close relatives in bats/pangolins, natural",
    "                   recombination, genomic features of a natural origin);",
    '  "contradicts"  — the evidence points against naturalness, toward a lab or',
    '                   synthetic origin (e.g. "does not exclude a lab origin", a',
    "                   non-natural origin score, evidence of synthesis);",
    '  "insufficient" — the evidence does NOT bear on the origin question',
    "                   (diagnosis, therapy, epidemiology, molecular biology with",
    "                   no bearing on origin), OR it bears on origin but is of the",
    "                   recognizedly inconclusive kind that does not let you",
    "                   decide. This is a legitimate, honest answer — use it freely.",
    "",
    'Respond with ONLY a JSON object: {"lean": "...", "rationale": "one sentence"}.',
  ].join("\n");
}
function buildReaderUserContent(claim) {
  const s = claim.provenance[0]?.structured;
  const lines = [`CLAIM: ${claim.text}`];
  if (s !== undefined) {
    lines.push(`CENTRAL CLAIM: ${s.centralClaim}`);
    lines.push(`CITED EVIDENCE: ${s.citedEvidence}`);
    lines.push(`SUMMARY: ${s.summaryText}`);
  } else if (claim.provenance[0]?.summary !== undefined) {
    lines.push(`EVIDENCE: ${claim.provenance[0].summary}`);
  }
  return lines.join("\n");
}
function extractFirstJSON(text) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)); } catch { return null; }
}
const LEANS = ["supports", "contradicts", "insufficient"];
function parseLean(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return LEANS.includes(s) ? s : null;
}

// ---- gold set: balanced, agreed-by-both-real-readers ----------------------
function buildGold(perLean) {
  const j = JSON.parse(readFileSync("fixtures/replay/sago-origin-v0.1.json", "utf8"));
  const a = j.readers["reader-a"], b = j.readers["reader-b"];
  const byId = Object.fromEntries(j.claims.map((c) => [c.id, c]));
  const bucket = { supports: [], contradicts: [], insufficient: [] };
  for (const id of Object.keys(a)) {
    if (b[id] && a[id].lean === b[id].lean) {
      const c = byId[id];
      if (c?.provenance?.[0]?.structured) bucket[a[id].lean].push(c);
    }
  }
  const gold = [];
  for (const lean of LEANS) for (const c of bucket[lean].slice(0, perLean)) gold.push({ claim: c, expected: lean });
  return { gold, refHyp: j.referenceHypothesis };
}

// ---- one chat call with retry/backoff on 429 ------------------------------
async function callModel(model, system, user, reasoning) {
  const maxTokens = reasoning ? 4096 : 2048;
  const backoffs = [0, 1000, 2000, 4000];
  let last = { ok: false, status: 0, error: "no attempt", seconds: 0 };
  for (let i = 0; i < backoffs.length; i++) {
    if (backoffs[i] > 0) await new Promise((r) => setTimeout(r, backoffs[i]));
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
          "HTTP-Referer": "https://tacet.tmulab.org",
          "X-Title": "TACET free-model bench",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const seconds = (Date.now() - t0) / 1000;
      if (res.status === 429) { last = { ok: false, status: 429, error: "rate-limited", seconds }; continue; }
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, status: res.status, error: body.slice(0, 160), seconds };
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      return { ok: true, status: 200, content, seconds };
    } catch (e) {
      clearTimeout(timer);
      const seconds = (Date.now() - t0) / 1000;
      last = { ok: false, status: 0, error: e?.name === "AbortError" ? "timeout" : String(e), seconds };
    }
  }
  return last;
}

// ---- run one model over the gold set --------------------------------------
async function benchModel(m, gold, system) {
  const r = { id: m.id, note: m.note ?? "", reachable: false, total: gold.length,
              valid: 0, correct: 0, latencies: [], statuses: {}, thinkLeak: false, emptyOut: 0, sample: "" };
  for (const { claim, expected } of gold) {
    const res = await callModel(m.id, system, buildReaderUserContent(claim), m.reasoning);
    r.statuses[res.status] = (r.statuses[res.status] ?? 0) + 1;
    if (!res.ok) continue;
    r.reachable = true;
    r.latencies.push(res.seconds);
    if (/<think>/i.test(res.content)) r.thinkLeak = true;
    if (res.content.trim() === "") { r.emptyOut++; continue; }
    const lean = parseLean(extractFirstJSON(res.content)?.lean);
    if (lean) { r.valid++; if (lean === expected) r.correct++; }
    if (!r.sample) r.sample = res.content.replace(/\s+/g, " ").slice(0, 90);
  }
  return r;
}

// ---- pooled concurrency over models ---------------------------------------
async function pool(items, size, fn) {
  const out = []; let i = 0;
  const workers = Array.from({ length: size }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  });
  await Promise.all(workers);
  return out;
}

// ---- main -----------------------------------------------------------------
const perLean = Number(process.argv[process.argv.indexOf("--claims") + 1]) || 3;
const { gold, refHyp } = buildGold(perLean);
const system = buildReaderSystem(refHyp);
console.error(`Gold set: ${gold.length} claims (${perLean}/lean). Models: ${MODELS.length}. Running...`);

const results = await pool(MODELS, 4, async (m) => {
  const r = await benchModel(m, gold, system);
  const avg = r.latencies.length ? (r.latencies.reduce((a, b) => a + b, 0) / r.latencies.length).toFixed(1) : "—";
  console.error(`  done ${m.id.padEnd(52)} reach=${r.reachable} valid=${r.valid}/${r.total} acc=${r.correct}/${r.total} avg=${avg}s ${JSON.stringify(r.statuses)}`);
  return r;
});

// ---- rank: reachable first, then accuracy, validity, latency --------------
function avgLat(r) { return r.latencies.length ? r.latencies.reduce((a, b) => a + b, 0) / r.latencies.length : Infinity; }
results.sort((x, y) =>
  (y.reachable - x.reachable) ||
  (y.correct - x.correct) ||
  (y.valid - x.valid) ||
  (avgLat(x) - avgLat(y)));

console.log("\n=== TACET free-model benchmark (real reader prompt, agreed-gold) ===\n");
console.log("rank model                                                  reach valid  acc   avgLat  caveats");
results.forEach((r, i) => {
  const caveats = [];
  if (r.thinkLeak) caveats.push("<think> leak");
  if (r.statuses["403"]) caveats.push("403 moderation");
  if (r.statuses["429"]) caveats.push("429 rate-limit");
  if (r.statuses["404"]) caveats.push("404 not-found");
  if (r.emptyOut) caveats.push(`${r.emptyOut} empty-out`);
  if (r.note) caveats.push(r.note);
  const lat = r.latencies.length ? avgLat(r).toFixed(1) + "s" : "—";
  console.log(
    `${String(i + 1).padStart(2)}.  ${r.id.padEnd(52)} ${r.reachable ? "✓" : "✗"}   ${String(r.valid + "/" + r.total).padEnd(5)} ${String(r.correct + "/" + r.total).padEnd(5)} ${lat.padStart(6)}  ${caveats.join("; ")}`);
});
console.log("\n(acc = lean matches the two real readers' agreed lean; valid = parseable lean in enum)\n");

// machine-readable dump for building the queue
console.log("JSON_RESULTS=" + JSON.stringify(results.map((r) => ({
  id: r.id, reachable: r.reachable, valid: r.valid, correct: r.correct, total: r.total,
  avgLat: r.latencies.length ? +avgLat(r).toFixed(2) : null, statuses: r.statuses,
  thinkLeak: r.thinkLeak, emptyOut: r.emptyOut,
}))));
