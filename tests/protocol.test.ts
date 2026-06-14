import { describe, it, expect } from "vitest";
import {
  acceptAsIs,
  acceptedExpectedCoverage,
  assertFinalizable,
  editClause,
  emptyProtocol,
  finalizeProtocol,
  isAccepted,
  modelClause,
  protocolFromDraft,
  referenceHypothesisViolations,
  renderReferenceHypothesis,
} from "../src/protocol/protocol.js";
import { PROTOCOL_SCHEMA } from "../src/protocol/types.js";
import type { DraftProposal, InvestigationProtocol } from "../src/protocol/types.js";

/**
 * Step-0 ("passo 0") contract: distil a raw question into a versioned protocol
 * carrying a VIGILIA-style search protocol AND a SAGO-style two-clause
 * referenceHypothesis. The non-negotiable invariant: the MODEL PROPOSES, the
 * HUMAN DISPOSES — nothing becomes the referenceHypothesis without explicit
 * human acceptance, and every clause records its provenance.
 */

const NOW = "2026-06-14T12:00:00.000Z";
const MODEL = "z-ai/glm-4.6";
const QUESTION = "Freud operava na lógica do capital em sua prática clínica?";

const DRAFT: DraftProposal = {
  bestSustained:
    "A prática clínica de Freud, ao instituir pagamento, horário fixo e contrato, " +
    "internaliza formas da economia monetária burguesa de seu tempo.",
  concession:
    "Porém o dispositivo analítico também subverte a lógica da mercadoria ao " +
    "recusar a cura como produto entregável; a tese permanece em disputa.",
  descriptors: {
    pt: ["psicanálise", "dinheiro", "honorários", "capitalismo"],
    en: ["psychoanalysis", "money", "fee", "capitalism"],
  },
  inclusion: ["textos de Freud sobre técnica e pagamento", "publicado em fonte rastreável"],
  exclusion: ["usos puramente metafóricos de 'economia psíquica'"],
  seedPapers: [{ title: "Sobre o início do tratamento (1913)", locator: null }],
};

describe("protocolFromDraft — the model's proposal is a DRAFT, never authorship", () => {
  const p = protocolFromDraft("freud-capital", QUESTION, DRAFT, MODEL, NOW);

  it("is schema-valid and versioned v1, draft (not finalized)", () => {
    expect(p.schema).toBe(PROTOCOL_SCHEMA);
    expect(p.version).toBe(1);
    expect(p.case).toBe("freud-capital");
    expect(p.createdAt).toBe(NOW);
    expect(p.finalizedAt).toBeNull();
  });

  it("the raw question is the human's, always", () => {
    expect(p.question.text).toBe(QUESTION);
    expect(p.question.provenance.proposedBy).toBe("human");
    expect(p.question.provenance.editedByHuman).toBe(true);
  });

  it("stamps proposedBy=model and editedByHuman=false on every proposed clause", () => {
    expect(p.referenceHypothesis.bestSustained.provenance).toEqual({
      proposedBy: MODEL,
      editedByHuman: false,
      acceptedAt: null,
    });
    expect(p.referenceHypothesis.concession.provenance.proposedBy).toBe(MODEL);
    expect(p.descriptors["pt"]?.[0]?.provenance.proposedBy).toBe(MODEL);
    expect(p.criteria.inclusion[0]?.provenance.editedByHuman).toBe(false);
    expect(p.seedPapers[0]?.provenance.proposedBy).toBe(MODEL);
  });

  it("carries the VIGILIA-style search protocol: descriptors, criteria, seeds, strategies", () => {
    expect(Object.keys(p.descriptors)).toEqual(["pt", "en"]);
    expect(p.criteria.inclusion).toHaveLength(2);
    expect(p.criteria.exclusion).toHaveLength(1);
    expect(p.seedPapers[0]?.title).toContain("início do tratamento");
    expect(p.searchStrategies.length).toBeGreaterThan(0); // derived from descriptors
  });
});

