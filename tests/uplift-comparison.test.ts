import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Passo 2 — the frozen uplift comparisons. They must carry the deterministic
 * measurements + the signals + a BLANK judge rubric, and declare NO winner on the
 * judge axes (asserted by the ABSENCE of any "winner" field). Offline. Coherence,
 * not truth.
 */

interface Comparison {
  readonly schema: string;
  readonly case: string;
  readonly query: string;
  readonly asymmetry: string;
  readonly measurements: {
    readonly verifiability: {
      readonly tacet: { readonly landing: { readonly fraction: number }; readonly registered: { readonly fraction: number } };
      readonly baseline: { readonly landing: { readonly fraction: number }; readonly registered: { readonly fraction: number } };
      readonly note: string;
    };
    readonly uncertainty: { readonly tacet: { readonly total: number }; readonly baseline: { readonly hedges: number; readonly verdicts: number } };
    readonly hiddenDependency: { readonly idMatches: readonly string[]; readonly nameMentions: readonly string[]; readonly count: number };
  };
  readonly rubric: { readonly dimensions: readonly { readonly key: string; readonly method: string; readonly judge?: unknown }[] };
  readonly note: string;
}

const load = (file: string): Comparison =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/comparison/${file}`, import.meta.url)), "utf8")) as Comparison;

describe("frozen uplift comparisons — measurements present, NO winner declared", () => {
  for (const f of ["lhc-uplift-v0.1.json", "eggs-uplift-v0.1.json"]) {
    describe(f, () => {
      const c = load(f);

      it("has the comparison schema, the exact query, and names the asymmetry", () => {
        expect(c.schema).toBe("tacet/uplift-comparison@0.1");
        expect(c.query.length).toBeGreaterThan(50);
        expect(c.asymmetry.toLowerCase()).toContain("completeness");
      });

      it("carries the deterministic measurements (two-layer verifiability + uncertainty + hidden-dep)", () => {
        const v = c.measurements.verifiability;
        expect(v.tacet.landing.fraction).toBeGreaterThanOrEqual(0);
        expect(v.tacet.registered.fraction).toBeGreaterThanOrEqual(0);
        expect(v.baseline.landing.fraction).toBeGreaterThanOrEqual(0);
        expect(v.note.toLowerCase()).toContain("link rot");
        expect(c.measurements.uncertainty.tacet.total).toBeGreaterThan(0);
        expect(typeof c.measurements.hiddenDependency.count).toBe("number");
      });

      it("carries the BLANK judge rubric (verdict null) and the SOTA-ceiling caveat", () => {
        const judge = c.rubric.dimensions.filter((d) => d.method.startsWith("judge"));
        expect(judge.length).toBe(2);
        for (const d of judge) expect(d.judge).toEqual({ verdict: null, notes: null });
        expect(c.note.toLowerCase()).toContain("not the sota ceiling");
      });

      it("declares NO winner anywhere (no 'winner' FIELD in the artifact)", () => {
        // intent: no judge axis carries a verdict/victor field — check the JSON key,
        // not prose (the note legitimately says "no winner is declared").
        expect(JSON.stringify(c).toLowerCase()).not.toContain('"winner"');
        for (const d of c.rubric.dimensions) expect(JSON.stringify(d).toLowerCase()).not.toContain("winner");
      });
    });
  }

  it("LHC: every TACET DOI is REGISTERED (1.00); the lone landing miss is named link-rot", () => {
    const c = load("lhc-uplift-v0.1.json");
    expect(c.measurements.verifiability.tacet.registered.fraction).toBe(1);
    expect(c.measurements.verifiability.tacet.landing.fraction).toBeGreaterThanOrEqual(0.9);
    // landing < registered means the gap is rot, and the note names the rotted DOI
    expect(c.measurements.verifiability.tacet.landing.fraction).toBeLessThan(c.measurements.verifiability.tacet.registered.fraction);
    expect(c.measurements.verifiability.note).toContain("10.34257/gjsfrfvol24is2pg7");
    expect(c.measurements.hiddenDependency.idMatches).toContain("arxiv:0806.3381");
    expect(c.measurements.hiddenDependency.idMatches).toContain("arxiv:0808.1415");
    expect(c.measurements.hiddenDependency.nameMentions).toEqual(["Giddings", "Mangano"]);
  });

  it("eggs: TACET verifiability 1.00 (both layers); baseline cited nothing resolvable (0.00)", () => {
    const c = load("eggs-uplift-v0.1.json");
    expect(c.measurements.verifiability.tacet.landing.fraction).toBe(1);
    expect(c.measurements.verifiability.tacet.registered.fraction).toBe(1);
    expect(c.measurements.verifiability.baseline.landing.fraction).toBe(0);
    expect(c.measurements.hiddenDependency.count).toBe(0);
  });
});
