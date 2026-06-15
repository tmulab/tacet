/**
 * Uplift rubric (FASE C, passo 1). Pure, no I/O. The instrument the JUDGE uses to
 * compare a TACET coerced narrative against a deep-research baseline on the SAME
 * sub-question.
 *
 * It is honest by construction: it does NOT measure COMPLETENESS (deep-research
 * reads paywalled books and non-CC-BY sources TACET never touches, and wins there).
 * It measures the crit-1 axes where TACET's discipline is the advantage —
 * verifiable fidelity, uncertainty preservation, load-bearing visibility, and
 * hidden-dependency disclosure. Two axes are deterministic and tested; two are
 * judge rubrics (one carries a deterministic signal). We never crown a winner on
 * the judge axes. Coherence, not truth.
 */

export type DimensionMethod = "deterministic" | "semi-deterministic" | "judge" | "judge-with-signal";

export interface RubricDimension {
  readonly key: string;
  readonly title: string;
  readonly method: DimensionMethod;
  readonly criterion: string;
  /** Present ONLY for judge axes — a BLANK slot for the judge. No "winner" field:
   * the rubric never declares a victor on a subjective axis. */
  readonly judge?: { readonly verdict: null; readonly notes: null };
}

export const UPLIFT_RUBRIC: { readonly schema: string; readonly dimensions: readonly RubricDimension[] } = {
  schema: "tacet/uplift-rubric@0.1",
  dimensions: [
    {
      key: "verifiability",
      title: "Verifiable fidelity",
      method: "deterministic",
      criterion:
        "Fraction of factual claims that trace to a cited source that RESOLVES (a DOI/URL that exists). Measured automatically on both outputs; the raw fractions are reported without adjectives.",
    },
    {
      key: "uncertainty-preservation",
      title: "Uncertainty preservation",
      method: "semi-deterministic",
      criterion:
        "Does the output NAME what it does not know? TACET: explicit abstentions (unsupported, empty chair, not-assessed, not-measured). Baseline: hedge markers vs verdict markers (partially automated; the judge weighs the remainder).",
    },
    {
      key: "load-bearing-visibility",
      title: "Load-bearing evidence visibility",
      method: "judge",
      criterion:
        "Can the reader SEE which evidence carries the conclusion? Inspect each output: does it expose the specific sources its conclusion rests on, or assert conclusions without showing the load path? The judge rates each output.",
      judge: { verdict: null, notes: null },
    },
    {
      key: "hidden-dependency-disclosure",
      title: "Hidden-dependency disclosure",
      method: "judge-with-signal",
      criterion:
        "Does the output WARN when a source it depends on is non-verifiable/paywalled/outside the open corpus? Deterministic signal: the baseline cites sources TACET marked out-of-CC-BY (e.g. the ingested safety preprints) — if so it leans on a non-verifiable source; did it disclose that? The judge weighs it.",
      judge: { verdict: null, notes: null },
    },
  ],
};

// ---------------------------------------------------------------------------
// Deterministic measures.
// ---------------------------------------------------------------------------

