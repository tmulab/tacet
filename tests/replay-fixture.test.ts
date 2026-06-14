import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeReplay } from "../src/pipeline/replay.js";
import type { ReplayFixture } from "../src/pipeline/replay.js";
import type { ConvergenceMap, ReliabilityProfile } from "../src/domain/convergence.js";
import type { CoverageAudit } from "../src/domain/coverage.js";
import type { Lean } from "../src/domain/types.js";

/**
 * Regression / golden test for the FROZEN replay fixture (the judge's offline
 * artifact). It is 100% offline (reads JSON from disk; computeReplay makes no
 * network call). The fixture is the ANSWER KEY: we recompute the derived
 * artifacts from the saved inputs and assert they still equal the baked ones,
 * plus the specific findings we dissected on the real 5c read. If any number
 * moves — a domain function changed, the corpus changed — this test goes red.
 */

interface FrozenFixture extends ReplayFixture {
  readonly referenceHypothesis?: string;
  readonly readers: Readonly<Record<string, Readonly<Record<string, { lean: Lean; model: string }>>>>;
  readonly derived: {
    readonly convergenceMap: ConvergenceMap;
    readonly coverageAudit: CoverageAudit;
    readonly reliabilityProfiles: readonly ReliabilityProfile[];
  };
}

const fixturePath = fileURLToPath(new URL("../fixtures/replay/sago-origin-v0.1.json", import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as FrozenFixture;

const stanceOf = (id: string): string =>
  fixture.claims.find((c) => c.id === id)?.provenance[0]?.structured?.originStance ?? "(none)";
const leanA = (id: string): Lean | undefined => fixture.readers["reader-a"]?.[id]?.lean;
const leanB = (id: string): Lean | undefined => fixture.readers["reader-b"]?.[id]?.lean;
const claim72956 = fixture.claims.map((c) => c.id).find((id) => id.includes("72956")) ?? "";

describe("frozen SAGO-origin fixture", () => {
  it("is internally consistent: recomputing the derived equals the baked answer key", async () => {
    const { map, coverage, profiles } = await computeReplay(fixture);
    expect(map).toEqual(fixture.derived.convergenceMap);
    expect(coverage).toEqual(fixture.derived.coverageAudit);
    expect(profiles).toEqual(fixture.derived.reliabilityProfiles);
  });

  it("carries the reference hypothesis inside the fixture (not hardcoded)", () => {
    expect(typeof fixture.referenceHypothesis).toBe("string");
    expect((fixture.referenceHypothesis ?? "").length).toBeGreaterThan(50);
  });

  it("every saved lean records its producing model (readerModel mandatory, auditable)", () => {
    for (const slot of ["reader-a", "reader-b"]) {
      for (const entry of Object.values(fixture.readers[slot] ?? {})) {
        expect(typeof entry.model).toBe("string");
        expect(entry.model.length).toBeGreaterThan(0);
      }
    }
  });

  it("map: robust-core=9, live-crux=0, unsupported=35", () => {
    const tally = fixture.derived.convergenceMap.verdicts.reduce<Record<string, number>>((a, v) => {
      a[v.signal] = (a[v.signal] ?? 0) + 1;
      return a;
    }, {});
    expect(tally["robust-core"]).toBe(9);
    expect(tally["live-crux"] ?? 0).toBe(0);
    expect(tally["unsupported"]).toBe(35);
  });

  it("supports/supports converges ONLY on the robust zoonosis claims (6, all robust-core)", () => {
    const bothSupport = fixture.claims.filter((c) => leanA(c.id) === "supports" && leanB(c.id) === "supports");
    expect(bothSupport).toHaveLength(6);
    // every such claim's stance is zoonotic — supports never appears elsewhere
    expect(bothSupport.every((c) => stanceOf(c.id) === "zoonotic")).toBe(true);
    const signal = new Map(fixture.derived.convergenceMap.verdicts.map((v) => [v.claimId, v.signal]));
    expect(bothSupport.every((c) => signal.get(c.id) === "robust-core")).toBe(true);
  });

  it("72956.3 is a GENUINE divergence: GLM contradicts vs M2.7 insufficient → unsupported + contestation", () => {
    expect(claim72956).not.toBe("");
    expect(fixture.readers["reader-a"]?.[claim72956]?.model).toContain("glm");
    expect(leanA(claim72956)).toBe("contradicts");
    expect(fixture.readers["reader-b"]?.[claim72956]?.model).toContain("minimax");
    expect(leanB(claim72956)).toBe("insufficient");

    const verdict = fixture.derived.convergenceMap.verdicts.find((v) => v.claimId === claim72956);
    expect(verdict?.signal).toBe("unsupported"); // any insufficient → unsupported
    const profile = fixture.derived.reliabilityProfiles.find((p) => p.claimId === claim72956);
    expect(profile?.internalContestation).toEqual({ kind: "measured", value: true }); // the readers disagree
  });

  it("both-considered claims land on insufficient/insufficient (3 of them)", () => {
    const bothConsideredAbstained = fixture.claims.filter(
      (c) => stanceOf(c.id) === "both-considered" && leanA(c.id) === "insufficient" && leanB(c.id) === "insufficient",
    );
    expect(bothConsideredAbstained).toHaveLength(3);
  });

  it("the empty chair is the non-anglophone corpus (0 observed against a cited expectation)", () => {
    const chair = fixture.derived.coverageAudit.emptyChairs.find((f) => f.value === "non-anglophone");
    expect(chair).toBeDefined();
    expect(chair?.observedSources).toBe(0);
    expect(chair?.isEmptyChair).toBe(true);
  });
});
