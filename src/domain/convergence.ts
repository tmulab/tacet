import type { Lean, ReaderJudgement } from "./types.js";

/**
 * The three signals, at claim level, from two undecided readers reading the
 * same evidence:
 *   - "robust-core"  → both converged (evidence moved two honest doubts alike)
 *   - "live-crux"    → they diverged (evidence genuinely underdetermines)
 *   - "unsupported"  → at least one found the evidence insufficient
 *
 * This is a measurement of STRUCTURE, not a verdict on truth.
 */
export type ClaimSignal = "robust-core" | "live-crux" | "unsupported";

export interface ClaimVerdict {
  readonly claimId: string;
  readonly signal: ClaimSignal;
  readonly leans: Readonly<Record<string, Lean>>; // readerId -> lean
}

/** The map between the two readers across all claims. The product of the method. */
export interface ConvergenceMap {
  readonly verdicts: readonly ClaimVerdict[];
}

/**
 * Builds the convergence map from two readers' judgements over the same claims.
 *
 * CONTRACT (honored here, locked by tests):
 *  - converge on the same lean (both supports, or both contradicts) → robust-core
 *  - opposite leans (supports vs contradicts)                        → live-crux
 *  - any reader "insufficient"                                       → unsupported
 *  - the two judgement lists MUST cover the same claim ids; a mismatch is an
 *    error, never silently dropped.
 *
 * Juxtapose, never fuse: each reader's lean is preserved verbatim in the
 * verdict's `leans` map. The signal classifies the RELATION between the two
 * doubts; it does not collapse them into one voice. (Mirrors the production
 * orchestrator's C-2: dissent is the product, not consensus.)
 *
 * Each judgement carries its own `readerId`; the two reader ids are extracted
 * from the lists and must be internally uniform and mutually distinct.
 */
export function buildConvergenceMap(
  a: readonly ReaderJudgement[],
  b: readonly ReaderJudgement[],
): ConvergenceMap {
  const readerIdA = uniformReaderId(a, "A");
  const readerIdB = uniformReaderId(b, "B");
  if (readerIdA === readerIdB) {
    throw new Error(
      `convergence: both lists carry the same readerId '${readerIdA}' — need two distinct readers`,
    );
  }
  if (a.length !== b.length) {
    throw new Error(
      `convergence: reader judgement counts differ (${readerIdA}=${a.length}, ${readerIdB}=${b.length})`,
    );
  }
  const byIdB = new Map(b.map((j) => [j.claimId, j]));
  const verdicts: ClaimVerdict[] = a.map((ja) => {
    const jb = byIdB.get(ja.claimId);
    if (jb === undefined) {
      throw new Error(
        `convergence: claim id mismatch — '${ja.claimId}' judged by ${readerIdA} but not by ${readerIdB}`,
      );
    }
    return {
      claimId: ja.claimId,
      signal: classifySignal(ja.lean, jb.lean),
      leans: { [readerIdA]: ja.lean, [readerIdB]: jb.lean },
    };
  });
  return { verdicts };
}

/** Extracts the single readerId shared by every judgement in a list. An empty
 * list or a list that mixes readers is an error — never silent. */
function uniformReaderId(judgements: readonly ReaderJudgement[], side: string): string {
  const first = judgements[0];
  if (first === undefined) {
    throw new Error(`convergence: reader list ${side} is empty — no readerId to extract`);
  }
  for (const j of judgements) {
    if (j.readerId !== first.readerId) {
      throw new Error(
        `convergence: reader list ${side} mixes readerIds ('${first.readerId}' vs '${j.readerId}')`,
      );
    }
  }
  return first.readerId;
}

/** The three-signal classifier. Insufficient dominates; same lean converges;
 * opposite leans are a live crux. */
function classifySignal(a: Lean, b: Lean): ClaimSignal {
  if (a === "insufficient" || b === "insufficient") return "unsupported";
  if (a === b) return "robust-core";
  return "live-crux";
}

// ---------------------------------------------------------------------------

/**
 * The reliability profile: how well the evidence supports a claim. NEVER a
 * single fused score — that would smuggle the arbitrary back in through the
 * weights. It is a PROFILE of four juxtaposed axes. Each axis that cannot be
 * computed reliably reports "not-measured" rather than guessing (graceful
 * degradation). Reported side by side, like the bench: juxtapose, don't fuse.
 */
export type AxisValue<T> = { readonly kind: "measured"; readonly value: T } | { readonly kind: "not-measured" };

export interface ReliabilityProfile {
  readonly claimId: string;
  /** anchored to a source in the base? */
  readonly traceability: AxisValue<boolean>;
  /** count of NON-correlated sources supporting it (provenance graph). */
  readonly independentCorroboration: AxisValue<number>;
  /** does the base itself contain sources contradicting it? */
  readonly internalContestation: AxisValue<boolean>;
  /** did the two undecided readers converge or diverge? (same signal as the
   * map — reused by design, not oversight). */
  readonly agreementFromDoubt: AxisValue<ClaimSignal>;
}

// The reliability profile BUILDER and the `shouldAbstain` predicate live in
// `./reliability.ts` (kept separate to honor the ~200-line file limit and to
// keep the convergence map and the profile as distinct concerns). The types
// above (ReliabilityProfile, AxisValue) stay here per ARCHITECTURE.md.
