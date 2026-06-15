import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { assessRelevance } from "../src/domain/relevance-gate.js";
import type { Claim } from "../src/domain/types.js";

/**
 * The relevance gate measures the corpus against the RULER (referenceHypothesis),
 * never against the search query. That is what exposes query drift: a corpus that
 * matches the (drifted) query but not the ruler comes back `drifted`.
 */

const claim = (id: string, text: string, summary = ""): Claim => ({
  id,
  text,
  provenance: [{ sourceId: id, locator: `l:${id}`, summary }],
});

const RULER =
  "Freud's clinical practice enacts the logic of capital, converting libido into monetary value; " +
  "paid therapy and honoraria. The Tomšičian line says Freud subverts it via the Midas inversion. Psychoanalysis.";

describe("assessRelevance — measures against the ruler, not the query", () => {
  it("a corpus with lexical BASIS but low per-claim alignment → drifted", () => {
    // each claim touches ONE ruler term (capital / value / monetary) → basis ≥3,
    // but none meets the floor of 2 → the corpus shares the ruler's vocabulary yet
    // is not on its question (the marxist-economy adjacency)
    const drifted = [
      claim("c1", "Theories of capital accumulation in industry"),
      claim("c2", "On the labor theory of value"),
      claim("c3", "Monetary economics and inflation dynamics"),
    ];
    const r = assessRelevance(RULER, drifted);
    expect(r.status).toBe("drifted");
    expect(r.alignedFraction).toBeLessThanOrEqual(0.2);
  });

  it("a corpus that shares almost NO vocabulary with the ruler → not-assessed (abstain, not drift)", () => {
    // the no-basis case: the gate refuses to call no-overlap "drift"
    const noBasis = [
      claim("n1", "Cichlid fish of the Nicaraguan crater lakes"),
      claim("n2", "Bridge load engineering under seismic stress"),
      claim("n3", "Atmospheric weather patterns over the Pacific"),
    ];
    expect(assessRelevance(RULER, noBasis).status).toBe("not-assessed");
  });

  it("a non-English ruler → not-assessed (the lexical gate is English-only; honest abstain)", () => {
    const ptRuler =
      "A origem zoonótica natural por spillover é a hipótese mais sustentada pela evidência; " +
      "porém a questão permanece inconclusiva e não pode ser descartada.";
    // even with a topically-matching English corpus, a PT ruler is not judged lexically
    const enClaims = [claim("c1", "Zoonotic spillover and the natural origin hypothesis", "evidence on intermediate host")];
    expect(assessRelevance(ptRuler, enClaims).status).toBe("not-assessed");
  });

  it("a corpus rich in ruler terms → aligned", () => {
    const aligned = [
      claim("a1", "Freud, psychoanalysis and the clinical fee", "libido, monetary value, paid therapy and honoraria in Freud's practice"),
      claim("a2", "The Midas inversion: Freud subverts the logic of capital", "Tomscian reading of psychoanalysis and libido"),
      claim("a3", "Clinical practice and monetary value in psychoanalysis", "Freud therapy honoraria libido"),
    ];
    const r = assessRelevance(RULER, aligned);
    expect(r.status).toBe("aligned");
    expect(r.alignedFraction).toBeGreaterThanOrEqual(0.5);
  });

  it("ruleTerms come from the ruler (distinctive content words, stopwords dropped)", () => {
    const r = assessRelevance(RULER, []);
    expect(r.ruleTerms).toContain("freud");
    expect(r.ruleTerms).toContain("libido");
    expect(r.ruleTerms).not.toContain("the");
    expect(r.ruleTerms).not.toContain("via"); // short / function word dropped
  });
});

describe("assessRelevance — property", () => {
  it("status ∈ {aligned,drifted,mixed} and alignedFraction ∈ [0,1] for any input", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }),
        fc.array(fc.record({ id: fc.string({ minLength: 1, maxLength: 6 }), t: fc.string({ maxLength: 80 }), s: fc.string({ maxLength: 80 }) }), { maxLength: 25 }),
        (ruler, cs) => {
          const r = assessRelevance(ruler, cs.map((c) => claim(c.id, c.t, c.s)));
          expect(["aligned", "drifted", "mixed", "not-assessed"]).toContain(r.status);
          expect(r.alignedFraction).toBeGreaterThanOrEqual(0);
          expect(r.alignedFraction).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});
