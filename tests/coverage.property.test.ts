import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { auditCoverage } from "../src/domain/coverage.js";
import type { ExpectedCategory } from "../src/domain/coverage.js";
import type { Claim } from "../src/domain/types.js";

/**
 * Property tests for auditCoverage: one finding per expected category in input
 * order; isEmptyChair faithful to the observed (deduped-by-sourceId) count;
 * never a category outside the cited baseline; every finding expected:true.
 */

const DIMS = ["language-family", "language", "genre", "geographic-locus"] as const;
const VALS = ["en", "pt", "anglophone", "non-anglophone", "book", "article", "east-asia", "x"] as const;

const tagsArb = fc.dictionary(fc.constantFrom(...DIMS), fc.constantFrom(...VALS), { maxKeys: 4 });
const claimArb = fc.record({ sourceId: fc.string({ minLength: 1, maxLength: 6 }), tags: tagsArb }).map(
  (c): Claim => ({ id: c.sourceId, text: "t", provenance: [{ sourceId: c.sourceId, locator: "l", tags: c.tags }] }),
);
const expectedArb = fc.array(
  fc.record({ dimension: fc.constantFrom(...DIMS), value: fc.constantFrom(...VALS), justification: fc.string() }),
  { maxLength: 8 },
) as fc.Arbitrary<ExpectedCategory[]>;

/** Independent re-implementation of "observed sources" for the oracle. */
function observed(claims: readonly Claim[], dim: string, val: string): number {
  const ids = new Set<string>();
  for (const c of claims) for (const p of c.provenance) if (p.tags?.[dim] === val) ids.add(p.sourceId);
  return ids.size;
}

describe("auditCoverage (property)", () => {
  it("one finding per expected, in order; isEmptyChair faithful; nothing invented", () => {
    fc.assert(
      fc.property(fc.array(claimArb, { maxLength: 30 }), expectedArb, (claims, expected) => {
        const audit = auditCoverage(claims, expected);

        // one finding per expected, same order, same (dimension,value)
        expect(audit.findings).toHaveLength(expected.length);
        audit.findings.forEach((f, i) => {
          expect(f.dimension).toBe(expected[i]!.dimension);
          expect(f.value).toBe(expected[i]!.value);
          expect(f.justification).toBe(expected[i]!.justification); // verbatim
          expect(f.expected).toBe(true); // only the cited baseline is reported

          const obs = observed(claims, f.dimension, f.value);
          expect(f.observedSources).toBe(obs);
          expect(f.isEmptyChair).toBe(obs === 0); // the exact equivalence
        });

        // emptyChairs is exactly the empty findings
        expect(audit.emptyChairs).toEqual(audit.findings.filter((f) => f.isEmptyChair));

        // never a finding for a (dimension,value) not in the baseline
        const baseline = new Set(expected.map((e) => `${e.dimension}=${e.value}`));
        for (const f of audit.findings) expect(baseline.has(`${f.dimension}=${f.value}`)).toBe(true);
      }),
    );
  });
});
