import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildSkeleton } from "../domain/narrative-skeleton.js";
import type { NarrativeSkeleton, SkeletonInput } from "../domain/narrative-skeleton.js";
import { verifyNarrative } from "../domain/narrative-verify.js";
import type { NarrativeGuards } from "../domain/narrative-verify.js";
import { Cascade } from "../llm/cascade.js";
import { FREE_MODELS, openRouterTransport } from "../llm/openrouter.js";

/**
 * Coerced narration (B4, passo 1). The LLM only STITCHES: it is handed the
 * deterministic skeleton (Assertion list) and an OPAQUE case id — never the topic,
 * the abstracts, or the ruler. Context starvation is the primary defense against
 * thematic contamination; the verifier (narrative-verify) is the proof. The facts
 * never pass through the model — only the prose connecting them does. Coherence,
 * not truth.
 *
 * Usage: npm run narrate   (generates + verifies + freezes all structured cases)
 */

export const CONSTRAINT_NOTE =
  "This narration is constrained to the measured structure; coherence, not truth.";

/** Per-case thematic ban list — domain terms the structure does NOT sanction.
 * Partial by design (guard 2 is named partial); the verifier auto-exempts any term
 * the skeleton itself states. Keyed by fixture; the prompt sees only `opaque`. */
export interface NarrateCase {
  readonly fixture: string;
  readonly opaque: string;
  readonly banned: readonly string[];
}

const COVID = ["zoonotic", "zoonosis", "zoonoses", "lab leak", "lab-leak", "wuhan", "pangolin", "sars", "sars-cov-2", "coronavirus", "covid", "covid-19", "pandemic", "virus", "spillover", "wet market", "gain-of-function", "furin", "origin"];
const EGGS = ["egg", "eggs", "cholesterol", "cardiovascular", "dietary", "heart", "ldl", "hdl", "diet", "nutrition", "serum", "coronary"];
const LHC = ["collider", "black hole", "black-hole", "hawking", "strangelet", "cern", "lhc", "accelerator", "particle", "giddings", "mangano", "plaga", "doomsday", "cosmic ray", "micro black"];
const FREUD = ["freud", "freudian", "psychoanalysis", "psychoanalytic", "libidinal", "marx", "marxist", "capital", "capitalism", "capitalist", "clinic", "clinical", "tomsic", "midas", "surplus", "commodity", "unconscious", "money"];

export const NARRATE_CASES: readonly NarrateCase[] = [
  { fixture: "sago-origin-v0.1.json", opaque: "case-01", banned: COVID },
  { fixture: "sago-origin-v0.2.json", opaque: "case-02", banned: COVID },
  { fixture: "eggs-cv-v0.1.json", opaque: "case-03", banned: EGGS },
  { fixture: "lhc-origin-v0.1.json", opaque: "case-04", banned: LHC },
  { fixture: "lhc-safety-anchored-v0.1.json", opaque: "case-05", banned: LHC },
  { fixture: "lhc-objection-anchored-v0.1.json", opaque: "case-06", banned: LHC },
  { fixture: "lhc-anchored-ingested-v0.1.json", opaque: "case-07", banned: LHC },
  { fixture: "freud-midas-derived-v0.1.json", opaque: "case-08", banned: FREUD },
  { fixture: "freud-midas-focused-v0.1.json", opaque: "case-09", banned: FREUD },
];

const SYSTEM =
  "You are a constrained NARRATOR for an epistemic measurement engine. You receive a " +
  "list of ASSERTIONS — measured facts about one analysis run, identified only by an " +
  "opaque case id. Verbalize them as readable prose for a human.\n" +
  "RULES (inviolable):\n" +
  "1. Say ONLY what the assertions state. Add no fact, number, name, place, author, or concept not present.\n" +
  "2. Do NOT infer or guess the topic/domain — you are not told it and must not name it.\n" +
  "3. Write every count and the fraction as DIGITS, exactly as given; call the fraction the 'lexical overlap fraction'.\n" +
  "4. You may write coverage gaps in the 'dimension=value' form exactly as given (e.g. language=pt); invent none.\n" +
  "5. Connect the assertions with plain transitions; no rhetoric, no verdict on truth.\n" +
  "6. Finish with one sentence stating the narration is constrained to the measured structure; coherence, not truth.\n" +
  'Return STRICT JSON only: {"prose": string, "mapping": [{"sentence": string, "assertions": number[]}]} ' +
  "where each assertions entry is 0-based indices into the assertion list.";

/** Build the (system, user) prompt. The user message carries ONLY the opaque id
 * and the numbered assertion texts — never sourceNode, theme, or ruler. Pure. */
