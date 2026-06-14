/**
 * The step-0 LLM PROPOSER (prep-only). Given the researcher's raw question, it
 * asks a model for a FIRST FORMULATION — a two-clause SAGO hypothesis plus a
 * VIGILIA-style search protocol (multilingual descriptors, inclusion/exclusion,
 * seed papers). The reply is a RAW DraftProposal: every clause still has to be
 * accepted or rewritten by a human (see protocol.ts). The model frames the
 * question; it never decides it.
 *
 * Network-injected (default `fetchLLM`, same as summarize/read); tests inject
 * stubs. Reached ONLY in the prepare script — never by replay or tests' logic.
 * Tolerant: a partial/garbled reply degrades to null (caller falls back to the
 * empty human form), never throws, never fabricates a hypothesis.
 */

import { extractFirstJSON } from "../ingestion/llm.js";
import type { LlmTransport } from "../ingestion/llm.js";
import { Cascade } from "../llm/cascade.js";
import type { CascadeOptions, ModelSpec, ModelTransport } from "../llm/cascade.js";
import type { DraftProposal } from "./types.js";

/**
 * The expectedCoverage field, shared by both prompts. ANTI-CIRCULAR: the model is
 * told to derive it from the question+anchor (the structure of the debate),
 * before any literature exists — it cannot read it off a corpus, because at
 * step 0 there is none. This is what makes the empty chair a claim about the
 * DEBATE, not a description of what the search happened to return.
 */
const EXPECTED_COVERAGE_FIELD = [
  '  "expectedCoverage": array of {"dimension","value","justification"} declaring the',
  "    TRADITIONS, LANGUAGES and GENRES that a good corpus for THIS debate should",
  "    contain — derived from the question (and anchor) ALONE, as the STRUCTURE of",
  "    the field, BEFORE any literature is gathered. Do NOT describe search results.",
  "    dimension is one of: tradition, language, genre. Use language codes (pt, es,",
  "    fr, de, en) and genres (book, article, chapter). justification: why pertinent.",
].join("\n");

export const PROTOCOL_SYSTEM = [
  "You help a researcher PRE-REGISTER an investigation, before any literature is",
  "gathered. From their raw question you propose a FIRST DRAFT only — the",
  "researcher will accept or rewrite every part; nothing you write is final.",
  "",
  "Propose a two-clause reference hypothesis in the SAGO mold:",
  '  "bestSustained": the position currently BEST sustained by the state of the',
  "    debate, one or two sentences;",
  '  "concession": a concession or live tension that cannot be dismissed — what',
  "    keeps the question genuinely open, one or two sentences.",
  "Both clauses must be present. State the limit: this is conceptual coherence and",
  "coverage of the debate, NOT a claim about what is TRUE.",
  "",
  "Also propose a search protocol:",
  '  "descriptors": an object of language code → array of search terms, covering',
  "    at least the question's own language and English (e.g. pt, en, es);",
  '  "inclusion": array of inclusion criteria (one short phrase each);',
  '  "exclusion": array of exclusion criteria (one short phrase each);',
  '  "seedPapers": array of objects {"title": "…", "locator": "DOI or URL or null"};',
  EXPECTED_COVERAGE_FIELD,
  "",
  "Reason over the COVERAGE of the debate, never over fame: never write 'Dr. X",
  "says'. Respond with ONLY a JSON object, no prose, no markdown, no code fences.",
].join("\n");

/**
 * The ANCHORED system prompt. The model reads a theoretical text and frames the
 * DISPUTE it stages as a neutral two-position hypothesis — NOT the author's
 * conclusion. The anchor gives concrete vocabulary and mechanism; it gives no
 * authority over the answer.
 */
