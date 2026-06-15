import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { diagnoseAbstention } from "../src/domain/abstention-diagnosis.js";
import type { Claim, Lean, OriginStance } from "../src/domain/types.js";
import type { ClaimSignal, ConvergenceMap } from "../src/domain/convergence.js";

/**
 * The abstention classifier: only fires on high abstention, then labels the SHAPE
 * of the corpus's silence. Unit tests pin the four branches; a property proves the
 * output is always in the closed set for any well-formed input.
 */

const claim = (id: string, stance?: OriginStance): Claim => ({
  id,
  text: id,
  provenance: [
    {
      sourceId: id,
      locator: `loc:${id}`,
      ...(stance !== undefined
        ? { structured: { centralClaim: "", citedEvidence: "", originStance: stance, summaryText: "" } }
        : {}),
    },
  ],
});

const verdict = (id: string, signal: ClaimSignal, a: Lean, b: Lean) => ({
  claimId: id,
  signal,
  leans: { "reader-a": a, "reader-b": b },
});
const mapOf = (verdicts: ReturnType<typeof verdict>[]): ConvergenceMap => ({ verdicts });

describe("diagnoseAbstention — the four branches", () => {
  it("null when unsupported rate < 0.8 (no high abstention)", () => {
    const claims = [claim("c1", "none"), claim("c2", "none")];
    const map = mapOf([verdict("c1", "robust-core", "supports", "supports"), verdict("c2", "unsupported", "insufficient", "supports")]);
    expect(diagnoseAbstention(claims, map)).toBeNull();
  });

  it("adjacent when ≥80% unsupported AND ≥70% originStance 'none'", () => {
    const claims = Array.from({ length: 10 }, (_, i) => claim(`c${i}`, "none"));
    const map = mapOf(claims.map((c) => verdict(c.id, "unsupported", "insufficient", "insufficient")));
    expect(diagnoseAbstention(claims, map)).toBe("adjacent");
  });

  it("polarized when ≥80% unsupported, NOT mostly-none, and ≥3 supports & ≥3 contradicts", () => {
    // stances are on-topic (not "none"), so adjacency does not fire
    const claims = Array.from({ length: 10 }, (_, i) => claim(`c${i}`, "both-considered"));
    // every verdict unsupported (one reader insufficient) but the OTHER lean splits
    const v = [
      ...Array.from({ length: 4 }, (_, i) => verdict(`s${i}`, "unsupported", "supports", "insufficient")),
      ...Array.from({ length: 4 }, (_, i) => verdict(`k${i}`, "unsupported", "contradicts", "insufficient")),
      ...Array.from({ length: 2 }, (_, i) => verdict(`u${i}`, "unsupported", "insufficient", "insufficient")),
    ];
    expect(diagnoseAbstention(claims, mapOf(v))).toBe("polarized");
  });

  it("mixed when ≥80% unsupported but neither adjacent nor polarized", () => {
    const claims = Array.from({ length: 10 }, (_, i) => claim(`c${i}`, "both-considered"));
    const v = [
      ...Array.from({ length: 9 }, (_, i) => verdict(`u${i}`, "unsupported", "insufficient", "insufficient")),
      verdict("s0", "unsupported", "supports", "insufficient"), // only one side → not polarized
    ];
    expect(diagnoseAbstention(claims, mapOf(v))).toBe("mixed");
  });
});

describe("diagnoseAbstention — property", () => {
  const stanceArb = fc.constantFrom<OriginStance>("zoonotic", "lab", "both-considered", "none");
  const leanArb = fc.constantFrom<Lean>("supports", "contradicts", "insufficient");
  const signalArb = fc.constantFrom<ClaimSignal>("robust-core", "live-crux", "unsupported");

  it("output is always in {null, adjacent, polarized, mixed} for any well-formed input", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.string({ minLength: 1, maxLength: 6 }), st: fc.option(stanceArb, { nil: undefined }) }), { maxLength: 30 }),
        fc.array(fc.record({ id: fc.string({ minLength: 1, maxLength: 6 }), sig: signalArb, a: leanArb, b: leanArb }), { maxLength: 30 }),
        (cs, vs) => {
          const claims = cs.map((c) => claim(c.id, c.st));
          const map = mapOf(vs.map((v) => verdict(v.id, v.sig, v.a, v.b)));
          const out = diagnoseAbstention(claims, map);
          expect(out === null || out === "adjacent" || out === "polarized" || out === "mixed").toBe(true);
        },
      ),
    );
  });
});
