import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeReplay } from "../src/pipeline/replay.js";
import type { ReplayFixture } from "../src/pipeline/replay.js";
import type { ConvergenceMap, ReliabilityProfile } from "../src/domain/convergence.js";
import type { CoverageAudit } from "../src/domain/coverage.js";
import type { Lean } from "../src/domain/types.js";

/**
 * Regression / golden test for the eggs-cardiovascular replay fixture (v0.1).
 * 100% offline. The "mundane-but-contested" case — and, unlike LHC, the CC-BY
 * nutrition literature IS abundant, so the two undecided readers (NVIDIA
 * nemotron-nano + OpenAI gpt-oss-120b) find real structure: a robust core where
 * BOTH contradict the "no association" reading, amid much insufficient evidence.
 * Asserts the REAL replay result (not the pre-registered prediction). Coherence,
 * never truth.
 */

interface FrozenFixture extends ReplayFixture {
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

const fixturePath = fileURLToPath(new URL("../fixtures/replay/eggs-cv-v0.1.json", import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as FrozenFixture;

const tallyOf = (map: ConvergenceMap): Record<string, number> =>
  map.verdicts.reduce<Record<string, number>>((a, v) => ({ ...a, [v.signal]: (a[v.signal] ?? 0) + 1 }), {});

describe("frozen eggs-cardiovascular fixture (v0.1, free OpenRouter, CC-BY)", () => {
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

  it("the map has REAL structure: robust-core=2, live-crux=0, unsupported=27 (the found result)", () => {
    const tally = tallyOf(fixture.derived.convergenceMap);
    expect(tally["robust-core"]).toBe(2);
    expect(tally["live-crux"] ?? 0).toBe(0);
    expect(tally["unsupported"]).toBe(27);
  });

  it("each robust-core is a genuine convergence: both readers gave the SAME (non-insufficient) lean", () => {
    const cores = fixture.derived.convergenceMap.verdicts.filter((v) => v.signal === "robust-core");
    expect(cores.length).toBeGreaterThanOrEqual(1);
    for (const v of cores) {
      const a = v.leans["reader-a"];
      const b = v.leans["reader-b"];
      expect(a).toBe(b);
      expect(a).not.toBe("insufficient");
    }
  });

  it("the empty chair names measured gaps (pt, es, report) AND a present dimension (sanity)", () => {
    const chairs = new Set(fixture.derived.coverageAudit.emptyChairs.map((f) => `${f.dimension}=${f.value}`));
    expect(chairs.has("language=pt")).toBe(true);
    expect(chairs.has("language=es")).toBe(true);
    expect(chairs.has("genre=report")).toBe(true); // DGAC/AHA/SBC guidelines absent from the journal corpus
    // not a vacuous corpus: at least one expected dimension IS represented
    const present = fixture.derived.coverageAudit.findings.filter((f) => (f.observedSources ?? 0) > 0);
    expect(present.length).toBeGreaterThan(0);
    expect(present.some((f) => f.dimension === "genre" && f.value === "article")).toBe(true);
  });

  it("the relevance gate ABSTAINS (not-assessed): the eggs ruler is Portuguese (lexical gate is EN-only)", () => {
    expect((fixture as unknown as { relevanceGate?: { status: string } }).relevanceGate?.status).toBe("not-assessed");
  });

  it("declares the limit — coherence, not truth — in the source note", () => {
    expect(fixture.source.referenceHypothesis.toLowerCase()).toContain("coherence, not truth");
  });
});
