import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSkeleton, sanctionedNumbers, sanctionedValues, sanctionedStatuses } from "../src/domain/narrative-skeleton.js";
import type { SkeletonInput } from "../src/domain/narrative-skeleton.js";

/**
 * Passo 0 — the deterministic factual skeleton. For each frozen fixture the
 * skeleton must contain exactly the assertions the structure sustains and none
 * more, and be byte-identical on a second build (no LLM, no I/O). Coherence, not
 * truth.
 */

const load = (file: string): SkeletonInput =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/replay/${file}`, import.meta.url)), "utf8")) as SkeletonInput;

const STRUCTURED = [
  "sago-origin-v0.1.json",
  "sago-origin-v0.2.json",
  "eggs-cv-v0.1.json",
  "lhc-origin-v0.1.json",
  "lhc-safety-anchored-v0.1.json",
  "lhc-objection-anchored-v0.1.json",
  "lhc-anchored-ingested-v0.1.json",
  "freud-midas-derived-v0.1.json",
  "freud-midas-focused-v0.1.json",
] as const;

describe("narrative skeleton — deterministic, structure-bound", () => {
  for (const file of STRUCTURED) {
    describe(file, () => {
      const fx = load(file);
      const sk = buildSkeleton(fx);

      it("is byte-identical on a second build (deterministic, zero LLM)", () => {
        expect(JSON.stringify(buildSkeleton(fx))).toBe(JSON.stringify(sk));
      });

      it("the signal counts equal the frozen convergence map exactly", () => {
        const tally = fx.derived.convergenceMap.verdicts.reduce<Record<string, number>>(
          (a, v) => ((a[v.signal] = (a[v.signal] ?? 0) + 1), a),
          {},
        );
        for (const s of ["robust-core", "live-crux", "unsupported"]) {
          const a = sk.find((x) => x.kind === "count" && x.text.startsWith(`${s}:`));
          expect(a, `${s} count assertion`).toBeDefined();
          expect(a?.numbers[0]).toBe(tally[s] ?? 0);
        }
      });

      it("emits one empty-chair assertion per frozen empty chair, and no more", () => {
        const chairs = sk.filter((x) => x.kind === "empty-chair").map((x) => x.values[0]);
        const expected = fx.derived.coverageAudit.emptyChairs.map((f) => `${f.dimension}=${f.value}`);
        expect(chairs).toEqual(expected);
      });

      it("never emits a dim=value token for a not-measured category (only a summary count)", () => {
        const nm = sk.filter((x) => x.kind === "not-measured");
        expect(nm.length).toBe(fx.derived.coverageAudit.notMeasured.length > 0 ? 1 : 0);
        for (const a of nm) expect(a.values.length).toBe(0);
        // and not-measured labels never leak into the sanctioned coverage vocabulary
        const vals = sanctionedValues(sk);
        for (const f of fx.derived.coverageAudit.notMeasured) expect(vals.has(`${f.dimension}=${f.value}`)).toBe(false);
      });

      it("carries the gate status + exact fraction when the fixture has a gate", () => {
        if (fx.relevanceGate == null) return;
        expect([...sanctionedStatuses(sk)]).toEqual([fx.relevanceGate.status]);
        expect(sanctionedNumbers(sk).has(fx.relevanceGate.alignedFraction)).toBe(true);
      });

      it("emits one robust-core-source assertion per robust-core verdict", () => {
        const rc = fx.derived.convergenceMap.verdicts.filter((v) => v.signal === "robust-core").length;
        expect(sk.filter((x) => x.kind === "robust-core-source").length).toBe(rc);
      });

      it("every assertion is traceable to a structure node", () => {
        for (const a of sk) expect(a.sourceNode.length).toBeGreaterThan(0);
      });
    });
  }

  it("freud-derived: all-unsupported, 3 not-measured, gate mixed @0.476", () => {
    const sk = buildSkeleton(load("freud-midas-derived-v0.1.json"));
    expect(sk.find((x) => x.text === "unsupported: 21")?.numbers[0]).toBe(21);
    expect(sk.find((x) => x.text === "robust-core: 0")).toBeDefined();
    expect(sk.find((x) => x.kind === "not-measured")?.numbers[0]).toBe(3);
    expect(sk.find((x) => x.kind === "gate-status")?.status).toBe("mixed");
    expect(sanctionedNumbers(sk).has(0.476)).toBe(true);
  });
});
