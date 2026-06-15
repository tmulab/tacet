import type { ConvergenceMap } from "./convergence.js";
import type { Lean } from "./types.js";

/**
 * Cross-compare the SAME case read under two different anchors (e.g. LHC under the
 * safety capstone vs under the canonical objection). For each claim judged in both
 * regimes, which leans held regardless of the anchor (anchor-robust) and which
 * moved (anchor-dependent)? The product is a meta-artifact over the two maps —
 * never a verdict on truth, only on how the evidence relation shifts with the
 * ruler. Pure: no I/O, no network.
 *
 * Categories (per claim present in BOTH maps):
 *   - anchor-robust-same      leanA === leanB (the lean held under both anchors)
 *   - anchor-dependent-flip   leanA !== leanB, neither is insufficient (the anchor flipped a decided lean)
 *   - anchor-decided          exactly one is insufficient (the anchor moved undecided → decision, or vice-versa)
 *   - anchor-jointly-undecided  both insufficient
 */

export type AnchorCategory = "anchor-robust-same" | "anchor-dependent-flip" | "anchor-decided" | "anchor-jointly-undecided";

export interface AnchorClaimComparison {
  readonly claimId: string;
  readonly leanA: Lean;
  readonly leanB: Lean;
  readonly category: AnchorCategory;
}

export interface ComparisonReport {
  readonly schemaName: "tacet/anchor-comparison@0.1";
  readonly caseA: string;
  readonly caseB: string;
  readonly categories: Readonly<Record<AnchorCategory, number>>;
  readonly claims: readonly AnchorClaimComparison[];
}

/** The single lean of a claim in a map (verdicts carry per-reader leans, but the
 * map signal already collapsed them; for comparison we need ONE lean per claim).
 * We take reader-a's lean as the claim's lean in that regime when present; the
 * convergence signal is recoverable but the per-claim lean is what flips. */
function leanByClaim(map: ConvergenceMap, readerId: string): Map<string, Lean> {
  const out = new Map<string, Lean>();
  for (const v of map.verdicts) {
    const lean = v.leans[readerId];
    if (lean !== undefined) out.set(v.claimId, lean);
  }
  return out;
}

function classify(a: Lean, b: Lean): AnchorCategory {
  const aIns = a === "insufficient";
  const bIns = b === "insufficient";
  if (aIns && bIns) return "anchor-jointly-undecided"; // neither anchor could decide
  if (a === b) return "anchor-robust-same"; // same DECIDED lean under both anchors
  if (aIns || bIns) return "anchor-decided"; // one anchor moved undecided ↔ decided
  return "anchor-dependent-flip"; // a decided lean flipped with the anchor
}

/**
 * Compare two anchored maps over the claims present in both. `readerId` selects
 * which reader's lean represents a claim in each regime (default "reader-a").
 */
export function compareAnchoredMaps(
  mapA: ConvergenceMap,
  mapB: ConvergenceMap,
  caseA: string,
  caseB: string,
  readerId = "reader-a",
): ComparisonReport {
  const leansA = leanByClaim(mapA, readerId);
  const leansB = leanByClaim(mapB, readerId);
  const categories: Record<AnchorCategory, number> = {
    "anchor-robust-same": 0,
    "anchor-dependent-flip": 0,
    "anchor-decided": 0,
    "anchor-jointly-undecided": 0,
  };
  const claims: AnchorClaimComparison[] = [];
  for (const [claimId, leanA] of leansA) {
    const leanB = leansB.get(claimId);
    if (leanB === undefined) continue; // only claims judged in BOTH regimes
    const category = classify(leanA, leanB);
    categories[category] += 1;
    claims.push({ claimId, leanA, leanB, category });
  }
  return { schemaName: "tacet/anchor-comparison@0.1", caseA, caseB, categories, claims };
}
