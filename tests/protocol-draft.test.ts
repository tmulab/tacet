import { describe, it, expect } from "vitest";
import { PROTOCOL_SYSTEM, hasOpenTension, parseDraft, proposeDraftViaCascade, proposeProtocolDraft } from "../src/protocol/draft.js";
import type { LlmResult, LlmTransport } from "../src/ingestion/llm.js";
import type { AttemptResult, ModelSpec, ModelTransport } from "../src/llm/cascade.js";
import type { DraftProposal } from "../src/protocol/types.js";

/**
 * The LLM proposer (prep-only, network-injected). It turns a raw question into a
 * RAW DraftProposal. Tolerant parse: a partial/garbled reply degrades to null
 * (→ caller falls back to the empty human form), never throws and never
 * fabricates a hypothesis. Transport stubs only — no network.
 */

const QUESTION = "Freud operava na lógica do capital em sua prática clínica?";

const okJson = (obj: unknown): LlmResult => ({ ok: true, content: JSON.stringify(obj), seconds: 0 });
const stub = (result: LlmResult): LlmTransport => async () => result;

const FULL = {
  bestSustained: "A clínica de Freud internaliza formas da economia monetária burguesa.",
  concession: "Porém o dispositivo também subverte a lógica da mercadoria; a tese permanece em disputa.",
  descriptors: { pt: ["psicanálise", "dinheiro"], en: ["psychoanalysis", "money"] },
  inclusion: ["textos de Freud sobre técnica"],
  exclusion: ["usos metafóricos de economia psíquica"],
  seedPapers: [{ title: "Sobre o início do tratamento (1913)", locator: "10.0000/example" }],
};

describe("PROTOCOL_SYSTEM", () => {
  it("frames the reply as a reviewable DRAFT and asks for the two SAGO clauses", () => {
    expect(PROTOCOL_SYSTEM.toLowerCase()).toContain("draft");
    expect(PROTOCOL_SYSTEM).toContain("bestSustained");
    expect(PROTOCOL_SYSTEM).toContain("concession");
  });

  it("asks for expectedCoverage derived from the debate, BEFORE any literature (anti-circular)", () => {
    expect(PROTOCOL_SYSTEM).toContain("expectedCoverage");
    expect(PROTOCOL_SYSTEM.toLowerCase()).toContain("before any literature");
    expect(PROTOCOL_SYSTEM.toLowerCase()).toContain("do not describe search results");
  });
});

describe("parseDraft — expectedCoverage", () => {
  it("parses well-formed expectedCoverage entries", () => {
    const d = parseDraft({
      ...FULL,
      expectedCoverage: [
        { dimension: "Tradition", value: "franco-lacaniana", justification: "the French line" },
        { dimension: "language", value: "pt", justification: "" },
        { dimension: "", value: "x", justification: "dropped: no dimension" },
      ],
    });
    expect(d?.expectedCoverage).toEqual([
      { dimension: "tradition", value: "franco-lacaniana", justification: "the French line" }, // lowercased
      { dimension: "language", value: "pt", justification: "" },
    ]);
  });

  it("omits expectedCoverage entirely when absent or empty", () => {
    expect(parseDraft(FULL)?.expectedCoverage).toBeUndefined();
    expect(parseDraft({ ...FULL, expectedCoverage: [] })?.expectedCoverage).toBeUndefined();
  });
});

describe("parseDraft — tolerant", () => {
  it("parses a full reply", () => {
    const d = parseDraft(FULL);
    expect(d?.bestSustained).toContain("economia monetária");
    expect(d?.concession).toContain("subverte");
    expect(d?.descriptors["en"]).toEqual(["psychoanalysis", "money"]);
    expect(d?.inclusion).toHaveLength(1);
    expect(d?.seedPapers[0]?.locator).toBe("10.0000/example");
  });

  it("returns null when either SAGO clause is missing (no fabricated hypothesis)", () => {
    expect(parseDraft({ ...FULL, bestSustained: "" })).toBeNull();
    expect(parseDraft({ ...FULL, concession: undefined })).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });

  it("degrades missing search-protocol fields to empties rather than throwing", () => {
    const d = parseDraft({ bestSustained: "x clause one", concession: "y clause two" });
    expect(d).not.toBeNull();
    expect(d?.descriptors).toEqual({});
    expect(d?.inclusion).toEqual([]);
    expect(d?.seedPapers).toEqual([]);
  });

  it("coerces a seed paper given as a bare DOI string", () => {
    const d = parseDraft({ ...FULL, seedPapers: ["10.1/bare"] });
    expect(d?.seedPapers[0]).toEqual({ title: "10.1/bare", locator: "10.1/bare" });
  });
});

