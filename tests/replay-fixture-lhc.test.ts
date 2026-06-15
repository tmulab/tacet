import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeReplay } from "../src/pipeline/replay.js";
import type { ReplayFixture } from "../src/pipeline/replay.js";
import type { ConvergenceMap, ReliabilityProfile } from "../src/domain/convergence.js";
import type { CoverageAudit } from "../src/domain/coverage.js";
import type { Lean } from "../src/domain/types.js";

/**
 * Regression / golden test for the LHC-origin replay fixture (v0.1). 100% offline.
 *
 * The HONEST finding, frozen as-is: against the safety-basis reference hypothesis,
 * the two undecided readers (NVIDIA nemotron-nano + OpenAI gpt-oss-120b) find the
 * CC-BY open-access corpus does NOT bear on the LHC collider-safety argument — all
 * 28 claims `unsupported`. The pertinent safety literature (Giddings–Mangano, the
 * LSAG report) is paywalled / not CC-BY, so it is itself the empty chair. This is
 * the engine certifying COHERENCE/relevance and abstaining, never truth.
 */

interface FrozenFixture extends ReplayFixture {
  readonly referenceHypothesis?: string;
  readonly source: {
    readonly referenceHypothesis: string;
    readonly readerModels: Readonly<Record<string, string | readonly string[]>>;
  };
  readonly readers: Readonly<Record<string, Readonly<Record<string, { lean: Lean; model: string }>>>>;
  readonly derived: {
    readonly convergenceMap: ConvergenceMap;
    readonly coverageAudit: CoverageAudit;
    readonly reliabilityProfiles: readonly ReliabilityProfile[];
  };
}

const fixturePath = fileURLToPath(new URL("../fixtures/replay/lhc-origin-v0.1.json", import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as FrozenFixture;

const tallyOf = (map: ConvergenceMap): Record<string, number> =>
  map.verdicts.reduce<Record<string, number>>((a, v) => ({ ...a, [v.signal]: (a[v.signal] ?? 0) + 1 }), {});

describe("frozen LHC-origin fixture (v0.1, free OpenRouter, CC-BY)", () => {
  it("is internally consistent: recomputing the derived equals the baked answer key (offline)", async () => {
    const { map, coverage, profiles } = await computeReplay(fixture);
    expect(map).toEqual(fixture.derived.convergenceMap);
    expect(coverage).toEqual(fixture.derived.coverageAudit);
    expect(profiles).toEqual(fixture.derived.reliabilityProfiles);
  });

  it("was read by FREE OpenRouter models from distinct companies (nemotron + gpt-oss)", () => {
    expect(fixture.source.readerModels["reader-a"]).toBe("nvidia/nemotron-3-nano-30b-a3b:free");
    expect(fixture.source.readerModels["reader-b"]).toBe("openai/gpt-oss-120b:free");
    for (const slot of ["reader-a", "reader-b"]) {
      for (const entry of Object.values(fixture.readers[slot] ?? {})) expect(entry.model).toMatch(/:free$/);
    }
  });

  it("the HONEST map: the open corpus does not bear on the safety argument — all unsupported", () => {
    const tally = tallyOf(fixture.derived.convergenceMap);
    expect(tally["unsupported"]).toBe(28);
    expect(tally["robust-core"] ?? 0).toBe(0);
    expect(tally["live-crux"] ?? 0).toBe(0);
  });

  it("the empty chair names MEASURED gaps against the cited expectation", () => {
    const chairs = fixture.derived.coverageAudit.emptyChairs;
    // genre=report: the LSAG/CERN safety report genre is absent from the literature
    const report = chairs.find((f) => f.dimension === "genre" && f.value === "report");
    expect(report?.observedSources).toBe(0);
    // and the non-anglophone (pt/es) corpus the step-0 ruler expected
    expect(chairs.some((f) => f.dimension === "language" && f.value === "pt")).toBe(true);
    // at least one expected category IS represented (articles), so it is a real
    // measured gap, not a vacuous corpus
    const article = fixture.derived.coverageAudit.findings.find((f) => f.dimension === "genre" && f.value === "article");
    expect((article?.observedSources ?? 0)).toBeGreaterThan(0);
  });

  it("declares the limit — coherence, not truth — in the source note", () => {
    expect(fixture.source.referenceHypothesis.toLowerCase()).toContain("coherence, not truth");
  });

  it("the abstention is diagnosed 'adjacent' (schema 0.2.0): the corpus does not bear on the question", () => {
    expect((fixture as unknown as { schema: string }).schema).toBe("tacet/replay-fixture@0.2.0");
    expect((fixture as unknown as { abstentionDiagnosis: unknown }).abstentionDiagnosis).toBe("adjacent");
  });

  it("the relevance gate is 'aligned' (EN ruler; the corpus IS lexically black-hole literature — the gap is licensing, not topic)", () => {
    expect((fixture as unknown as { relevanceGate?: { status: string } }).relevanceGate?.status).toBe("aligned");
  });
});
