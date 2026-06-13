import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { Claim, OriginStance, StructuredSummary } from "../domain/types.js";
import { configFromEnv, extractFirstJSON, fetchLLM } from "./llm.js";
import type { LlmTransport } from "./llm.js";

/**
 * LLM summarizer (Phase 5a). Replaces the truncated-stub summary with a real,
 * STRUCTURED summary, run once in prep (`npm run summarize`, needs a key) and
 * saved into the corpus. Replay stays offline reading the saved corpus; anyone
 * without a key keeps truncated-stub. The LLM is reached only here.
 *
 * Determinism: temperature 0; the transport is injectable (default fetchLLM);
 * tests inject stubs. A per-record LLM failure falls back to truncated-stub for
 * THAT record without derailing the run.
 */

export const SUMMARY_SYSTEM = [
  "You summarize a single scientific paper from ONLY the abstract provided.",
  "Use no outside knowledge; do not infer beyond the abstract; if a field is not",
  "in the abstract, keep it minimal rather than inventing.",
  "Respond with ONLY a JSON object, no prose, no markdown, no code fences, with",
  "exactly these fields:",
  '  "centralClaim": the paper\'s central claim, one sentence;',
  '  "citedEvidence": the evidence the paper invokes, 1-2 sentences;',
  '  "originStance": one of "zoonotic" | "lab" | "both-considered" | "none"',
  "    — the paper's stance on the origin of SARS-CoV-2, by this rubric:",
  '      "zoonotic": the paper argues for or concludes a natural/zoonotic origin',
  "        (spillover, intermediate host, natural bat/pangolin recombination);",
  '      "lab": the paper argues for or concludes a laboratory/synthetic origin',
  "        (engineering, synthesis, a leak);",
  '      "both-considered": the paper discusses, compares, maps or weighs the',
  "        origin hypotheses (natural vs. laboratory), even if it endorses",
  "        neither — including reviews of the controversy, analyses of the",
  "        debate, and papers presenting evidence relevant to the origin question",
  "        without settling it. A paper that acknowledges the origin is contested",
  "        and engages with it is both-considered, NOT none;",
  '      "none": the paper does not address the origin question at all — its',
  "        topic is something else (treatment, transmission, vaccine, clinical",
  "        effect, diagnosis, epidemiology, organ damage, health policy, etc.).",
  '        Mentioning "SARS-CoV-2" or "the pandemic" does not make a paper about origin.',
  "    Distinguish NOT ENDORSING A SIDE (which, if the paper treats the origin",
  "    debate, is both-considered) from NOT ADDRESSING ORIGIN (which is none).",
  "    When unsure between both-considered and none, ask: does the abstract",
  "    mention, discuss or weigh where the virus came from? If yes →",
  "    both-considered. If the abstract is about another subject and never",
  "    touches origin → none;",
  '  "summaryText": 2-3 sentences of prose for a human reader.',
].join("\n");

function buildUserContent(title: string, abstract: string): string {
  return `TITLE: ${title}\n\nABSTRACT:\n${abstract}`;
}

const ORIGIN_STANCES: readonly OriginStance[] = ["zoonotic", "lab", "both-considered", "none"];

/** Coerce an unknown stance to the enum; anything outside it → "none". */
function coerceStance(value: unknown): OriginStance {
  const s = String(value ?? "").trim();
  return (ORIGIN_STANCES as readonly string[]).includes(s) ? (s as OriginStance) : "none";
}

/** Build a StructuredSummary from parsed JSON, or null (→ fallback) when there
 * is no usable JSON / no human summary text. */
function parseStructured(json: Record<string, unknown> | null): StructuredSummary | null {
  if (json === null) return null;
  const summaryText = String(json["summaryText"] ?? "").trim();
  if (summaryText.length === 0) return null;
  return {
    centralClaim: String(json["centralClaim"] ?? "").trim(),
    citedEvidence: String(json["citedEvidence"] ?? "").trim(),
    originStance: coerceStance(json["originStance"]),
    summaryText,
  };
}

/**
 * Summarize one claim. On any failure (HTTP/timeout/invalid JSON) returns the
 * claim UNCHANGED (still truncated-stub) — the honest fallback. On success
 * returns a copy whose first provenance carries the structured summary,
 * summaryMethod "llm", and summary = summaryText.
 */
export async function summarizeClaim(claim: Claim, transport: LlmTransport): Promise<Claim> {
  const prov = claim.provenance[0];
  if (prov === undefined) return claim;

  const result = await transport(SUMMARY_SYSTEM, buildUserContent(claim.text, prov.summary ?? ""));
  if (!result.ok) return claim; // HTTP / timeout → fallback

  const structured = parseStructured(extractFirstJSON(result.content));
  if (structured === null) return claim; // invalid / empty JSON → fallback

  return {
    ...claim,
    provenance: [
      { ...prov, summary: structured.summaryText, summaryMethod: "llm", structured },
      ...claim.provenance.slice(1),
    ],
  };
}

export interface SummarizeOutcome {
  readonly claims: readonly Claim[];
  readonly fallbacks: number;
}

/** Progress callback: invoked after each claim with 1-based index, total, and
 * the resulting method ("llm" or "truncated-stub" on fallback). */
export type ProgressFn = (done: number, total: number, claim: Claim) => void;

/** Summarize a corpus sequentially (deterministic). Counts fallbacks. */
export async function summarizeCorpus(
  claims: readonly Claim[],
  transport: LlmTransport,
  onProgress?: ProgressFn,
): Promise<SummarizeOutcome> {
  const out: Claim[] = [];
  let fallbacks = 0;
  for (const claim of claims) {
    const summarized = await summarizeClaim(claim, transport);
    if (summarized.provenance[0]?.summaryMethod !== "llm") fallbacks += 1;
    out.push(summarized);
    onProgress?.(out.length, claims.length, summarized);
  }
  return { claims: out, fallbacks };
}

// ── Prep script (the only LLM-touching entrypoint) ─────────────────────────────

interface Corpus {
  readonly case: string;
  readonly claims: readonly Claim[];
  readonly citationGraph: Readonly<Record<string, readonly string[]>>;
}

async function main(): Promise<void> {
  const config = configFromEnv();
  if (config === null) {
    throw new Error("set SUMMARY_API_KEY (or OPENROUTER_API_KEY) to summarize — see .env.example");
  }
  const arg = process.argv[2];
  if (arg === undefined) throw new Error("usage: npm run summarize -- <corpus.json>");
  const inPath = isAbsolute(arg) ? arg : resolve(process.cwd(), arg);

  const corpus = JSON.parse(readFileSync(inPath, "utf8")) as Corpus;
  const transport: LlmTransport = (system, user) =>
    fetchLLM(config.baseUrl, config.apiKey, config.model, system, user, { temperature: 0 });

  console.log(`summarizing ${corpus.claims.length} claims via ${config.model}…`);
  const { claims, fallbacks } = await summarizeCorpus(corpus.claims, transport, (done, total, claim) => {
    const method = claim.provenance[0]?.summaryMethod === "llm" ? "llm " : "STUB";
    console.log(`  [${String(done).padStart(2)}/${total}] ${method} ${claim.id}`);
  });
  console.log(`done: ${claims.length - fallbacks} llm, ${fallbacks} fell back to truncated-stub`);

  const outPath = inPath.replace(/\.json$/, "") + ".summarized.json";
  writeFileSync(outPath, JSON.stringify({ ...corpus, claims }, null, 2) + "\n");
  console.log(`wrote ${outPath}`);
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] !== undefined && /summarize\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
