import { describe, it, expect } from "vitest";
import { compareAnchoredMaps } from "../src/domain/anchor-comparison.js";
import type { ConvergenceMap } from "../src/domain/convergence.js";
import type { ClaimSignal } from "../src/domain/convergence.js";
import type { Lean } from "../src/domain/types.js";

/**
 * Cross-anchor comparison: the same case under two anchors, claim by claim. The
 * four categories partition the claims judged in BOTH regimes. Pure/offline.
 */

// only reader-a's lean matters for the comparison; signal is incidental here
const sig = (a: Lean): ClaimSignal => (a === "insufficient" ? "unsupported" : "robust-core");
const mapWith = (leans: Record<string, Lean>): ConvergenceMap => ({
  verdicts: Object.entries(leans).map(([claimId, a]) => ({ claimId, signal: sig(a), leans: { "reader-a": a, "reader-b": a } })),
});

describe("compareAnchoredMaps — the four categories", () => {
  it("classifies each category and counts only claims present in BOTH maps", () => {
    const A = mapWith({ same: "supports", flip: "supports", decided: "supports", joint: "insufficient", onlyA: "contradicts" });
    const B = mapWith({ same: "supports", flip: "contradicts", decided: "insufficient", joint: "insufficient", onlyB: "supports" });
    const r = compareAnchoredMaps(A, B, "a.json", "b.json");

    expect(r.schemaName).toBe("tacet/anchor-comparison@0.1");
    expect(r.categories).toEqual({
      "anchor-robust-same": 1, // same
      "anchor-dependent-flip": 1, // flip (supports→contradicts)
      "anchor-decided": 1, // decided (supports→insufficient)
      "anchor-jointly-undecided": 1, // joint (insufficient↔insufficient)
    });
    // onlyA / onlyB excluded (not judged in both)
    expect(r.claims.map((c) => c.claimId).sort()).toEqual(["decided", "flip", "joint", "same"]);
    expect(r.claims.find((c) => c.claimId === "flip")).toMatchObject({ leanA: "supports", leanB: "contradicts", category: "anchor-dependent-flip" });
  });

  it("an empty intersection yields all-zero counts (no shared claims)", () => {
    const r = compareAnchoredMaps(mapWith({ x: "supports" }), mapWith({ y: "contradicts" }), "a", "b");
    expect(r.claims).toHaveLength(0);
    expect(Object.values(r.categories).every((n) => n === 0)).toBe(true);
  });
});
