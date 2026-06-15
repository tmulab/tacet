import type { Claim } from "./types.js";
import type { ConvergenceMap, ClaimSignal } from "./convergence.js";
import type { MeasuredCoverageAudit } from "./coverage.js";

/**
 * The deterministic factual skeleton (B4, passo 0). ZERO LLM, no I/O, pure.
 *
 * It reduces a frozen replay fixture to a flat list of Assertion objects — the
 * ONLY facts a coerced narrative is allowed to verbalize. Every assertion carries
 * the structure node it was read from (traceability) and the numbers / coverage
 * tokens it sanctions, so the narrative verifier (narrative-verify.ts) can prove
 * the prose never says a number or a coverage gap the structure does not hold.
 *
 * Determinism is the contract: same fixture → same skeleton, byte-identical
 * (assertions emitted in a fixed order; arrays read in their frozen order). The
 * skeleton certifies COHERENCE of the structure→prose relation, never truth.
 */

export type AssertionKind =
  | "count"
  | "present"
  | "empty-chair"
  | "not-measured"
  | "gate-status"
  | "gate-fraction"
  | "abstention"
  | "robust-core-source";

export interface Assertion {
  readonly kind: AssertionKind;
  /** Canonical phrasing the narrator must verbalize — the fact, nothing more. */
  readonly text: string;
  /** Traceability: the structure node this fact was read from. */
  readonly sourceNode: string;
  /** Numbers this assertion sanctions (digit-form fidelity, guard 1a). */
  readonly numbers: readonly number[];
  /** "dimension=value" coverage tokens this assertion sanctions (guard 1c). */
  readonly values: readonly string[];
  /** Controlled-vocabulary relevance status this assertion sanctions (guard 1b). */
  readonly status?: string;
}

export type NarrativeSkeleton = readonly Assertion[];

export interface SkeletonInput {
  readonly claims: readonly Claim[];
  readonly relevanceGate?: { readonly status: string; readonly alignedFraction: number } | null;
  readonly abstentionDiagnosis?: string | null;
  readonly derived: {
    readonly convergenceMap: ConvergenceMap;
    readonly coverageAudit: MeasuredCoverageAudit;
  };
}

const SIGNALS: readonly ClaimSignal[] = ["robust-core", "live-crux", "unsupported"];
const tok = (dimension: string, value: string): string => `${dimension}=${value}`;

/** Build the factual skeleton. Pure and deterministic. */
export function buildSkeleton(input: SkeletonInput): NarrativeSkeleton {
  const out: Assertion[] = [];
  const { convergenceMap: map, coverageAudit: cov } = input.derived;

  // 1. structural counts (claims, then the three signals in fixed order).
  out.push({ kind: "count", text: `claims judged: ${input.claims.length}`, sourceNode: "claims", numbers: [input.claims.length], values: [] });
  const tally = map.verdicts.reduce<Record<string, number>>((a, v) => ((a[v.signal] = (a[v.signal] ?? 0) + 1), a), {});
  for (const s of SIGNALS) {
    const n = tally[s] ?? 0;
    out.push({ kind: "count", text: `${s}: ${n}`, sourceNode: "derived.convergenceMap", numbers: [n], values: [] });
  }

  // 2. present coverage (measured, observed > 0) — proof the corpus is not vacuous.
  for (const f of cov.findings) {
    if (f.measurability === "measured" && (f.observedSources ?? 0) > 0) {
      const k = tok(f.dimension, f.value);
      out.push({ kind: "present", text: `present coverage: ${k} (${f.observedSources} sources observed)`, sourceNode: "derived.coverageAudit.findings", numbers: [f.observedSources ?? 0], values: [k] });
    }
  }

  // 3. empty chairs (measured, zero observed) + their count.
  for (const f of cov.emptyChairs) {
    const k = tok(f.dimension, f.value);
    out.push({ kind: "empty-chair", text: `empty chair: ${k} (0 observed)`, sourceNode: "derived.coverageAudit.emptyChairs", numbers: [0], values: [k] });
  }
  out.push({ kind: "count", text: `empty chairs: ${cov.emptyChairs.length}`, sourceNode: "derived.coverageAudit.emptyChairs", numbers: [cov.emptyChairs.length], values: [] });

  // 4. not-measured dimensions (no dim=value token — long content-inference labels
  //    are summarised by dimension + count, never reproduced verbatim into prose).
  if (cov.notMeasured.length > 0) {
    const dims = [...new Set(cov.notMeasured.map((f) => f.dimension))];
    out.push({
      kind: "not-measured",
      text: `not measured: ${cov.notMeasured.length} category(ies) under dimension(s) [${dims.join(", ")}] — need content inference, never guessed`,
      sourceNode: "derived.coverageAudit.notMeasured",
      numbers: [cov.notMeasured.length],
      values: [],
    });
  }

  // 5. relevance gate (status + exact fraction).
  if (input.relevanceGate != null) {
    out.push({ kind: "gate-status", text: `relevance gate: ${input.relevanceGate.status}`, sourceNode: "relevanceGate", numbers: [], values: [], status: input.relevanceGate.status });
    out.push({ kind: "gate-fraction", text: `lexical overlap fraction: ${input.relevanceGate.alignedFraction}`, sourceNode: "relevanceGate", numbers: [input.relevanceGate.alignedFraction], values: [] });
  }

  // 6. abstention diagnosis (vocabulary disjoint from the relevance status set).
  out.push({ kind: "abstention", text: `abstention diagnosis: ${input.abstentionDiagnosis ?? "none"}`, sourceNode: "abstentionDiagnosis", numbers: [], values: [] });

  // 7. robust-core sources (DOI/locator per converged claim — provenance, not theme).
  const byId = new Map(input.claims.map((c) => [c.id, c]));
  for (const v of map.verdicts) {
    if (v.signal !== "robust-core") continue;
    const loc = byId.get(v.claimId)?.provenance[0]?.locator ?? "(no locator)";
    out.push({ kind: "robust-core-source", text: `robust-core source: ${loc}`, sourceNode: `claims/${v.claimId}/provenance`, numbers: [], values: [] });
  }

  return out;
}

/** The union of all numbers the skeleton sanctions (guard 1a basis). */
export function sanctionedNumbers(skeleton: NarrativeSkeleton): ReadonlySet<number> {
  const s = new Set<number>();
  for (const a of skeleton) for (const n of a.numbers) s.add(n);
  return s;
}

/** The union of all "dimension=value" coverage tokens the skeleton sanctions. */
export function sanctionedValues(skeleton: NarrativeSkeleton): ReadonlySet<string> {
  const s = new Set<string>();
  for (const a of skeleton) for (const v of a.values) s.add(v);
  return s;
}

/** The relevance-gate statuses the skeleton sanctions (guard 1b basis). */
export function sanctionedStatuses(skeleton: NarrativeSkeleton): ReadonlySet<string> {
  const s = new Set<string>();
  for (const a of skeleton) if (a.kind === "gate-status" && a.status !== undefined) s.add(a.status);
  return s;
}