describe("the INVARIANT — nothing reaches referenceHypothesis without human accept", () => {
  const draftProtocol = protocolFromDraft("freud-capital", QUESTION, DRAFT, MODEL, NOW);

  it("isAccepted is true only when editedByHuman OR acceptedAt is set", () => {
    expect(isAccepted({ proposedBy: MODEL, editedByHuman: false, acceptedAt: null })).toBe(false);
    expect(isAccepted({ proposedBy: MODEL, editedByHuman: true, acceptedAt: null })).toBe(true);
    expect(isAccepted({ proposedBy: MODEL, editedByHuman: false, acceptedAt: NOW })).toBe(true);
  });

  it("a fresh model draft is NOT finalizable: both hypothesis clauses flagged", () => {
    const v = referenceHypothesisViolations(draftProtocol);
    expect(v).toContain("referenceHypothesis.bestSustained");
    expect(v).toContain("referenceHypothesis.concession");
    expect(() => assertFinalizable(draftProtocol)).toThrow(/not finalizable/i);
    expect(() => renderReferenceHypothesis(draftProtocol)).toThrow(/not finalizable/i);
  });

  it("accept-as-is records acceptance and KEEPS proposedBy (artifact declares the machine proposed it)", () => {
    const c = modelClause("draft text", MODEL);
    const accepted = acceptAsIs(c, NOW);
    expect(accepted.text).toBe("draft text"); // unchanged
    expect(accepted.provenance.proposedBy).toBe(MODEL); // still the machine's proposal
    expect(accepted.provenance.editedByHuman).toBe(false);
    expect(accepted.provenance.acceptedAt).toBe(NOW);
    expect(isAccepted(accepted.provenance)).toBe(true);
  });

  it("edit records the human rewrite but PRESERVES who proposed it", () => {
    const c = modelClause("draft text", MODEL);
    const edited = editClause(c, "the researcher's rewrite", NOW);
    expect(edited.text).toBe("the researcher's rewrite");
    expect(edited.provenance.proposedBy).toBe(MODEL); // declares what the machine proposed
    expect(edited.provenance.editedByHuman).toBe(true); // …and that the human changed it
    expect(edited.provenance.acceptedAt).toBe(NOW);
  });

  it("once BOTH clauses are accepted, it finalizes and renders the two-clause anchor", () => {
    const accepted: InvestigationProtocol = {
      ...draftProtocol,
      referenceHypothesis: {
        bestSustained: acceptAsIs(draftProtocol.referenceHypothesis.bestSustained, NOW),
        concession: editClause(draftProtocol.referenceHypothesis.concession, "Concessão reescrita pelo humano.", NOW),
      },
    };
    expect(referenceHypothesisViolations(accepted)).toEqual([]);
    const final = finalizeProtocol(accepted, NOW);
    expect(final.finalizedAt).toBe(NOW);
    const anchor = renderReferenceHypothesis(final);
    expect(anchor).toContain("internaliza formas da economia");
    expect(anchor).toContain("Concessão reescrita pelo humano.");
  });

  it("an empty (whitespace) accepted clause is still NOT finalizable", () => {
    const blank: InvestigationProtocol = {
      ...draftProtocol,
      referenceHypothesis: {
        bestSustained: { text: "   ", provenance: { proposedBy: "human", editedByHuman: true, acceptedAt: NOW } },
        concession: acceptAsIs(draftProtocol.referenceHypothesis.concession, NOW),
      },
    };
    expect(referenceHypothesisViolations(blank).some((s) => s.includes("bestSustained"))).toBe(true);
  });
});