describe("proposeDraftViaCascade — provenance follows the REAL responder", () => {
  const LEAD: ModelSpec = { id: "nvidia/nano", base: "x", company: "nvidia" };
  const FALLBACK: ModelSpec = { id: "openai/oss", base: "x", company: "openai" };
  const FAST = { backoffMs: [0, 0, 0] } as const;

  const okContent = (obj: unknown): AttemptResult => ({ ok: true, content: JSON.stringify(obj), seconds: 0 });
  const scripted = (byModel: Record<string, AttemptResult>): ModelTransport => async (model) =>
    byModel[model.id] ?? { ok: false, status: 404, seconds: 0, error: "HTTP 404" };

  it("attributes to the LEAD when the lead produces a usable draft", async () => {
    const t = scripted({ "nvidia/nano": okContent(FULL) });
    const r = await proposeDraftViaCascade({ question: QUESTION }, [LEAD, FALLBACK], t, FAST);
    expect(r?.model).toBe("nvidia/nano");
    expect(r?.draft.bestSustained).toContain("economia monetária");
  });

  it("attributes to the FALLBACK when the lead falls through (the bug this fixes)", async () => {
    // lead returns a 200 that is NOT a usable draft → cascade moves on; the
    // protocol must NOT be stamped with the lead's id.
    const t = scripted({ "nvidia/nano": { ok: true, content: "no json here", seconds: 0 }, "openai/oss": okContent(FULL) });
    const r = await proposeDraftViaCascade({ question: QUESTION }, [LEAD, FALLBACK], t, FAST);
    expect(r?.model).toBe("openai/oss"); // the REAL producer, not the lead
  });

  it("returns null when every model is exhausted", async () => {
    const r = await proposeDraftViaCascade({ question: QUESTION }, [LEAD, FALLBACK], scripted({}), FAST);
    expect(r).toBeNull();
  });
});

describe("anchored mode — the anchor is TENSION, not truth (neutrality gate)", () => {
  const LEAD: ModelSpec = { id: "nvidia/nano", base: "x", company: "nvidia" };
  const FALLBACK: ModelSpec = { id: "openai/oss", base: "x", company: "openai" };
  const FAST = { backoffMs: [0, 0, 0] } as const;
  const okContent = (obj: unknown): AttemptResult => ({ ok: true, content: JSON.stringify(obj), seconds: 0 });

  // A strongly one-sided anchor: the author argues Freud WAS inside capital's logic.
  const ANCHOR = "Freud's practice is, through and through, the bourgeois marketplace: the fee IS the cure.";

  // The model echoes the author's verdict with NO open counter-side.
  const ONE_SIDED = {
    bestSustained: "Freud operated entirely within the logic of capital; the fee was the cure.",
    concession: "This is firmly established and the matter is settled beyond reasonable doubt.",
    descriptors: { en: ["psychoanalysis", "capital"] },
    inclusion: [],
    exclusion: [],
    seedPapers: [],
  };
  // A neutral two-position framing that keeps the question open.
  const TWO_SIDED = {
    bestSustained: "Some read Freud's clinic as internalising market forms via the fee and contract.",
    concession: "Yet others hold the clinical logic resists economic reduction; the question remains open.",
    disputeLocus: "fee as market form versus clinic irreducible to economy",
    descriptors: { en: ["psychoanalysis", "capital"] },
    inclusion: [],
    exclusion: [],
    seedPapers: [],
  };

  it("hasOpenTension rejects a one-sided pair and accepts a two-sided one", () => {
    expect(hasOpenTension(parseDraft(ONE_SIDED) as DraftProposal)).toBe(false);
    expect(hasOpenTension(parseDraft(TWO_SIDED) as DraftProposal)).toBe(true);
  });

  it("REJECTS a one-sided anchored draft (no fabricated, poisoned ruler) → null", async () => {
    const t: ModelTransport = async () => okContent(ONE_SIDED);
    const r = await proposeDraftViaCascade({ question: QUESTION, anchorText: ANCHOR }, [LEAD], t, FAST);
    expect(r).toBeNull();
  });

  it("ACCEPTS a two-sided anchored draft and parses the disputeLocus", async () => {
    const t: ModelTransport = async () => okContent(TWO_SIDED);
    const r = await proposeDraftViaCascade({ question: QUESTION, anchorText: ANCHOR }, [LEAD], t, FAST);
    expect(r?.draft.concession).toContain("remains open");
    expect(r?.draft.disputeLocus).toContain("irreducible");
  });

  it("falls through a one-sided lead to a two-sided fallback (gate, not just parse)", async () => {
    const t = scripted({ "nvidia/nano": okContent(ONE_SIDED), "openai/oss": okContent(TWO_SIDED) });
    const r = await proposeDraftViaCascade({ question: QUESTION, anchorText: ANCHOR }, [LEAD, FALLBACK], t, FAST);
    expect(r?.model).toBe("openai/oss");
  });

  it("sends the ANCHOR text and the anchored prompt to the model", async () => {
    let sysSeen = "";
    let userSeen = "";
    const t: ModelTransport = async (_m, system, user) => {
      sysSeen = system;
      userSeen = user;
      return okContent(TWO_SIDED);
    };
    await proposeDraftViaCascade({ question: QUESTION, anchorText: ANCHOR }, [LEAD], t, FAST);
    expect(sysSeen).toContain("source of TENSION, not of TRUTH");
    expect(userSeen).toContain(ANCHOR);
  });

  const scripted = (byModel: Record<string, AttemptResult>): ModelTransport => async (model) =>
    byModel[model.id] ?? { ok: false, status: 404, seconds: 0, error: "HTTP 404" };
});

describe("proposeProtocolDraft", () => {
  it("returns a draft on a good model reply", async () => {
    const d = await proposeProtocolDraft(QUESTION, stub(okJson(FULL)));
    expect(d?.bestSustained).toContain("economia monetária");
  });

  it("returns null on transport failure (→ caller uses the empty human form)", async () => {
    const d = await proposeProtocolDraft(QUESTION, stub({ ok: false, error: "timeout", seconds: 0 }));
    expect(d).toBeNull();
  });

  it("returns null on a 200 that is not usable JSON", async () => {
    const d = await proposeProtocolDraft(QUESTION, stub({ ok: true, content: "I cannot help with that.", seconds: 0 }));
    expect(d).toBeNull();
  });
});
