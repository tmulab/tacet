import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeReplay } from "../src/pipeline/replay.js";
import type { ReplayFixture } from "../src/pipeline/replay.js";
import type { ConvergenceMap, ReliabilityProfile } from "../src/domain/convergence.js";
import type { CoverageAudit } from "../src/domain/coverage.js";

/**
 * The two ANCHORED LHC regimes + the cross-anchor comparison (B1.5). The same
 * case, the same reused corpus, read under two canonical anchors of the dispute:
 * Giddings-Mangano (safety capstone) and Plaga (objection). Three maps, three
 * disciplines of evidence; the comparison shows which leans are anchor-robust and
 * which are anchor-dependent. 100% offline. Coherence, not truth.
 */

type AbstentionCategory = string; // local alias to avoid coupling the test to the union

interface AnchoredFixture extends ReplayFixture {
  readonly schema: string;
  readonly referenceHypothesis: string;
  readonly abstentionDiagnosis?: "adjacent" | "polarized" | "mixed" | null;
  readonly source: {
    readonly referenceHypothesis: string;
    readonly anchor?: { readonly file: string; readonly sha256: string; readonly locus?: string };
  };
  readonly derived: {
    readonly convergenceMap: ConvergenceMap;
    readonly coverageAudit: CoverageAudit;
    readonly reliabilityProfiles: readonly ReliabilityProfile[];
  };
}

const load = <T,>(p: string): T => JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/replay/${p}`, import.meta.url)), "utf8")) as T;

const safety = load<AnchoredFixture>("lhc-safety-anchored-v0.1.json");
const objection = load<AnchoredFixture>("lhc-objection-anchored-v0.1.json");
const regimeZero = load<AnchoredFixture>("lhc-origin-v0.1.json");

// sha256 of the canonical PDFs (fixed: provenance without redistributing bytes)
const SHA = {
  safety: "939f8daa4ce9a6e93712ddb4f21a3118fdc618dc4c7fd5eaea0171a74429e365",
  objection: "0f41a2c1385df8e03d9d05bc23f011aeb03a888836cb02638875db5dfa88260a",
};

describe.each([
  ["safety", safety, SHA.safety],
  ["objection", objection, SHA.objection],
])("anchored LHC regime — %s", (_name, fx, sha) => {
  it("loads and replay reproduces the baked answer key (offline)", async () => {
    const { map, coverage, profiles } = await computeReplay(fx);
    expect(map).toEqual(fx.derived.convergenceMap);
    expect(coverage).toEqual(fx.derived.coverageAudit);
    expect(profiles).toEqual(fx.derived.reliabilityProfiles);
  });

  it("its referenceHypothesis is the ANCHORED one — different from regime-zero", () => {
    expect(fx.referenceHypothesis).not.toBe(regimeZero.referenceHypothesis);
    expect(fx.referenceHypothesis.length).toBeGreaterThan(0);
  });

  it("records the anchor PDF by sha256 (provenance, not bytes)", () => {
    expect(fx.source.anchor?.sha256).toBe(sha);
    expect(fx.source.anchor?.file).toMatch(/\.pdf$/);
  });

  it("schema 0.1.1 with abstention diagnosis computed", () => {
    expect(fx.schema).toBe("tacet/replay-fixture@0.1.1");
    expect(fx.abstentionDiagnosis).toBe("adjacent");
  });
});

describe("cross-anchor comparison (the meta-artifact)", () => {
  interface Comparison {
    readonly schemaName: string;
    readonly categories: Record<string, number>;
    readonly claims: { readonly category: AbstentionCategory }[];
  }
  const cmp = load<Comparison>("lhc-anchored-comparison-v0.1.json");

  it("is an anchor-comparison artifact over the 28 shared claims", () => {
    expect(cmp.schemaName).toBe("tacet/anchor-comparison@0.1");
    const total = Object.values(cmp.categories).reduce((a, b) => a + b, 0);
    expect(total).toBe(28);
    expect(cmp.claims).toHaveLength(28);
  });

  it("records the REAL counts found: no flips, anchors DECIDE rather than reverse", () => {
    // the found result: 1 robust-same, 0 flip, 5 decided, 22 jointly-undecided
    expect(cmp.categories["anchor-dependent-flip"]).toBe(0); // no anchor reversed a decided lean
    expect(cmp.categories["anchor-decided"]).toBeGreaterThan(0); // anchors moved undecided → decided
    expect(cmp.categories["anchor-robust-same"]).toBeGreaterThanOrEqual(1);
  });
});
