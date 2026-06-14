import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeReplay } from "../src/pipeline/replay.js";
import type { ReplayFixture } from "../src/pipeline/replay.js";
import type { ConvergenceMap, ReliabilityProfile } from "../src/domain/convergence.js";
import type { CoverageAudit } from "../src/domain/coverage.js";
import type { Lean } from "../src/domain/types.js";

/**
 * Regression / golden test for the v0.2 replay fixture — the FREE-OpenRouter read
 * (reader A = NVIDIA Nemotron-nano, reader B = OpenAI gpt-oss-120b), which is now
 * the demo's default. 100% offline. v0.1 (glm/minimax) stays as historical
 * provenance with its own test; this asserts the new free-model artifact and the
 * couple of places it deliberately differs from v0.1.
 */

interface FrozenFixture extends ReplayFixture {
  readonly referenceHypothesis?: string;
  readonly source: { readonly readerModels: Readonly<Record<string, string | readonly string[]>> };
  readonly notes: { readonly nonLlmSummaries: readonly string[]; readonly oneReaderClaims: number };
  readonly readers: Readonly<Record<string, Readonly<Record<string, { lean: Lean; model: string }>>>>;
  readonly derived: {
    readonly convergenceMap: ConvergenceMap;
    readonly coverageAudit: CoverageAudit;
    readonly reliabilityProfiles: readonly ReliabilityProfile[];
  };
}

const fixturePath = fileURLToPath(new URL("../fixtures/replay/sago-origin-v0.2.json", import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as FrozenFixture;

const leanA = (id: string): Lean | undefined => fixture.readers["reader-a"]?.[id]?.lean;
const leanB = (id: string): Lean | undefined => fixture.readers["reader-b"]?.[id]?.lean;
const claim72956 = fixture.claims.map((c) => c.id).find((id) => id.includes("72956")) ?? "";

describe("frozen SAGO-origin fixture (v0.2, free OpenRouter)", () => {
  it("is internally consistent: recomputing the derived equals the baked answer key", async () => {
    const { map, coverage, profiles } = await computeReplay(fixture);
    expect(map).toEqual(fixture.derived.convergenceMap);
    expect(coverage).toEqual(fixture.derived.coverageAudit);
    expect(profiles).toEqual(fixture.derived.reliabilityProfiles);
  });

  it("was produced by FREE OpenRouter models from distinct companies — no z.ai", () => {
    expect(fixture.source.readerModels["reader-a"]).toBe("nvidia/nemotron-3-nano-30b-a3b:free");
    expect(fixture.source.readerModels["reader-b"]).toBe("openai/gpt-oss-120b:free");
    const flat = JSON.stringify(fixture.source.readerModels);
    expect(flat).not.toContain("glm");
    expect(flat).not.toContain("z.ai");
    expect(flat).not.toContain("minimax");
  });

  it("every saved lean records its producing model (auditable)", () => {
    for (const slot of ["reader-a", "reader-b"]) {
      for (const entry of Object.values(fixture.readers[slot] ?? {})) {
        expect(entry.model).toMatch(/:free$/); // all free OpenRouter ids
      }
    }
  });

  it("map: robust-core=8, live-crux=0, unsupported=36", () => {
    const tally = fixture.derived.convergenceMap.verdicts.reduce<Record<string, number>>((a, v) => {
      a[v.signal] = (a[v.signal] ?? 0) + 1;
      return a;
    }, {});
    expect(tally["robust-core"]).toBe(8);
    expect(tally["live-crux"] ?? 0).toBe(0);
    expect(tally["unsupported"]).toBe(36);
  });

  it("the free summarizer covered ALL 44 claims (0 truncated-stub) — unlike v0.1's 2", () => {
    expect(fixture.notes.nonLlmSummaries).toHaveLength(0);
    expect(fixture.notes.oneReaderClaims).toBe(0);
  });

  it("72956.3, a v0.1 divergence, is a CONVERGENCE here: both readers contradict → robust-core", () => {
    expect(claim72956).not.toBe("");
    expect(leanA(claim72956)).toBe("contradicts");
    expect(leanB(claim72956)).toBe("contradicts");
    const verdict = fixture.derived.convergenceMap.verdicts.find((v) => v.claimId === claim72956);
    expect(verdict?.signal).toBe("robust-core");
  });

  it("the empty chair includes the non-anglophone corpus (0 observed against a cited expectation)", () => {
    const chair = fixture.derived.coverageAudit.emptyChairs.find((f) => f.value === "non-anglophone");
    expect(chair).toBeDefined();
    expect(chair?.observedSources).toBe(0);
    expect(chair?.isEmptyChair).toBe(true);
  });
});
