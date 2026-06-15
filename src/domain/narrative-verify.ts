import type { NarrativeSkeleton } from "./narrative-skeleton.js";
import { sanctionedNumbers, sanctionedValues, sanctionedStatuses } from "./narrative-skeleton.js";

/**
 * Narrative fidelity verifier (B4, passo 2). Pure, deterministic, no LLM.
 *
 * Guard 1 — fidelity (INEGOCIÁVEL, deterministic): every number, relevance-status
 * word, and coverage "dimension=value" token the prose utters must be one the
 * skeleton sanctions. An invented number, a swapped gate status, or an empty
 * chair the structure does not hold → FAIL.
 *
 * Guard 2 — thematic non-contamination (PARTIAL, honest): a per-case ban list of
 * domain terms the structure does not sanction (proper names, domain concepts).
 * If one appears → FAIL. LIMITATION (documented): this is a partial guard — total
 * coercion against contamination-by-entailment is future work. The PRIMARY defense
 * is context starvation: the narrator is never handed the topic, only the skeleton.
 *
 * Both guards certify COHERENCE of the prose↔structure relation, never truth.
 */

export interface GuardResult {
  readonly pass: boolean;
  readonly violations: readonly string[];
}

export interface NarrativeGuards {
  readonly numericFidelity: GuardResult;
  readonly thematic: GuardResult;
  readonly pass: boolean;
}

/** Controlled relevance-status vocabulary policed by guard 1b. "mixed" is omitted
 * deliberately: it is too common in ordinary prose to police without false
 * positives (a named limitation). aligned/drifted/not-assessed are distinctive. */
const POLICED_STATUS = ["aligned", "drifted", "not-assessed"] as const;

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/** Strip DOI / URL tokens so their embedded digits (years, volumes) are not
 * mistaken for invented counts. Locators are sanctioned provenance, not prose. */
function stripLocators(text: string): string {
  return text
    .replace(/https?:\/\/[^\s)]+/gi, " ")
    .replace(/\b(?:doi:)?10\.\d{3,}\/[^\s)]+/gi, " ");
}

/** Every digit-form number the prose utters (after locator stripping). */
function digitNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?<![A-Za-z0-9.])\d+(?:\.\d+)?(?![A-Za-z0-9])/g)) {
    out.push(Number(m[0]));
  }
  return out;
}

/** Small spelled-out numbers (zero..twelve) the prose utters. */
function wordNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    const n = NUMBER_WORDS[m[0]];
    if (n !== undefined) out.push(n);
  }
  return out;
}

/** Guard 1: numeric + status + coverage-token fidelity against the skeleton. */
export function verifyFidelity(prose: string, skeleton: NarrativeSkeleton): GuardResult {
  const violations: string[] = [];
  const numbers = sanctionedNumbers(skeleton);
  const values = sanctionedValues(skeleton);
  const statuses = sanctionedStatuses(skeleton);

  const stripped = stripLocators(prose);
  for (const n of [...digitNumbers(stripped), ...wordNumbers(stripped)]) {
    if (!numbers.has(n)) violations.push(`number not in skeleton: ${n}`);
  }

  // 1b — relevance status: a policed status word that is not the sanctioned one.
  const lower = prose.toLowerCase();
  for (const s of POLICED_STATUS) {
    if (new RegExp(`\\b${s}\\b`).test(lower) && !statuses.has(s)) {
      violations.push(`relevance status not in skeleton: ${s}`);
    }
  }

  // 1c — coverage tokens: any dimension=value uttered must be sanctioned.
  for (const m of prose.matchAll(/\b([a-z][a-z-]+)\s*=\s*([A-Za-z][\w/-]*)/g)) {
    const token = `${m[1]}=${m[2]}`.toLowerCase();
    if (!values.has(token)) violations.push(`coverage token not in skeleton: ${token}`);
  }

  return { pass: violations.length === 0, violations };
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Guard 2: no thematic term the structure does not sanction. Ban terms that the
 * skeleton itself states (e.g. a dimension name) are exempted automatically. */
export function verifyThematic(
  prose: string,
  skeleton: NarrativeSkeleton,
  banned: readonly string[],
): GuardResult {
  const skeletonText = skeleton.map((a) => a.text).join(" ").toLowerCase();
  const lower = prose.toLowerCase();
  const violations: string[] = [];
  for (const term of banned) {
    const t = term.toLowerCase();
    if (skeletonText.includes(t)) continue; // sanctioned by the structure
    if (new RegExp(`\\b${escapeRe(t)}\\b`).test(lower)) violations.push(`thematic term leaked: ${term}`);
  }
  return { pass: violations.length === 0, violations };
}

/** Both guards. The narrative is admissible only when BOTH pass. */
export function verifyNarrative(
  prose: string,
  skeleton: NarrativeSkeleton,
  banned: readonly string[],
): NarrativeGuards {
  const numericFidelity = verifyFidelity(prose, skeleton);
  const thematic = verifyThematic(prose, skeleton, banned);
  return { numericFidelity, thematic, pass: numericFidelity.pass && thematic.pass };
}
