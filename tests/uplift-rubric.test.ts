import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  UPLIFT_RUBRIC,
  extractCitations,
  normalizeCitation,
  verifiability,
  countTacetAbstentions,
  countBaselineUncertainty,
  hiddenDependencySignal,
} from "../src/domain/uplift-rubric.js";

/**
 * Passo 1 — the rubric. Deterministic dimensions (verifiability, hidden-dependency
 * signal) are unit-tested; judge axes are tested for being well-formed and for
 * carrying NO winner field. Coherence, not truth.
 */

describe("verifiability (deterministic)", () => {
  it("returns resolved/total over unique citations", () => {
    const cites = ["10.1234/a", "10.1234/a", "https://x.test/b", "10.5678/c"]; // a duplicated
    const resolves = (c: string): boolean => c !== "doi:10.5678/c"; // c fails
    const r = verifiability(cites, resolves);
    expect(r.total).toBe(3);
    expect(r.resolved).toBe(2);
    expect(r.fraction).toBe(0.667);
  });

  it("TACET DOIs resolve ~1.00 by construction (all 10.x CC-BY DOIs)", () => {
    const fx = JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/replay/eggs-cv-v0.1.json", import.meta.url)), "utf8")) as { claims: { provenance: { locator: string }[] }[] };
    const dois = fx.claims.map((c) => c.provenance[0]?.locator ?? "").filter((l) => /10\.\d/.test(l));
    const r = verifiability(dois, (c) => c.startsWith("doi:")); // every Crossref DOI resolves
    expect(r.total).toBeGreaterThan(10);
    expect(r.fraction).toBe(1);
  });

  it("empty citation list → fraction 0, not NaN", () => {
    expect(verifiability([], () => true)).toEqual({ total: 0, resolved: 0, fraction: 0 });
  });
});

describe("extract + normalize citations", () => {
  it("pulls DOIs, arXiv ids and URLs; normalizes to canonical keys", () => {
    const text = "See 10.1103/PhysRevD.78.035009 and arXiv:0806.3381 and https://example.org/x.";
    const c = extractCitations(text);
    const keys = c.map(normalizeCitation);
    expect(keys).toContain("doi:10.1103/physrevd.78.035009");
    expect(keys).toContain("arxiv:0806.3381");
    expect(keys.some((k) => k.includes("example.org"))).toBe(true);
  });

  it("normalizes an arXiv abstract URL to the same key as a bare arXiv id", () => {
    expect(normalizeCitation("https://arxiv.org/abs/0806.3381v2")).toBe("arxiv:0806.3381");
    expect(normalizeCitation("arxiv:0806.3381")).toBe("arxiv:0806.3381");
  });
});

describe("hidden-dependency signal (deterministic)", () => {
  const outOfCcby = ["https://arxiv.org/abs/0806.3381v2", "https://arxiv.org/abs/0808.1415v3"];

  it("fires when the baseline cites an out-of-CC-BY source TACET marked", () => {
    const baseline = "The safety case rests on Giddings & Mangano (arXiv:0806.3381).";
    const sig = hiddenDependencySignal(baseline, outOfCcby, ["Giddings", "Mangano"]);
    expect(sig.idMatches).toContain("arxiv:0806.3381");
    expect(sig.nameMentions).toEqual(["Giddings", "Mangano"]);
    expect(sig.count).toBe(1);
  });

  it("does not fire when the baseline cites only open sources", () => {
    const sig = hiddenDependencySignal("Per 10.1371/journal.pone.0301195, nothing alarming.", outOfCcby);
    expect(sig.count).toBe(0);
    expect(sig.idMatches).toEqual([]);
  });
});

describe("uncertainty markers", () => {
  it("counts TACET abstentions from the structure", () => {
    const a = countTacetAbstentions({ unsupported: 28, emptyChairs: 4, notMeasured: 2, gateStatus: "aligned" });
    expect(a.total).toBe(34);
    expect(countTacetAbstentions({ unsupported: 0, emptyChairs: 1, notMeasured: 0, gateStatus: "not-assessed" }).gateNotAssessed).toBe(1);
  });

  it("counts baseline hedges vs verdicts", () => {
    const r = countBaselineUncertainty("This is conclusively proven and completely safe. It may be uncertain though.");
    expect(r.verdicts).toBeGreaterThanOrEqual(2);
    expect(r.hedges).toBeGreaterThanOrEqual(2);
  });
});

describe("rubric is well-formed; judge axes carry NO winner", () => {
  it("has exactly the four crit-1 dimensions with declared methods", () => {
    const keys = UPLIFT_RUBRIC.dimensions.map((d) => d.key);
    expect(keys).toEqual(["verifiability", "uncertainty-preservation", "load-bearing-visibility", "hidden-dependency-disclosure"]);
    for (const d of UPLIFT_RUBRIC.dimensions) expect(d.criterion.length).toBeGreaterThan(30);
  });

  it("judge axes are blank (verdict null) and never contain a 'winner' field", () => {
    const judge = UPLIFT_RUBRIC.dimensions.filter((d) => d.method.startsWith("judge"));
    expect(judge.length).toBe(2);
    for (const d of judge) {
      expect(d.judge).toEqual({ verdict: null, notes: null });
      expect(JSON.stringify(d).toLowerCase()).not.toContain("winner");
    }
  });
});
