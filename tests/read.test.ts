import { describe, it, expect } from "vitest";
import { readWithFallback } from "../src/ingestion/read.js";
import { LlmReader } from "../src/readers/llm-reader.js";
import { buildConvergenceMap } from "../src/domain/convergence.js";
import { buildReliabilityProfile } from "../src/domain/reliability.js";
import type { LlmTransport } from "../src/ingestion/llm.js";
import type { Claim, ReaderJudgement } from "../src/domain/types.js";

/**
 * Fallback orchestration (5b complement). Transport stubs only — no network.
 * The fallback fills a slot whose primary FAILED; it never runs when both
 * primaries succeed (no tiebreaking); each lean records its producing model.
 */

const GLM = "z-ai/glm-4.6";
const M2 = "minimax/minimax-m2.7";
const GEMMA = "google/gemma-4-31b-it:free";

const claim = (id = "c1"): Claim => ({
  id,
  text: "claim",
  provenance: [{ sourceId: id, locator: `loc:${id}`, summary: "evidence", summaryMethod: "llm" }],
});

const ok = (lean: string): LlmTransport => () => Promise.resolve({ ok: true, content: `{"lean":"${lean}"}`, seconds: 0 });
const fail: LlmTransport = () => Promise.resolve({ ok: false, error: "HTTP 500", seconds: 0 });
const counting = (lean: string): { transport: LlmTransport; calls: () => number } => {
  let n = 0;
  return { transport: () => { n += 1; return Promise.resolve({ ok: true, content: `{"lean":"${lean}"}`, seconds: 0 }); }, calls: () => n };
};

describe("readWithFallback", () => {
  it("(i) primary A fails → fallback fills slot A; claim recovers two leans, A marked Gemma", async () => {
    const a = new LlmReader("reader-a", fail, GLM);
    const b = new LlmReader("reader-b", ok("supports"), M2);
    const fb = new LlmReader("reader-fallback", ok("contradicts"), GEMMA);
    const { slotA, slotB } = await readWithFallback(claim(), a, b, fb);
    expect(slotA?.lean).toBe("contradicts");
    expect(slotA?.readerId).toBe("reader-a"); // re-slotted to the position it fills
    expect(slotA?.readerModel).toBe(GEMMA); // but auditable as the fallback model
    expect(slotB?.readerModel).toBe(M2);
  });

  it("(j) both primaries OK and DIVERGE → fallback is NOT called; the crux stands", async () => {
    const a = new LlmReader("reader-a", ok("supports"), GLM);
    const b = new LlmReader("reader-b", ok("contradicts"), M2);
    const fbStub = counting("insufficient");
    const fb = new LlmReader("reader-fallback", fbStub.transport, GEMMA);
    const { slotA, slotB, fallbackInvoked } = await readWithFallback(claim(), a, b, fb);
    expect(fbStub.calls()).toBe(0);
    expect(fallbackInvoked).toBe(false);
    expect(slotA?.lean).toBe("supports");
    expect(slotB?.lean).toBe("contradicts");
  });

  it("both primaries OK and CONVERGE → fallback is NOT called either", async () => {
    const fbStub = counting("contradicts");
    const { slotA, slotB } = await readWithFallback(
      claim(),
      new LlmReader("reader-a", ok("supports"), GLM),
      new LlmReader("reader-b", ok("supports"), M2),
      new LlmReader("reader-fallback", fbStub.transport, GEMMA),
    );
    expect(fbStub.calls()).toBe(0);
    expect(slotA?.lean).toBe("supports");
    expect(slotB?.lean).toBe("supports");
  });

  it("(k) primary fails AND fallback fails → one lean only (contestation will be not-measured)", async () => {
    const a = new LlmReader("reader-a", fail, GLM);
    const b = new LlmReader("reader-b", ok("supports"), M2);
    const fb = new LlmReader("reader-fallback", fail, GEMMA);
    const { slotA, slotB } = await readWithFallback(claim(), a, b, fb);
    expect(slotA).toBeNull();
    expect(slotB?.lean).toBe("supports");
  });

  it("(l) readerModel is present and correct on each saved lean", async () => {
    const { slotA, slotB } = await readWithFallback(
      claim(),
      new LlmReader("reader-a", ok("supports"), GLM),
      new LlmReader("reader-b", ok("insufficient"), M2),
      new LlmReader("reader-fallback", ok("supports"), GEMMA),
    );
    expect(slotA?.readerModel).toBe(GLM);
    expect(slotB?.readerModel).toBe(M2);
  });
});

/**
 * Phase 5c — the readers are anchored to a SHARED reference hypothesis (not a
 * persona), so divergence emerges from ambiguous evidence; and the double
 * fallback can never become Gemma-vs-Gemma (artefactual self-agreement).
 */
