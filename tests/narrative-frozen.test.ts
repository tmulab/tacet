import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSkeleton } from "../src/domain/narrative-skeleton.js";
import type { NarrativeSkeleton, SkeletonInput } from "../src/domain/narrative-skeleton.js";
import { verifyNarrative } from "../src/domain/narrative-verify.js";
import type { NarrativeGuards } from "../src/domain/narrative-verify.js";

/**
 * Passo 3/4 — the frozen coerced narratives. Each must (1) carry the EXACT
 * deterministic skeleton its fixture produces (structure-binding), (2) re-pass
 * BOTH guards offline, and (3) leave the structure untouched: rc/lc/un identical
 * to the post-B3 baseline. The narrative is additive; the structure is intact.
 * Coherence, not truth.
 */

interface Narrative {
  readonly fixture: string;
  readonly prose: string;
  readonly skeleton: NarrativeSkeleton;
  readonly banned: readonly string[];
  readonly guards: NarrativeGuards;
}

const load = <T,>(file: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/replay/${file}`, import.meta.url)), "utf8")) as T;

/** Post-B3 structural baseline — the narrative may NOT change any of these. */
const BASELINE: Readonly<Record<string, readonly [number, number, number]>> = {
  "sago-origin-v0.1.json": [9, 0, 35],
  "sago-origin-v0.2.json": [8, 0, 36],
  "eggs-cv-v0.1.json": [2, 0, 27],
  "lhc-origin-v0.1.json": [0, 0, 28],
  "lhc-safety-anchored-v0.1.json": [0, 0, 28],
  "lhc-objection-anchored-v0.1.json": [1, 0, 27],
  "lhc-anchored-ingested-v0.1.json": [1, 0, 29],
  "freud-midas-derived-v0.1.json": [0, 0, 21],
  "freud-midas-focused-v0.1.json": [1, 0, 29],
};

describe("frozen coerced narratives — structure-bound, guards green, structure intact", () => {
  for (const fixture of Object.keys(BASELINE)) {
    describe(fixture, () => {
      const nar = load<Narrative>(fixture.replace(/\.json$/, ".narrative.json"));
      const fx = load<SkeletonInput & { derived: { convergenceMap: { verdicts: { signal: string }[] } } }>(fixture);
      const skeleton = buildSkeleton(fx);

      it("carries the EXACT deterministic skeleton its fixture produces", () => {
        expect(JSON.stringify(nar.skeleton)).toBe(JSON.stringify(skeleton));
      });

      it("re-passes BOTH guards offline (numeric fidelity + thematic)", () => {
        const g = verifyNarrative(nar.prose, skeleton, nar.banned);
        expect(g.numericFidelity.pass, g.numericFidelity.violations.join("; ")).toBe(true);
        expect(g.thematic.pass, g.thematic.violations.join("; ")).toBe(true);
        expect(g.pass).toBe(true);
      });

      it("the frozen guard result agrees with a fresh recompute", () => {
        expect(nar.guards.pass).toBe(true);
      });

      it("declares the limit — coherence, not truth", () => {
        expect(nar.prose.toLowerCase()).toContain("coherence, not truth");
      });

      it("STRUCTURE GUARD: rc/lc/un identical to the post-B3 baseline", () => {
        const t = fx.derived.convergenceMap.verdicts.reduce<Record<string, number>>(
          (a, v) => ((a[v.signal] = (a[v.signal] ?? 0) + 1), a),
          {},
        );
        const [rc, lc, un] = BASELINE[fixture] as readonly [number, number, number];
        expect([t["robust-core"] ?? 0, t["live-crux"] ?? 0, t["unsupported"] ?? 0]).toEqual([rc, lc, un]);
      });
    });
  }
});