describe("expectedCoverage — model proposes, human disposes (anti-circular baseline)", () => {
  const DRAFT_EC: DraftProposal = {
    ...DRAFT,
    expectedCoverage: [
      { dimension: "tradition", value: "franco-lacaniana", justification: "the French line stages Freud-and-capital" },
      { dimension: "language", value: "pt", justification: "lusophone scholarship is pertinent" },
      { dimension: "genre", value: "book", justification: "the canon is in books" },
    ],
  };
  const anchor = { file: "midas.pdf", sha256: "deadbeef" };
  const p = protocolFromDraft("freud-capital", QUESTION, DRAFT_EC, MODEL, NOW, anchor);

  it("enters as a NOT-accepted draft, proposedBy=model, with sourceAnchor", () => {
    expect(p.expectedCoverage).toHaveLength(3);
    const e = p.expectedCoverage[0];
    expect(e?.provenance).toMatchObject({ proposedBy: MODEL, editedByHuman: false, acceptedAt: null });
    expect(e?.provenance.sourceAnchor).toEqual(anchor);
  });

  it("acceptedExpectedCoverage is EMPTY until a human accepts (the invariant)", () => {
    expect(acceptedExpectedCoverage(p)).toEqual([]);
  });

  it("once accepted, the entry becomes the empty-chair baseline (stripped to ExpectedCategory)", () => {
    const accepted: InvestigationProtocol = {
      ...p,
      expectedCoverage: [
        { ...p.expectedCoverage[0]!, provenance: { ...p.expectedCoverage[0]!.provenance, acceptedAt: NOW } },
        ...p.expectedCoverage.slice(1),
      ],
    };
    const baseline = acceptedExpectedCoverage(accepted);
    expect(baseline).toEqual([{ dimension: "tradition", value: "franco-lacaniana", justification: "the French line stages Freud-and-capital" }]);
  });

  it("emptyProtocol carries an empty expectedCoverage (fallback, nothing fabricated)", () => {
    expect(emptyProtocol("c", QUESTION, NOW).expectedCoverage).toEqual([]);
  });
});

describe("protocolFromDraft with an ANCHOR — sourceAnchor provenance", () => {
  const anchor = { file: "marx-freud.pdf", sha256: "abc123", locus: "fee as market form vs clinic irreducible" };
  const p = protocolFromDraft("freud-capital", QUESTION, DRAFT, MODEL, NOW, anchor);

  it("stamps sourceAnchor (file + hash + locus) on every model clause", () => {
    expect(p.referenceHypothesis.bestSustained.provenance.sourceAnchor).toEqual(anchor);
    expect(p.referenceHypothesis.concession.provenance.sourceAnchor?.file).toBe("marx-freud.pdf");
    expect(p.descriptors["pt"]?.[0]?.provenance.sourceAnchor?.sha256).toBe("abc123");
    expect(p.criteria.inclusion[0]?.provenance.sourceAnchor?.locus).toContain("market form");
    expect(p.seedPapers[0]?.provenance.sourceAnchor?.file).toBe("marx-freud.pdf");
  });

  it("the question is still the human's — never tagged to the anchor", () => {
    expect(p.question.provenance.proposedBy).toBe("human");
    expect(p.question.provenance.sourceAnchor).toBeUndefined();
  });

  it("anchored clauses are STILL not-accepted — the anchor changes nothing about human-dispoe", () => {
    expect(referenceHypothesisViolations(p).length).toBeGreaterThan(0);
    expect(() => renderReferenceHypothesis(p)).toThrow(/not finalizable/i);
  });

  it("without an anchor, no clause carries sourceAnchor", () => {
    const plain = protocolFromDraft("freud-capital", QUESTION, DRAFT, MODEL, NOW);
    expect(plain.referenceHypothesis.bestSustained.provenance.sourceAnchor).toBeUndefined();
  });
});

describe("emptyProtocol — honest no-model fallback", () => {
  const p = emptyProtocol("freud-capital", QUESTION, NOW);

  it("is schema-valid with proposedBy=human throughout and NO fabricated proposal", () => {
    expect(p.schema).toBe(PROTOCOL_SCHEMA);
    expect(p.question.text).toBe(QUESTION);
    expect(p.question.provenance.proposedBy).toBe("human");
    expect(p.referenceHypothesis.bestSustained.text).toBe("");
    expect(p.referenceHypothesis.bestSustained.provenance.proposedBy).toBe("human");
    expect(p.descriptors).toEqual({});
    expect(p.seedPapers).toEqual([]);
  });

  it("is not finalizable until the human fills and accepts the hypothesis", () => {
    expect(referenceHypothesisViolations(p).length).toBeGreaterThan(0);
  });
});
