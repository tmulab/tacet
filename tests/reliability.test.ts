import { describe, it, expect } from "vitest";
import { buildReliabilityProfile, shouldAbstain } from "../src/domain/reliability.js";
import type { CitationGraph } from "../src/domain/reliability.js";
import type { ReliabilityProfile } from "../src/domain/convergence.js";
import type { Claim, ReaderJudgement } from "../src/domain/types.js";

/**
 * TDD-first. Contract is the JSDoc of ReliabilityProfile / AxisValue /
 * shouldAbstain. Locked here BEFORE implementation:
 *   - traceability (measured): true iff at least one reader cited a source
 *   - independentCorroboration (measured): count of independent components in
 *     the citation graph over the claim's sources (mutual citers collapse)
 *   - agreementFromDoubt (measured): the ClaimSignal handed in (not recomputed);
 *     not-measured when null (no two-reader signal)
 *   - internalContestation (Phase 5b): measured from reader disagreement when
 *     two judgements exist; not-measured with fewer (graceful degradation)
 *   - shouldAbstain: structural, no magic number — abstain iff traceability is
 *     measured-false AND agreementFromDoubt is measured-unsupported; not-measured
 *     axes count neither for nor against.
 */

const prov = (sourceId: string) => ({ sourceId, locator: `loc:${sourceId}` });
const claimWith = (id: string, sourceIds: readonly string[]): Claim => ({
  id,
  text: `claim ${id}`,
  provenance: sourceIds.map(prov),
});
const judge = (
  readerId: string,
  claimId: string,
  lean: ReaderJudgement["lean"],
  citedSources: readonly string[],
): ReaderJudgement => ({ readerId, readerModel: "stub", claimId, lean, citedSources, rationale: "t" });

const empty: CitationGraph = {};

describe("buildReliabilityProfile — axes", () => {
  it("traceability is measured-true when at least one reader cited a source", () => {
    const js = [judge("a", "c1", "supports", ["s1"]), judge("b", "c1", "insufficient", [])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1"]), js, "unsupported", empty);
    expect(p.traceability).toEqual({ kind: "measured", value: true });
  });

  it("traceability is measured-false when both readers cited nothing", () => {
    const js = [judge("a", "c1", "insufficient", []), judge("b", "c1", "insufficient", [])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1"]), js, "unsupported", empty);
    expect(p.traceability).toEqual({ kind: "measured", value: false });
  });

  it("independentCorroboration counts independent (non-citing) sources separately", () => {
    const js = [judge("a", "c1", "supports", ["s1"]), judge("b", "c1", "supports", ["s2"])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1", "s2"]), js, "robust-core", empty);
    expect(p.independentCorroboration).toEqual({ kind: "measured", value: 2 });
  });

  it("independentCorroboration collapses mutually-citing sources into one component", () => {
    const graph: CitationGraph = { s1: ["s2"] }; // s1 cites s2 → correlated
    const js = [judge("a", "c1", "supports", ["s1"]), judge("b", "c1", "supports", ["s2"])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1", "s2"]), js, "robust-core", graph);
    expect(p.independentCorroboration).toEqual({ kind: "measured", value: 1 });
  });

  it("independentCorroboration: two correlated + one independent → 2 components", () => {
    const graph: CitationGraph = { s2: ["s1"] }; // s1,s2 correlated; s3 alone
    const js = [judge("a", "c1", "supports", ["s1"]), judge("b", "c1", "supports", ["s3"])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1", "s2", "s3"]), js, "robust-core", graph);
    expect(p.independentCorroboration).toEqual({ kind: "measured", value: 2 });
  });

  it("agreementFromDoubt is the ClaimSignal handed in, not recomputed", () => {
    const js = [judge("a", "c1", "supports", ["s1"]), judge("b", "c1", "contradicts", ["s1"])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1"]), js, "live-crux", empty);
    expect(p.agreementFromDoubt).toEqual({ kind: "measured", value: "live-crux" });
  });

  it("(f) internalContestation lights up MEASURED-true when the two readers diverge", () => {
    const js = [judge("a", "c1", "supports", ["s1"]), judge("b", "c1", "contradicts", ["s1"])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1"]), js, "live-crux", empty);
    expect(p.internalContestation).toEqual({ kind: "measured", value: true });
  });

  it("(g) internalContestation is MEASURED-false when the two readers converge", () => {
    const js = [judge("a", "c1", "supports", ["s1"]), judge("b", "c1", "supports", ["s1"])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1"]), js, "robust-core", empty);
    expect(p.internalContestation).toEqual({ kind: "measured", value: false });
  });

  it("(h) internalContestation degrades to not-measured with only one reader", () => {
    const js = [judge("a", "c1", "supports", ["s1"])]; // the other reader fell back
    const p = buildReliabilityProfile(claimWith("c1", ["s1"]), js, null, empty);
    expect(p.internalContestation).toEqual({ kind: "not-measured" });
  });

  it("agreementFromDoubt is not-measured when there is no two-reader signal (null)", () => {
    const js = [judge("a", "c1", "supports", ["s1"])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1"]), js, null, empty);
    expect(p.agreementFromDoubt).toEqual({ kind: "not-measured" });
  });
});

describe("shouldAbstain", () => {
  it("abstains when traceability is false AND agreement is unsupported", () => {
    const js = [judge("a", "c1", "insufficient", []), judge("b", "c1", "insufficient", [])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1"]), js, "unsupported", empty);
    expect(shouldAbstain(p)).toBe(true);
  });

  it("does not abstain when a measured axis is positive (traceability true)", () => {
    const js = [judge("a", "c1", "supports", ["s1"]), judge("b", "c1", "insufficient", [])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1"]), js, "unsupported", empty);
    expect(shouldAbstain(p)).toBe(false);
  });

  it("does not abstain when agreement is not unsupported (e.g. robust-core)", () => {
    const js = [judge("a", "c1", "insufficient", []), judge("b", "c1", "insufficient", [])];
    const p = buildReliabilityProfile(claimWith("c1", ["s1"]), js, "robust-core", empty);
    expect(shouldAbstain(p)).toBe(false);
  });

  it("a not-measured axis counts neither for nor against (does not trigger abstention)", () => {
    const p: ReliabilityProfile = {
      claimId: "c1",
      traceability: { kind: "not-measured" },
      independentCorroboration: { kind: "not-measured" },
      internalContestation: { kind: "not-measured" },
      agreementFromDoubt: { kind: "measured", value: "unsupported" },
    };
    expect(shouldAbstain(p)).toBe(false);
  });
});
