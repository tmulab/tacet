import type { Claim, ReaderJudgement } from "../domain/types.js";

/**
 * A Reader is a corpus-grounded evaluator that starts each case UNDECIDED
 * (no side assigned). It may cite, compare, and test coherence against the
 * evidence; it may NOT impersonate a person, advocate a position, or judge
 * truth.
 *
 * Implementations:
 *   - StubReader  — deterministic, no model call. Used for TDD and replay mode.
 *   - LlmReader   — prompt-backed, behind this same interface. Added later.
 *
 * The pipeline runs TWO readers over the SAME evidence. Their relation
 * (convergence / divergence) is the signal — never one reader's output alone.
 */
export interface Reader {
  /** Stable identifier (e.g. "reader-a"). Readers are roles, not brands. */
  readonly id: string;

  /**
   * Read the same evidence and form a judgement per claim, starting undecided.
   * MUST be deterministic for a StubReader so tests and replay are reproducible.
   */
  read(claims: readonly Claim[]): Promise<readonly ReaderJudgement[]>;
}