export const PROTOCOL_SYSTEM_ANCHORED = [
  "You help a researcher PRE-REGISTER an investigation. They give you a QUESTION",
  "and an ANCHOR TEXT (a theoretical text). Your job is NOT to answer the question,",
  "and NOT to report the anchor author's conclusion. Read the anchor to find the",
  "DISPUTE it stages, then frame that dispute NEUTRALLY as a two-clause hypothesis.",
  "",
  "CRITICAL — the anchor is a source of TENSION, not of TRUTH:",
  "  - The hypothesis MUST hold a position AND its opposite, kept OPEN. If the",
  "    anchor argues X, you do NOT output X as settled — you output 'X is the",
  "    better-sustained reading for some, yet not-X resists, and it stays open'.",
  "  - Keep the ruler NEUTRAL: two undecided readers will later weigh a corpus",
  "    against this hypothesis, so it must NOT encode the anchor author's verdict.",
  "  - DISTIL, do not copy: never quote or paraphrase the anchor closely; use your",
  "    own words (respect copyright).",
  "",
  "Fields:",
  '  "bestSustained": the position currently best sustained in THAT debate (1-2 sent.);',
  '  "concession": the live counter-position / tension that keeps it open (1-2 sent.)',
  "    — it MUST name the opposing side, not merely soften the first clause;",
  '  "disputeLocus": <=12 words, YOUR OWN paraphrase naming the crux the text stages;',
  '  "descriptors": object of language code → array of search terms (pt, en, es…);',
  '  "inclusion": array of inclusion criteria; "exclusion": array of exclusion criteria;',
  '  "seedPapers": array of {"title": "…", "locator": "DOI or URL or null"};',
  EXPECTED_COVERAGE_FIELD,
  "",
  "This is conceptual coverage of a debate, NOT a claim about truth. Reason over",
  "coverage, never fame. Respond with ONLY a JSON object, no prose, no code fences.",
].join("\n");

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(asString).filter((s) => s.length > 0);
}

function asDescriptors(v: unknown): Record<string, readonly string[]> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, readonly string[]> = {};
  for (const [lang, terms] of Object.entries(v as Record<string, unknown>)) {
    const arr = asStringArray(terms);
    if (arr.length > 0) out[lang] = arr;
  }
  return out;
}

function asExpectedCoverage(v: unknown): { dimension: string; value: string; justification: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { dimension: string; value: string; justification: string }[] = [];
  for (const item of v) {
    if (item === null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const dimension = asString(o["dimension"]).toLowerCase();
    const value = asString(o["value"]);
    if (dimension.length === 0 || value.length === 0) continue;
    out.push({ dimension, value, justification: asString(o["justification"]) });
  }
  return out;
}

function asSeedPapers(v: unknown): { readonly title: string; readonly locator: string | null }[] {
  if (!Array.isArray(v)) return [];
  const out: { readonly title: string; readonly locator: string | null }[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s.length > 0) out.push({ title: s, locator: s }); // a bare DOI/URL string
      continue;
    }
    if (item !== null && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const title = asString(o["title"]) || asString(o["locator"]);
      if (title.length === 0) continue;
      const loc = asString(o["locator"]);
      out.push({ title, locator: loc.length > 0 ? loc : null });
    }
  }
  return out;
}

/** Parse a model reply (already JSON-extracted) into a DraftProposal. Returns
 * null when EITHER SAGO clause is missing — we never fabricate a hypothesis. */
export function parseDraft(json: Record<string, unknown> | null): DraftProposal | null {
  if (json === null) return null;
  const bestSustained = asString(json["bestSustained"]);
  const concession = asString(json["concession"]);
  if (bestSustained.length === 0 || concession.length === 0) return null;
  const disputeLocus = asString(json["disputeLocus"]);
  const expectedCoverage = asExpectedCoverage(json["expectedCoverage"]);
  return {
    bestSustained,
    concession,
    descriptors: asDescriptors(json["descriptors"]),
    inclusion: asStringArray(json["inclusion"]),
    exclusion: asStringArray(json["exclusion"]),
    seedPapers: asSeedPapers(json["seedPapers"]),
    ...(disputeLocus.length > 0 ? { disputeLocus } : {}),
    ...(expectedCoverage.length > 0 ? { expectedCoverage } : {}),
  };
}

/**
 * The NEUTRALITY gate (anchored mode). The anchor is a source of TENSION, not of
 * truth, so the hypothesis must hold a position AND its opposite, kept open — not
 * the anchor author's verdict. This is a heuristic, not a proof: it rejects the
 * obvious failure (a "concession" that merely restates the thesis, or carries no
 * openness/contrast marker). The deeper guard is the prompt plus the human-accept
 * invariant — a subtly-poisoned ruler is the researcher's to catch on review.
 */
