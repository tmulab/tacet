import type { Claim } from "./types.js";

/**
 * The empty chair — a MEASURED gap in the evidence base, not "a missing
 * debater" (the readers are undecided, not position-bound). The audit asks:
 * which pertinent perspective has NO corpus represented in the material the
 * readers actually read?
 *
 * It is reported as observed-versus-expected coverage across categories
 * (language family, geographic locus, stakeholder class, source genre), each
 * expected category justified by a CITED coverage rule stated in advance — not
 * by our opinion. An expected category with zero observed sources is an empty
 * chair.
 */

/** A coverage rule: a category the protocol expects to be represented, with a
 * citable justification for why it is pertinent to THIS dispute. Stated in
 * advance so the baseline is cited, not improvised post-hoc. */
export interface ExpectedCategory {
  readonly dimension: string; // e.g. "language-family"
  readonly value: string; // e.g. "non-anglophone"
  readonly justification: string; // citable reason this is pertinent
}

export interface CoverageFinding {
  readonly dimension: string;
  readonly value: string;
  readonly observedSources: number;
  readonly expected: boolean;
  /** an empty chair = expected, but observedSources === 0 */
  readonly isEmptyChair: boolean;
  readonly justification: string;
}

export interface CoverageAudit {
  readonly findings: readonly CoverageFinding[];
  readonly emptyChairs: readonly CoverageFinding[];
}

/**
 * Audits coverage of the evidence base against a stated set of expected
 * categories.
 *
 * CONTRACT (locked by tests):
 *  - counts observed sources per (dimension,value) from claim provenance tags
 *  - any expected category with zero observed sources → empty chair
 *  - never invents expected categories; only those passed in (baseline is cited)
 *  - descriptive only: reports the gap, does NOT conclude what the gap "means"
 *
 * One finding per expected category, in input order — so `expected` is true for
 * every finding here (we audit only the cited baseline; reporting observed-but-
 * unexpected categories is deliberately out of scope). The output carries no
 * field that interprets the gap; the human reader interprets.
 */
export function auditCoverage(
  claims: readonly Claim[],
  expected: readonly ExpectedCategory[],
): CoverageAudit {
  const findings: CoverageFinding[] = expected.map((category) => {
    const observedSources = countObservedSources(claims, category.dimension, category.value);
    return {
      dimension: category.dimension,
      value: category.value,
      observedSources,
      expected: true,
      isEmptyChair: observedSources === 0,
      justification: category.justification,
    };
  });
  const emptyChairs = findings.filter((f) => f.isEmptyChair);
  return { findings, emptyChairs };
}

/** Counts distinct sources (by sourceId) whose provenance tags match
 * (dimension,value). The same source cited across several claims counts once. */
function countObservedSources(
  claims: readonly Claim[],
  dimension: string,
  value: string,
): number {
  const sourceIds = new Set<string>();
  for (const claim of claims) {
    for (const p of claim.provenance) {
      if (p.tags?.[dimension] === value) {
        sourceIds.add(p.sourceId);
      }
    }
  }
  return sourceIds.size;
}