const DOI_RE = /10\.\d{4,9}\/[^\s"'<>)\]]+/gi;
const URL_RE = /https?:\/\/[^\s"'<>)\]]+/gi;
const ARXIV_RE = /(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:\s*)(\d{4}\.\d{4,5})(v\d+)?/gi;

/** Extract citation strings (DOIs, arXiv ids, bare URLs) from free prose. */
export function extractCitations(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(DOI_RE)) out.add(m[0]);
  for (const m of text.matchAll(ARXIV_RE)) out.add(`arxiv:${m[1]}`);
  for (const m of text.matchAll(URL_RE)) if (!/arxiv\.org/i.test(m[0])) out.add(m[0]);
  return [...out];
}

/** Canonical key for matching: arXiv id, or DOI (lowercased), else the raw URL
 * stripped of scheme/trailing punctuation. */
export function normalizeCitation(c: string): string {
  const arx = /(\d{4}\.\d{4,5})/.exec(c.includes("arxiv") ? c : "");
  if (arx) return `arxiv:${arx[1]}`;
  const doi = /(10\.\d{4,9}\/[^\s"'<>)\]]+)/i.exec(c);
  if (doi && doi[1] !== undefined) return `doi:${doi[1].toLowerCase().replace(/[.,;]+$/, "")}`;
  return c.replace(/^https?:\/\//i, "").replace(/[/.,;]+$/, "").toLowerCase();
}

export interface VerifiabilityResult {
  readonly total: number;
  readonly resolved: number;
  readonly fraction: number;
}

/** Fraction of unique citations that resolve. `resolves` is injected (a stub in
 * tests; the real HTTP check is I/O, supplied by compare-uplift at freeze time). */
export function verifiability(citations: readonly string[], resolves: (c: string) => boolean): VerifiabilityResult {
  const unique = [...new Set(citations.map(normalizeCitation))];
  const resolved = unique.filter((c) => resolves(c)).length;
  return { total: unique.length, resolved, fraction: unique.length === 0 ? 0 : Number((resolved / unique.length).toFixed(3)) };
}

export interface TacetAbstentions {
  readonly unsupported: number;
  readonly emptyChairs: number;
  readonly notMeasured: number;
  readonly gateNotAssessed: number;
  readonly total: number;
}

/** Count TACET's explicit abstentions from the frozen structure (the narrative
 * verbalizes exactly these). Deterministic. */
export function countTacetAbstentions(input: {
  readonly unsupported: number;
  readonly emptyChairs: number;
  readonly notMeasured: number;
  readonly gateStatus: string | null | undefined;
}): TacetAbstentions {
  const gateNotAssessed = input.gateStatus === "not-assessed" ? 1 : 0;
  return {
    unsupported: input.unsupported,
    emptyChairs: input.emptyChairs,
    notMeasured: input.notMeasured,
    gateNotAssessed,
    total: input.unsupported + input.emptyChairs + input.notMeasured + gateNotAssessed,
  };
}

// Hedge / verdict markers. Bilingual EN+PT (the eggs baseline is Portuguese, the
// LHC baseline English). LIMITATION (named, D1-adjacent): a lexical marker list is
// a PROXY and EN+PT only; other languages and paraphrased hedging are future work.
const HEDGE = [
  "uncertain", "may ", "might", "could", "possibly", "unclear", "debated", "not established", "insufficient", "remains open", "no consensus", "cannot be ruled out", "limited evidence", "appears to", "is likely", "unknown", "inconclusive", "suggest",
  "incerto", "pode ", "poderia", "possivelmente", "talvez", "sugere", "parece", "não está claro", "nao esta claro", "limitad", "inconclus", "não há consenso", "nao ha consenso", "evidência limitada", "heterogene", "depende",
];
const VERDICT = [
  "proven", "conclusively", "definitely", "certainly", "is safe", "no risk", "ruled out", "established that", "demonstrates that", "poses no", "completely safe", "there is no danger", "guaranteed",
  "comprovado", "conclusivamente", "definitivamente", "certamente", "é seguro", "e seguro", "sem risco", "descartad", "demonstra que", "garantid", "está provado", "esta provado",
];

export interface UncertaintyCount {
  readonly hedges: number;
  readonly verdicts: number;
}

const countMarkers = (text: string, markers: readonly string[]): number => {
  const lower = text.toLowerCase();
  let n = 0;
  for (const m of markers) {
    const re = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    n += (lower.match(re) ?? []).length;
  }
  return n;
};

/** Count hedge vs verdict markers in baseline prose (the automatable part). */
export function countBaselineUncertainty(text: string): UncertaintyCount {
  return { hedges: countMarkers(text, HEDGE), verdicts: countMarkers(text, VERDICT) };
}

export interface HiddenDependency {
  readonly outOfCcby: readonly string[];
  readonly idMatches: readonly string[];
  readonly nameMentions: readonly string[];
  readonly count: number;
}

/** Deterministic hidden-dependency signal: does the baseline cite a source TACET
 * marked out-of-CC-BY (by id), and/or name an out-of-CC-BY author? */
export function hiddenDependencySignal(
  baselineText: string,
  outOfCcbyIds: readonly string[],
  outOfCcbyNames: readonly string[] = [],
): HiddenDependency {
  const baselineKeys = new Set(extractCitations(baselineText).map(normalizeCitation));
  const wanted = outOfCcbyIds.map(normalizeCitation);
  const idMatches = [...new Set(wanted.filter((k) => baselineKeys.has(k)))];
  const lower = baselineText.toLowerCase();
  const nameMentions = outOfCcbyNames.filter((n) => new RegExp(`\\b${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower));
  return { outOfCcby: wanted, idMatches, nameMentions, count: idMatches.length };
}
