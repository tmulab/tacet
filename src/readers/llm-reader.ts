import type { Claim, Lean, ReaderJudgement } from "../domain/types.js";
import type { Reader } from "./reader.js";
import { extractFirstJSON } from "../ingestion/llm.js";
import type { LlmTransport } from "../ingestion/llm.js";

/**
 * A prompt-backed Reader (Phase 5b), behind the same `Reader` interface as the
 * StubReader (R1 boundary). It reads a claim's structured evidence (centralClaim
 * + citedEvidence + summaryText, produced in 5a) and emits an honest lean on how
 * well that evidence SUPPORTS the claim — never on whether the claim is true.
 *
 * Position-agnostic: the system prompt assigns NO side. Two LlmReaders backed by
 * models from DIFFERENT companies read the SAME evidence with the SAME prompt;
 * their agreement is corroboration not reducible to one model's bias, their
 * divergence a real crux. The "external factor" is model independence, not
 * opposed instructions.
 *
 * Determinism / offline: the transport is INJECTED (default `fetchLLM`); tests
 * inject stubs. The reader runs only in the `read` prep script; replay reads
 * saved leans. A per-claim failure (HTTP/timeout, invalid JSON, lean outside the
 * enum) yields NO judgement for that claim from this reader — a graceful
 * fallback, never an exception. `insufficient` is a legitimate lean, not a
 * failure.
 */
export class LlmReader implements Reader {
  readonly id: string;
  /** The model string stamped onto every judgement's `readerModel`. */
  readonly model: string;
  private readonly transport: LlmTransport;
  /** The SHARED reference hypothesis both readers are anchored to (Phase 5c).
   * Injected into the system prompt so the lean is RELATIVE TO it, not to the
   * paper's own internal coherence. Per-case (not hardcoded): supplied by the
   * corpus. Empty for unit tests that exercise only JSON parsing. */
  private readonly referenceHypothesis: string;

  constructor(id: string, transport: LlmTransport, model: string = id, referenceHypothesis = "") {
    this.id = id;
    this.transport = transport;
    this.model = model;
    this.referenceHypothesis = referenceHypothesis;
  }

  async read(
    claims: readonly Claim[],
    onProgress?: (done: number, total: number, judgement: ReaderJudgement | null) => void,
  ): Promise<readonly ReaderJudgement[]> {
    const out: ReaderJudgement[] = [];
    let done = 0;
    for (const claim of claims) {
      const judgement = await this.judge(claim);
      if (judgement !== null) out.push(judgement); // omit on fallback
      done += 1;
      onProgress?.(done, claims.length, judgement);
    }
    return out;
  }

  /** Judge a single claim → a ReaderJudgement, or null on fallback (HTTP /
   * timeout, invalid JSON, lean outside the enum). Public so the prep
   * orchestrator can try a fallback reader on the claims this one failed. */
  async judge(claim: Claim): Promise<ReaderJudgement | null> {
    const prov = claim.provenance[0];
    const result = await this.transport(buildReaderSystem(this.referenceHypothesis), buildReaderUserContent(claim));
    if (!result.ok) return null; // HTTP / timeout → fallback

    const json = extractFirstJSON(result.content);
    const lean = parseLean(json?.["lean"]);
    if (lean === null) return null; // invalid JSON or lean outside enum → fallback

    return {
      readerId: this.id,
      readerModel: this.model,
      claimId: claim.id,
      lean,
      citedSources: prov?.sourceId !== undefined ? [prov.sourceId] : [],
      rationale: String(json?.["rationale"] ?? "").trim(),
    };
  }
}

/**
 * The reader's system prompt (Phase 5c). The lean is RELATIVE TO a shared
 * `referenceHypothesis` (injected, per-case — not hardcoded), NOT to the paper's
 * own internal coherence. Earlier (5b) the reader judged whether each abstract
 * supported its OWN central claim — and a published abstract is almost always
 * internally coherent, which flattened every lean to "supports". Anchoring to a
 * shared, recognizedly-inconclusive hypothesis lets ambiguous evidence pull the
 * two readers to genuinely different places. The doubt lives in the ANCHOR, not
 * in a planted persona: both readers get the SAME instruction, stay UNDECIDED
 * and position-agnostic, and use no outside knowledge.
 */
export function buildReaderSystem(referenceHypothesis: string): string {
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

function buildReaderUserContent(claim: Claim): string {
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

const LEANS: readonly Lean[] = ["supports", "contradicts", "insufficient"];

/** Parse a lean from model output; anything outside the enum → null (fallback).
 * We do NOT coerce an unknown value to a stance — that would fabricate a
 * position the reader never took. */
function parseLean(value: unknown): Lean | null {
  const s = String(value ?? "").trim().toLowerCase();
  return (LEANS as readonly string[]).includes(s) ? (s as Lean) : null;
}
