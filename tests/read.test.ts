import { describe, it, expect } from "vitest";
import { readClaim } from "../src/ingestion/read.js";
import { buildConvergenceMap } from "../src/domain/convergence.js";
import { buildReliabilityProfile } from "../src/domain/reliability.js";
import type { AttemptResult, ModelSpec, ModelTransport } from "../src/llm/cascade.js";
import type { ResolvedSlots } from "../src/llm/openrouter.js";
import type { Claim, ReaderJudgement } from "../src/domain/types.js";

/**
 * Reader orchestration over the distinct-company allocator (DistinctReaders).
 * Transport stubs only — no network. Contract:
 *  - a failed primary is RESCUED from the reserve pool, but only by a model whose
 *    company is free; the lean records the producing model;
 *  - both primaries may be rescued, IF they land on DISTINCT companies (no model
 *    ever agrees with itself);
 *  - both succeeding primaries → no pool model is called (no tiebreaking);
 *  - no eligible rescue → the slot stays null (degrade to one reader).
 *
 * NOTE: this replaces the pre-cascade "fallback fills AT MOST ONE slot" rule.
 * That rule existed because there was a single reserve model (Gemma-vs-Gemma was
 * self-agreement). With a company-distinct pool, both slots filling from
 * DIFFERENT companies is legitimate — decision #6/#7, updated.
 */

const A: ModelSpec = { id: "nvidia/nano", base: "x", company: "nvidia" };
const B: ModelSpec = { id: "openai/oss", base: "x", company: "openai" };
const GEMMA: ModelSpec = { id: "google/gemma", base: "x", company: "google" };
const POOLSIDE: ModelSpec = { id: "poolside/laguna", base: "x", company: "poolside" };

const slotsWith = (pool: ModelSpec[]): ResolvedSlots => ({ a: A, b: B, pool });
const FAST = { backoffMs: [0, 0, 0] } as const;
const HYP = "A origem zoonótica natural é a mais sustentada, porém a questão permanece inconclusiva.";

const claim = (id = "c1"): Claim => ({
  id,
  text: "claim",
  provenance: [{ sourceId: id, locator: `loc:${id}`, summary: "evidence", summaryMethod: "llm" }],
});

const okLean = (lean: string): AttemptResult => ({ ok: true, content: `{"lean":"${lean}","rationale":"r"}`, seconds: 0 });
const http = (status: number): AttemptResult => ({ ok: false, status, seconds: 0, error: `HTTP ${status}` });

function scripted(scripts: Record<string, AttemptResult>): { transport: ModelTransport; calls: () => Record<string, number>; system: () => string } {
  const counts: Record<string, number> = {};
  let lastSystem = "";
  const transport: ModelTransport = async (model, system) => {
    counts[model.id] = (counts[model.id] ?? 0) + 1;
    lastSystem = system;
    return scripts[model.id] ?? http(404);
  };
  return { transport, calls: () => counts, system: () => lastSystem };
}

