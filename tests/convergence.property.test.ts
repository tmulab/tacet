import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildConvergenceMap } from "../src/domain/convergence.js";
import type { Lean, ReaderJudgement } from "../src/domain/types.js";

/**
 * Property tests for the convergence invariant — proven over ALL well-formed
 * aligned inputs, not a handful of examples. The signal table, "insufficient
 * dominates and never escapes", juxtapose-never-fuse, and "every contract
 * violation throws (never silent)".
 */

const leanArb = fc.constantFrom<Lean>("supports", "contradicts", "insufficient");
const jud = (readerId: string, claimId: string, lean: Lean): ReaderJudgement => ({
  readerId,
  readerModel: "m",
  claimId,
  lean,
  citedSources: [],
  rationale: "",
});

/** A well-formed aligned pair: same length, same claim ids (c0..cN), distinct
 * uniform reader ids. */
const alignedPairArb = fc
  .array(fc.record({ a: leanArb, b: leanArb }), { minLength: 1, maxLength: 25 })
  .map((rows) => ({
    a: rows.map((r, i) => jud("reader-a", `c${i}`, r.a)),
    b: rows.map((r, i) => jud("reader-b", `c${i}`, r.b)),
    rows,
  }));

describe("buildConvergenceMap — signal table & juxtapose (property)", () => {
  it("follows the table; insufficient never escapes; both leans are recoverable", () => {
    fc.assert(
      fc.property(alignedPairArb, ({ a, b, rows }) => {
        const map = buildConvergenceMap(a, b);
        expect(map.verdicts).toHaveLength(rows.length);
        map.verdicts.forEach((v, i) => {
          const la = rows[i]!.a;
          const lb = rows[i]!.b;
          // juxtapose-never-fuse: both leans verbatim in the map
          expect(v.leans["reader-a"]).toBe(la);
          expect(v.leans["reader-b"]).toBe(lb);
          // the table
          const expected = la === "insufficient" || lb === "insufficient" ? "unsupported" : la === lb ? "robust-core" : "live-crux";
          expect(v.signal).toBe(expected);
          // insufficient NEVER produces robust-core / live-crux
          if (v.signal !== "unsupported") {
            expect(la).not.toBe("insufficient");
            expect(lb).not.toBe("insufficient");
          }
        });
      }),
    );
  });
});

describe("buildConvergenceMap — every contract violation throws (property)", () => {
  // Each violation asserts the SPECIFIC error — a generic toThrow() can't tell the
  // explicit guard from a downstream TypeError, so removing a `throw` survives.

  it("(i) identical reader ids on both lists → throws (same readerId)", () => {
    fc.assert(
      fc.property(fc.array(leanArb, { minLength: 1, maxLength: 10 }), (leans) => {
        const a = leans.map((l, i) => jud("same", `c${i}`, l));
        const b = leans.map((l, i) => jud("same", `c${i}`, l));
        expect(() => buildConvergenceMap(a, b)).toThrow(/same readerId/);
      }),
    );
  });

  it("(ii) an empty list → throws (empty)", () => {
    fc.assert(
      fc.property(fc.array(leanArb, { minLength: 1, maxLength: 10 }), (leans) => {
        const b = leans.map((l, i) => jud("reader-b", `c${i}`, l));
        expect(() => buildConvergenceMap([], b)).toThrow(/empty/);
      }),
    );
  });

  it("(iii) a list mixing reader ids → throws (mixes readerIds)", () => {
    fc.assert(
      fc.property(fc.array(leanArb, { minLength: 2, maxLength: 10 }), (leans) => {
        const a = leans.map((l, i) => jud(i === 0 ? "reader-a" : "intruder", `c${i}`, l));
        const b = leans.map((l, i) => jud("reader-b", `c${i}`, l));
        expect(() => buildConvergenceMap(a, b)).toThrow(/mixes readerIds/);
      }),
    );
  });

  it("(iv) differing lengths → throws (counts differ)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 8 }),
        leanArb,
        (na, nb, l) => {
          fc.pre(na !== nb);
          const a = Array.from({ length: na }, (_, i) => jud("reader-a", `c${i}`, l));
          const b = Array.from({ length: nb }, (_, i) => jud("reader-b", `c${i}`, l));
          expect(() => buildConvergenceMap(a, b)).toThrow(/counts differ/);
        },
      ),
    );
  });

  it("(v) an orphan claim id (same length, disjoint ids) → throws (claim id mismatch)", () => {
    fc.assert(
      fc.property(fc.array(leanArb, { minLength: 1, maxLength: 10 }), (leans) => {
        const a = leans.map((l, i) => jud("reader-a", `a${i}`, l));
        const b = leans.map((l, i) => jud("reader-b", `b${i}`, l)); // disjoint ids
        expect(() => buildConvergenceMap(a, b)).toThrow(/claim id mismatch/);
      }),
    );
  });
});
