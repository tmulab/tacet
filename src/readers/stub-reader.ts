import type { Claim, Lean, ReaderJudgement } from "../domain/types.js";
import type { Reader } from "./reader.js";

/** A claimId → lean map, the StubReader's predefined stance over a claim set. */
export type LeanMap = Readonly<Record<string, Lean>>;

/**
 * Deterministic Reader for TDD and replay mode. Constructed with a fixed
 * claimId → lean map; returns the matching {@link ReaderJudgement} per claim.
 * No I/O, no randomness, no model call — this is what makes replay reproducible.
 *
 * Like every Reader it certifies COHERENCE over the cited evidence, never
 * TRUTH, and starts each case undecided: the leans are supplied by the fixture,
 * not invented here.
 */
export class StubReader implements Reader {
  readonly id: string;
  private readonly leans: LeanMap;

  constructor(id: string, leans: LeanMap) {
    this.id = id;
    this.leans = leans;
  }

  async read(claims: readonly Claim[]): Promise<readonly ReaderJudgement[]> {
    return claims.map((claim) => this.judge(claim));
  }

  private judge(claim: Claim): ReaderJudgement {
    const lean = this.leans[claim.id];
    if (lean === undefined) {
      throw new Error(
        `StubReader '${this.id}': no predefined lean for claim '${claim.id}' (never a silent guess)`,
      );
    }
    const citedSources =
      lean === "insufficient" ? [] : claim.provenance.map((p) => p.sourceId);
    return {
      readerId: this.id,
      readerModel: "stub",
      claimId: claim.id,
      lean,
      citedSources,
      rationale: `replay stub: lean '${lean}' over cited evidence; certifies coherence, not truth`,
    };
  }
}