describe("readClaim — rescue & independence", () => {
  it("(i) primary A fails → rescued from pool (distinct company); A's lean records the rescue model", async () => {
    const { transport } = scripted({ "nvidia/nano": http(500), "openai/oss": okLean("supports"), "google/gemma": okLean("contradicts") });
    const { slotA, slotB, rescued } = await readClaim(claim(), HYP, slotsWith([GEMMA, POOLSIDE]), transport, FAST);
    expect(slotA?.lean).toBe("contradicts");
    expect(slotA?.readerId).toBe("reader-a"); // re-slotted to the position it fills
    expect(slotA?.readerModel).toBe("google/gemma"); // auditable as the rescue model
    expect(slotB?.readerModel).toBe("openai/oss");
    expect(rescued).toBe(1);
  });

  it("(j) both primaries OK and DIVERGE → no pool model is called; the crux stands", async () => {
    const { transport, calls } = scripted({ "nvidia/nano": okLean("supports"), "openai/oss": okLean("contradicts"), "google/gemma": okLean("insufficient") });
    const { slotA, slotB, rescued, bothPrimariesFailed } = await readClaim(claim(), HYP, slotsWith([GEMMA, POOLSIDE]), transport, FAST);
    expect(calls()["google/gemma"]).toBeUndefined();
    expect(rescued).toBe(0);
    expect(bothPrimariesFailed).toBe(false);
    expect(slotA?.lean).toBe("supports");
    expect(slotB?.lean).toBe("contradicts");
  });

  it("both primaries OK and CONVERGE → no pool model is called either", async () => {
    const { transport, calls } = scripted({ "nvidia/nano": okLean("supports"), "openai/oss": okLean("supports"), "google/gemma": okLean("contradicts") });
    const { slotA, slotB } = await readClaim(claim(), HYP, slotsWith([GEMMA]), transport, FAST);
    expect(calls()["google/gemma"]).toBeUndefined();
    expect(slotA?.lean).toBe("supports");
    expect(slotB?.lean).toBe("supports");
  });

  it("(NEW) both primaries fail → BOTH rescued, from DISTINCT companies → two leans, contestation measured", async () => {
    const { transport } = scripted({ "nvidia/nano": http(500), "openai/oss": http(500), "google/gemma": okLean("supports"), "poolside/laguna": okLean("contradicts") });
    const { slotA, slotB, rescued, bothPrimariesFailed } = await readClaim(claim("c1"), HYP, slotsWith([GEMMA, POOLSIDE]), transport, FAST);
    expect(bothPrimariesFailed).toBe(true);
    expect(rescued).toBe(2);
    expect(slotA?.readerModel).toBe("google/gemma");
    expect(slotB?.readerModel).toBe("poolside/laguna");
    expect(slotA?.readerModel.split("/")[0]).not.toBe(slotB?.readerModel.split("/")[0]); // distinct company

    const signal = buildConvergenceMap([slotA as ReaderJudgement], [slotB as ReaderJudgement]).verdicts[0]?.signal ?? null;
    const profile = buildReliabilityProfile(claim("c1"), [slotA, slotB].filter((s): s is ReaderJudgement => s !== null), signal, {});
    expect(profile.internalContestation).toEqual({ kind: "measured", value: true });
  });

  it("(edge) both fail and the pool offers only ONE company → one rescued, the other null → contestation not-measured", async () => {
    const G2: ModelSpec = { id: "google/other", base: "x", company: "google" }; // same company as GEMMA
    const { transport } = scripted({ "nvidia/nano": http(500), "openai/oss": http(500), "google/gemma": okLean("supports"), "google/other": okLean("supports") });
    const { slotA, slotB, bothPrimariesFailed } = await readClaim(claim("c1"), HYP, slotsWith([GEMMA, G2]), transport, FAST);
    expect(bothPrimariesFailed).toBe(true);
    const filled = [slotA, slotB].filter((s): s is ReaderJudgement => s !== null);
    expect(filled).toHaveLength(1);
    const profile = buildReliabilityProfile(claim("c1"), filled, null, {});
    expect(profile.internalContestation).toEqual({ kind: "not-measured" });
  });

  it("(k) primary A fails and NO eligible rescue succeeds → slot A null, slot B primary stands", async () => {
    const { transport } = scripted({ "nvidia/nano": http(500), "openai/oss": okLean("supports"), "google/gemma": http(500), "poolside/laguna": http(500) });
    const { slotA, slotB } = await readClaim(claim(), HYP, slotsWith([GEMMA, POOLSIDE]), transport, FAST);
    expect(slotA).toBeNull();
    expect(slotB?.lean).toBe("supports");
  });

  it("(l) readerModel is present and correct on each saved primary lean", async () => {
    const { transport } = scripted({ "nvidia/nano": okLean("supports"), "openai/oss": okLean("insufficient") });
    const { slotA, slotB } = await readClaim(claim(), HYP, slotsWith([GEMMA]), transport, FAST);
    expect(slotA?.readerModel).toBe("nvidia/nano");
    expect(slotB?.readerModel).toBe("openai/oss");
  });

  it("(m) the shared reference hypothesis is injected into the SYSTEM prompt (anchor, not persona)", async () => {
    const cap = scripted({ "nvidia/nano": okLean("supports"), "openai/oss": okLean("supports") });
    await readClaim(claim(), HYP, slotsWith([GEMMA]), cap.transport, FAST);
    expect(cap.system()).toContain(HYP);
  });
});