describe("anchored readers + double-fallback (5c)", () => {
  // The recognized, inconclusive state of the SARS-CoV-2 origin question (SAGO).
  const HYP =
    "A origem zoonótica natural por spillover é a hipótese atualmente mais sustentada; porém a questão permanece inconclusiva, e um acidente laboratorial não pode ser descartado nem provado.";

  /** A claim carrying structured evidence, so the reader user-content has real
   * text for an anchored stub to read. */
  const structured = (id: string, centralClaim: string, citedEvidence: string): Claim => ({
    id,
    text: "paper",
    provenance: [
      {
        sourceId: id,
        locator: `loc:${id}`,
        summary: citedEvidence,
        summaryMethod: "llm",
        structured: { centralClaim, citedEvidence, originStance: "both-considered", summaryText: centralClaim },
      },
    ],
  });

  /** A stub that simulates an ANCHORED model: it leans by what the evidence says
   * about ORIGIN (relative to the reference hypothesis), NOT by abstract
   * coherence. It also records the system prompt it was handed. */
  const anchored = (cap?: { system: string }): LlmTransport => (system, user) => {
    if (cap) cap.system = system;
    const u = user.toLowerCase();
    const lean = /lab origin|synthetic|non-natural origin|does not exclude a lab/.test(u)
      ? "contradicts"
      : /bat|pangolin|zoonotic|spillover|natural recombination/.test(u)
        ? "supports"
        : "insufficient";
    return Promise.resolve({ ok: true, content: `{"lean":"${lean}","rationale":"anchored to the reference hypothesis"}`, seconds: 0 });
  };

  it("(m) anchored lean: lab-evidence → contradicts; off-topic → insufficient; zoonosis → supports — and the reference hypothesis is injected into the SYSTEM prompt", async () => {
    const cap = { system: "" };
    const readerA = new LlmReader("reader-a", anchored(cap), GLM, HYP);
    const readerB = new LlmReader("reader-b", anchored(), M2, HYP);

    const lab = structured("lab", "Origin features are reviewed", "A non-natural origin score; the data does not exclude a lab origin or synthesis.");
    const a = await readerA.judge(lab);
    const b = await readerB.judge(lab);
    expect([a?.lean, b?.lean]).toContain("contradicts"); // anchor flips a coherent abstract to contradicts

    // The anchor is a SHARED reference hypothesis carried in the system prompt —
    // not a persona, not a side. This is what makes 5c differ from flat 5b.
    expect(cap.system).toContain(HYP);

    const off = structured("off", "Rapid antigen test sensitivity", "Test sensitivity varied with viral load across variants.");
    expect((await readerA.judge(off))?.lean).toBe("insufficient"); // no bearing on origin

    const zoo = structured("zoo", "Spillover origin is examined", "Close relatives in bats and pangolins; natural recombination explains the genome.");
    expect((await readerA.judge(zoo))?.lean).toBe("supports");
  });

  it("(n) genuine divergence on a both-considered claim: A contradicts, B insufficient → contestation lights measured:true", async () => {
    const a = new LlmReader("reader-a", ok("contradicts"), GLM, HYP);
    const b = new LlmReader("reader-b", ok("insufficient"), M2, HYP);
    const fb = new LlmReader("reader-fallback", ok("supports"), GEMMA, HYP);
    const { slotA, slotB, fallbackInvoked } = await readWithFallback(claim("c1"), a, b, fb);

    expect(fallbackInvoked).toBe(false); // both primaries succeeded; the crux stands
    expect(slotA).not.toBeNull();
    expect(slotB).not.toBeNull();
    const signal = buildConvergenceMap([slotA as ReaderJudgement], [slotB as ReaderJudgement]).verdicts[0]?.signal ?? null;
    const profile = buildReliabilityProfile(claim("c1"), [slotA, slotB].filter((s): s is ReaderJudgement => s !== null), signal, {});
    expect(profile.internalContestation).toEqual({ kind: "measured", value: true });
  });

  it("(o) both primaries fail → fallback fills AT MOST ONE slot (never Gemma-vs-Gemma); the other stays null → contestation not-measured", async () => {
    const a = new LlmReader("reader-a", fail, GLM, HYP);
    const b = new LlmReader("reader-b", fail, M2, HYP);
    const fbStub = counting("supports");
    const fb = new LlmReader("reader-fallback", fbStub.transport, GEMMA, HYP);
    const { slotA, slotB, bothPrimariesFailed } = await readWithFallback(claim("c1"), a, b, fb);

    expect(bothPrimariesFailed).toBe(true);
    expect(fbStub.calls()).toBeLessThanOrEqual(1); // fallback runs at most once per claim
    const filled = [slotA, slotB].filter((s): s is ReaderJudgement => s !== null);
    expect(filled).toHaveLength(1); // degrade to one-reader, never two
    const byFallback = [slotA, slotB].filter((s) => s?.readerModel === GEMMA);
    expect(byFallback.length).toBeLessThanOrEqual(1); // never two leans by the same fallback model

    const profile = buildReliabilityProfile(claim("c1"), filled, null, {});
    expect(profile.internalContestation).toEqual({ kind: "not-measured" }); // one reader → not-measured
  });
});
