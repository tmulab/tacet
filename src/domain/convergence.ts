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
 * CONTRACT (to be honored by the implementation + locked by tests):
 *  - converge on the same supporting lean  → robust-core
 *  - opposite leans (supports vs contradicts) → live-crux
 *  - any reader "insufficient"             → unsupported
 *  - the two judgement lists MUST cover the same claim ids; a mismatch is an
 *    error, never silently dropped.
 *
 * NOTE: skeleton. Implementation comes under TDD (tests first).
 */
export declare function buildConvergenceMap(
  a: readonly ReaderJudgement[],
  b: readonly ReaderJudgement[],
): ConvergenceMap;

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

/**
 * Claim-level abstention falls out of the profile, it is not a separate rule:
 * a reader abstains when the profile is weak across ALL measured axes. Defined
 * here as a pure predicate over the profile.
 *
 * NOTE: skeleton. Implementation + threshold semantics locked by tests.
 */
export declare function shouldAbstain(profile: ReliabilityProfile): boolean;
