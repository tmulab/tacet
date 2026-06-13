import { describe, it, expect } from "vitest";
import { buildConvergenceMap } from "../src/domain/convergence.js";
import type { ReaderJudgement } from "../src/domain/types.js";

/**
 * TDD-first (Akita Rule 1). These tests define the contract of the convergence
 * map BEFORE it is implemented. They will fail until buildConvergenceMap is
 * written — that is intended. The contract:
 *   - same supporting lean from both readers  → robust-core
 *   - opposite leans                           → live-crux
 *   - any "insufficient"                       → unsupported
 *   - claim-id mismatch between the two lists  → throws (never silent)
 */

const j = (claimId: string, lean: ReaderJudgement["lean"]): ReaderJudgement => ({
  claimId,
  lean,
  citedSources: lean === "insufficient" ? [] : ["s1"],
  rationale: "test",
});

describe("buildConvergenceMap", () => {
  it("marks robust-core when both readers converge on supports", () => {
    const map = buildConvergenceMap([j("c1", "supports")], [j("c1", "supports")]);
    expect(map.verdicts[0]?.signal).toBe("robust-core");
  });

  it("marks robust-core when both converge on contradicts", () => {
    const map = buildConvergenceMap([j("c1", "contradicts")], [j("c1", "contradicts")]);
    expect(map.verdicts[0]?.signal).toBe("robust-core");
  });

  it("marks live-crux when readers take opposite leans", () => {
    const map = buildConvergenceMap([j("c1", "supports")], [j("c1", "contradicts")]);
    expect(map.verdicts[0]?.signal).toBe("live-crux");
  });

  it("marks unsupported when either reader finds the evidence insufficient", () => {
    const map = buildConvergenceMap([j("c1", "supports")], [j("c1", "insufficient")]);
    expect(map.verdicts[0]?.signal).toBe("unsupported");
  });

  it("records each reader's lean in the verdict", () => {
    const map = buildConvergenceMap([j("c1", "supports")], [j("c1", "contradicts")]);
    const leans = map.verdicts[0]?.leans ?? {};
    expect(Object.values(leans)).toContain("supports");
    expect(Object.values(leans)).toContain("contradicts");
  });

  it("throws when the two readers cover different claim ids (never silent)", () => {
    expect(() => buildConvergenceMap([j("c1", "supports")], [j("c2", "supports")])).toThrow();
  });
});