export function buildNarratePrompt(skeleton: NarrativeSkeleton, opaqueId: string): { system: string; user: string } {
  const lines = skeleton.map((a, i) => `${i}: ${a.text}`).join("\n");
  return { system: SYSTEM, user: `Case ${opaqueId}. Assertions:\n${lines}` };
}

export interface Narration {
  readonly prose: string;
  readonly mapping: readonly { readonly sentence: string; readonly assertions: readonly number[] }[];
}

/** Tolerant JSON parse: extract the first {...} block and validate the shape. */
export function parseNarration(content: string): Narration | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof o["prose"] !== "string") return null;
    const mapping = Array.isArray(o["mapping"]) ? (o["mapping"] as Narration["mapping"]) : [];
    return { prose: o["prose"], mapping };
  } catch {
    return null;
  }
}

/** Ensure the prose ends with the canonical constraint note exactly once. If the
 * model already declared "coherence, not truth", keep it; otherwise drop any
 * dangling "constrained to the measured structure" fragment and append the note. */
export function assembleProse(prose: string): string {
  const t = prose.trim();
  if (/coherence,\s*not\s*truth\.?\s*$/i.test(t)) return t;
  const stripped = t.replace(/\s*(?:this|the) narration is constrained to the measured structure\.?\s*$/i, "").trim();
  return `${stripped} ${CONSTRAINT_NOTE}`.trim();
}

export interface GeneratedNarrative extends Narration {
  readonly guards: NarrativeGuards;
  readonly attempts: number;
}

/** Generate one coerced narrative with an injected completion fn (transport for
 * the cascade in main, a stub in tests). Retries with a corrective note when a
 * guard fails; returns the best attempt (guards reported either way). */
export async function generateNarrative(
  skeleton: NarrativeSkeleton,
  opaqueId: string,
  banned: readonly string[],
  complete: (system: string, user: string) => Promise<string>,
  maxAttempts = 3,
): Promise<GeneratedNarrative> {
  const { system, user } = buildNarratePrompt(skeleton, opaqueId);
  let last: GeneratedNarrative | null = null;
  let correction = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const content = await complete(system, user + correction);
    const parsed = parseNarration(content) ?? { prose: content, mapping: [] };
    const prose = assembleProse(parsed.prose);
    const guards = verifyNarrative(prose, skeleton, banned);
    last = { prose, mapping: parsed.mapping, guards, attempts: attempt };
    if (guards.pass) return last;
    correction =
      "\n\nYour previous draft FAILED verification: " +
      [...guards.numericFidelity.violations, ...guards.thematic.violations].join("; ") +
      ". Re-draft using ONLY the assertions; remove every flagged item.";
  }
  return last as GeneratedNarrative;
}

async function main(): Promise<void> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) throw new Error("OPENROUTER_API_KEY required (narration is a prep step, run once)");
  const transport = openRouterTransport(apiKey);
  const cascade = new Cascade(FREE_MODELS, transport, { validate: (c) => parseNarration(c) !== null });
  let lastModel = "unknown";
  const complete = async (system: string, user: string): Promise<string> => {
    const r = await cascade.run(system, user);
    lastModel = r.model;
    return r.content;
  };

  const root = fileURLToPath(new URL("../../fixtures/replay/", import.meta.url));
  for (const c of NARRATE_CASES) {
    const fx = JSON.parse(readFileSync(root + c.fixture, "utf8")) as SkeletonInput & { case: string; version?: string };
    const skeleton = buildSkeleton(fx);
    const gen = await generateNarrative(skeleton, c.opaque, c.banned, complete);
    const out = {
      schema: "tacet/narrative@0.1",
      case: fx.case,
      opaqueId: c.opaque,
      fixture: c.fixture,
      version: fx.version ?? "0.1",
      prose: gen.prose,
      mapping: gen.mapping,
      skeleton,
      banned: c.banned,
      guards: gen.guards,
      model: lastModel,
      constraintNote: CONSTRAINT_NOTE,
    };
    const outPath = root + c.fixture.replace(/\.json$/, ".narrative.json");
    writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
    const g = gen.guards;
    console.log(`${c.fixture}: guards ${g.pass ? "PASS" : "FAIL"} (attempts ${gen.attempts}) num=${g.numericFidelity.pass} thematic=${g.thematic.pass}` + (g.pass ? "" : ` :: ${[...g.numericFidelity.violations, ...g.thematic.violations].join("; ")}`));
  }
}

const entry = process.argv[1];
if (entry !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(entry)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
