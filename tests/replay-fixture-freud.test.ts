import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeReplay } from "../src/pipeline/replay.js";
import type { ReplayFixture } from "../src/pipeline/replay.js";
import type { ConvergenceMap, ReliabilityProfile } from "../src/domain/convergence.js";
import type { MeasuredCoverageAudit } from "../src/domain/coverage.js";

/**
 * Freud DERIVED regime (B3): the case that PROVES the audit fix. The ruler is
 * about Freud's clinic; the query drifted (homonymy: surplus-value / abstract
 * labour / the Midas cichlid) and the CC-BY corpus came back political economy,
 * orthogonal to the ruler. The fixture shows it MEASURED: the three theoretical
 * traditions are NOT-MEASURED (never collapsed to empty-chair), the triple chair
 * pt/de/book is a measured gap, and the relevance gate flags the drift. The
 * focused regime (corrected query) lands next. Coherence, not truth. Offline.
 */

interface Frozen extends ReplayFixture {
  readonly schema: string;
  readonly relevanceGate: { readonly status: string; readonly alignedFraction: number };
  readonly source: { readonly referenceHypothesis: string };
  readonly derived: {
    readonly convergenceMap: ConvergenceMap;
    readonly coverageAudit: MeasuredCoverageAudit;
    readonly reliabilityProfiles: readonly ReliabilityProfile[];
  };
}
const fx = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/replay/freud-midas-derived-v0.1.json", import.meta.url)), "utf8"),
) as Frozen;

describe("Freud derived fixture (v0.1) — the audit fix, proven", () => {
  it("recompute equals the baked answer key (offline), schema 0.2.0", async () => {
    expect(fx.schema).toBe("tacet/replay-fixture@0.2.0");
    const { map, coverage, profiles } = await computeReplay(fx);
    expect(map).toEqual(fx.derived.convergenceMap);
    expect(coverage).toEqual(fx.derived.coverageAudit);
    expect(profiles).toEqual(fx.derived.reliabilityProfiles);
  });

  it("the three theoretical traditions are NOT-MEASURED — never collapsed to empty-chair", () => {
    const a = fx.derived.coverageAudit;
    const traditions = a.findings.filter((f) => f.dimension === "tradition");
    expect(traditions.length).toBe(3);
    for (const t of traditions) {
      expect(t.measurability).toBe("not-measured");
      expect(t.isEmptyChair).toBe(false);
      expect(t.observedSources).toBeNull();
    }
    // and none of them leaks into emptyChairs
    expect(a.emptyChairs.some((f) => f.dimension === "tradition")).toBe(false);
    expect(a.notMeasured.length).toBe(3);
  });

  it("the triple empty chair (pt, de, book) is MEASURED at zero; en + article are present", () => {
    const chairs = new Set(fx.derived.coverageAudit.emptyChairs.map((f) => `${f.dimension}=${f.value}`));
    expect(chairs.has("language=pt")).toBe(true);
    expect(chairs.has("language=de")).toBe(true);
    expect(chairs.has("genre=book")).toBe(true);
    const present = fx.derived.coverageAudit.findings.filter((f) => (f.observedSources ?? 0) > 0).map((f) => `${f.dimension}=${f.value}`);
    expect(present).toContain("genre=article");
  });

  it("the relevance gate (EN ruler) flags the drift — not aligned", () => {
    // the corpus shares the ruler's 'capital/value/economy' lexicon, so the lexical
    // gate lands 'mixed' (drift is semantic; lexically borderline) — never 'aligned'
    expect(fx.relevanceGate.status).not.toBe("aligned");
    expect(fx.relevanceGate.status).not.toBe("not-assessed"); // EN ruler IS assessable
    expect(fx.relevanceGate.alignedFraction).toBeLessThan(0.5);
  });

  it("the map is all-unsupported: political economy does not bear on the Freud-clinic ruler", () => {
    const t = fx.derived.convergenceMap.verdicts.reduce<Record<string, number>>((a, v) => ({ ...a, [v.signal]: (a[v.signal] ?? 0) + 1 }), {});
    expect(t["robust-core"] ?? 0).toBe(0);
    expect(t["unsupported"]).toBe(21);
  });

  it("declares coherence, not truth", () => {
    expect(fx.source.referenceHypothesis.toLowerCase()).toContain("coherence, not truth");
  });
});

const focused = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/replay/freud-midas-focused-v0.1.json", import.meta.url)), "utf8"),
) as Frozen;

describe("Freud focused fixture (v0.1) — lexical alignment ≠ topical bearing", () => {
  it("recompute equals the baked answer key (offline)", async () => {
    const { map, coverage, profiles } = await computeReplay(focused);
    expect(map).toEqual(focused.derived.convergenceMap);
    expect(coverage).toEqual(focused.derived.coverageAudit);
    expect(profiles).toEqual(focused.derived.reliabilityProfiles);
  });

  it("the corrected query lands a LEXICALLY aligned corpus (gate=aligned)…", () => {
    expect(focused.relevanceGate.status).toBe("aligned");
    expect(focused.relevanceGate.alignedFraction).toBeGreaterThanOrEqual(0.5);
  });

  it("…yet the readers still abstain on almost all of it (≤1 robust-core, mostly unsupported)", () => {
    const t = focused.derived.convergenceMap.verdicts.reduce<Record<string, number>>((a, v) => ({ ...a, [v.signal]: (a[v.signal] ?? 0) + 1 }), {});
    expect(t["robust-core"] ?? 0).toBeLessThanOrEqual(1);
    expect(t["unsupported"]).toBeGreaterThanOrEqual(25);
  });

  it("the same triple chair (pt/de/book) is still empty; traditions still not-measured", () => {
    const chairs = new Set(focused.derived.coverageAudit.emptyChairs.map((f) => `${f.dimension}=${f.value}`));
    expect(chairs.has("language=pt")).toBe(true);
    expect(chairs.has("language=de")).toBe(true);
    expect(chairs.has("genre=book")).toBe(true);
    expect(focused.derived.coverageAudit.notMeasured.length).toBe(3);
  });
});

describe("Freud contrast artifact — the nature of the difference is NAMED", () => {
  interface Contrast {
    readonly schemaName: string;
    readonly derived: { readonly relevanceGate: { readonly status: string }; readonly structure: Record<string, number> };
    readonly focused: { readonly relevanceGate: { readonly status: string }; readonly structure: Record<string, number> };
    readonly difference: { readonly nature: string; readonly derived: string; readonly focused: string; readonly proves: string };
  }
  const c = JSON.parse(
    readFileSync(fileURLToPath(new URL("../fixtures/replay/freud-contrast-v0.1.json", import.meta.url)), "utf8"),
  ) as Contrast;

  it("carries both regimes' gate + structure", () => {
    expect(c.schemaName).toBe("tacet/freud-contrast@0.1");
    expect(c.derived.relevanceGate.status).toBe("mixed");
    expect(c.focused.relevanceGate.status).toBe("aligned");
    expect(c.derived.structure["robustCore"]).toBe(0);
    expect(c.focused.structure["unsupported"]).toBeGreaterThanOrEqual(25);
  });

  it("NAMES the nature of the difference (prose), not just the numbers", () => {
    expect(c.difference.nature.length).toBeGreaterThan(20);
    expect(c.difference.proves.toLowerCase()).toContain("empty chair");
    // the meta-finding: book-bound / non-English thesis outside CC-BY
    expect(`${c.difference.focused} ${c.difference.proves}`.toLowerCase()).toMatch(/cc-by|book|portuguese/);
  });
});