const OPEN_TENSION =
  /\b(por[ée]m|entretanto|contudo|todavia|no entanto|n[ãa]o obstante|however|nevertheless|nonetheless|yet|whereas|while|on the other hand|em disputa|quest[ãa]o (em )?abert|inconclusiv|contestad|contested|unsettled|underdetermin|resist|contr[áa]ri|disputa|remains open)\b/i;

export function hasOpenTension(d: DraftProposal): boolean {
  const b = d.bestSustained.trim().toLowerCase();
  const c = d.concession.trim();
  if (c.length === 0 || c.toLowerCase() === b) return false;
  return OPEN_TENSION.test(c) || OPEN_TENSION.test(d.bestSustained);
}

/** Input for a proposal. With `anchorText` the proposer runs in ANCHORED mode
 * (anchor-derived dispute + neutrality gate); without it, the plain mode. */
export interface ProposeInput {
  readonly question: string;
  readonly anchorText?: string;
}

function isAnchored(i: ProposeInput): i is ProposeInput & { anchorText: string } {
  return typeof i.anchorText === "string" && i.anchorText.trim().length > 0;
}

/** How much anchor text to send — caps context for small free models. */
const ANCHOR_CHAR_CAP = 12_000;

/** The user content for one proposal call — single source of the prompt shape. */
export function proposeUserContent(rawQuestion: string): string {
  return `RESEARCH QUESTION: ${rawQuestion}`;
}

function buildProposeUser(input: ProposeInput): string {
  if (!isAnchored(input)) return proposeUserContent(input.question);
  return [
    proposeUserContent(input.question),
    "",
    "ANCHOR TEXT — source of TENSION, not of truth. Find the DISPUTE it stages;",
    "do NOT adopt its conclusion; distil in your own words, do not quote:",
    input.anchorText.slice(0, ANCHOR_CHAR_CAP),
  ].join("\n");
}

/** "Parses to a usable draft" — the cascade's semantic gate: a 200 that does not
 * yield a draft (both SAGO clauses present) is a failure and falls through. In
 * anchored mode the draft must ALSO pass the neutrality gate (two open sides). */
export function isUsableDraftContent(content: string): boolean {
  return parseDraft(extractFirstJSON(content)) !== null;
}

function validateFor(anchored: boolean): (content: string) => boolean {
  return (content) => {
    const d = parseDraft(extractFirstJSON(content));
    if (d === null) return false;
    return anchored ? hasOpenTension(d) : true;
  };
}

/** Ask the model for a draft. null on transport failure or unusable reply. */
export async function proposeProtocolDraft(rawQuestion: string, transport: LlmTransport): Promise<DraftProposal | null> {
  const result = await transport(PROTOCOL_SYSTEM, proposeUserContent(rawQuestion));
  if (!result.ok) return null;
  return parseDraft(extractFirstJSON(result.content));
}

/** What the cascade proposer returns: the parsed draft AND the id of the model
 * that ACTUALLY produced it — so the protocol's provenance attributes the draft
 * to the real responder, never to the configured lead when the lead fell through. */
export interface ProposedDraft {
  readonly draft: DraftProposal;
  readonly model: string;
}

/**
 * Propose a draft over an ORDERED cascade of models (lead first, then fallbacks).
 * Plain mode gates on "parses to a usable draft"; ANCHORED mode (input.anchorText
 * present) uses the anchored prompt AND the neutrality gate, so a one-sided reply
 * falls through instead of poisoning the ruler. Returns the winning model's id
 * alongside the draft. Transport is injected. null when exhausted / no usable draft.
 */
export async function proposeDraftViaCascade(
  input: ProposeInput,
  models: readonly ModelSpec[],
  transport: ModelTransport,
  opts: CascadeOptions = {},
): Promise<ProposedDraft | null> {
  const anchored = isAnchored(input);
  const system = anchored ? PROTOCOL_SYSTEM_ANCHORED : PROTOCOL_SYSTEM;
  const cascade = new Cascade(models, transport, { ...opts, validate: validateFor(anchored) });
  const outcome = await cascade.run(system, buildProposeUser(input));
  if (!outcome.ok) return null;
  const draft = parseDraft(extractFirstJSON(outcome.content));
  return draft === null ? null : { draft, model: outcome.model };
}
