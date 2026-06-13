/**
 * TACET domain — foundational types.
 *
 * Pure domain. No I/O, no framework, no model calls. These names mirror the
 * production (Java) version so this prototype is its executable spec.
 *
 * A note on philosophy that constrains every type here: a reader certifies
 * COHERENCE, never TRUTH. Nothing in this module models "is this claim true".
 * It models how well the evidence supports a claim, and the structure of how
 * two undecided readers relate to it.
 */

/** A pointer to where a piece of evidence came from. We keep "how to reach the
 * source", not the raw third-party content. */
export interface Provenance {
  readonly sourceId: string;
  /** Human-citable reference (e.g. DOI, URL, archive locator). */
  readonly locator: string;
  /** ISO date of the source, when known. Time is METADATA, never a decision
   * rule — it informs the reliability profile and the final temporal layer,
   * it does not make a reader conclude "newer wins". */
  readonly date?: string;
  /** Coarse classification used by the coverage audit (language family,
   * geographic locus, stakeholder class, source genre). */
  readonly tags?: Readonly<Record<string, string>>;
}

/** An atomic assertion extracted from the evidence base, with its provenance. */
export interface Claim {
  readonly id: string;
  readonly text: string;
  readonly provenance: readonly Provenance[];
}

/** A reader's stance on a single claim, produced from the evidence and held
 * undecided at the outset. NOT a verdict on truth. */
export type Lean = "supports" | "contradicts" | "insufficient";

export interface ReaderJudgement {
  readonly claimId: string;
  readonly lean: Lean;
  /** Sources the reader could actually cite back to for this lean. If empty,
   * the claim is unsupported by the evidence the reader read. */
  readonly citedSources: readonly string[];
  /** Free-text rationale, grounded in cited sources. */
  readonly rationale: string;
}
