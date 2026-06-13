import { describe, it, expect } from "vitest";
import { extractFirstJSON } from "../src/ingestion/llm.js";
import type { LlmTransport } from "../src/ingestion/llm.js";
import { summarizeClaim } from "../src/ingestion/summarize.js";
import type { Claim } from "../src/domain/types.js";

/**
 * TDD where breaking hurts: parsing the LLM JSON, the fallback to truncated-stub,
 * and never touching the network. The transport is INJECTED — these tests use
 * stubs (good JSON, leaked <think>, invalid JSON, HTTP error, bad enum) and
 * never hit a real endpoint.
 */

const claim = (): Claim => ({
  id: "10.x/abc",
  text: "A paper about SARS-CoV-2 origins",
  provenance: [
    {
      sourceId: "10.x/abc",
      locator: "https://doi.org/10.x/abc",
      summary: "An abstract discussing zoonotic spillover evidence.",
      summaryMethod: "truncated-stub",
      tags: { "language-family": "anglophone" },
    },
  ],
});

const goodJson = JSON.stringify({
  centralClaim: "Spillover at a wet market is the most parsimonious origin.",
  citedEvidence: "Spatial clustering of early cases around the market.",
  originStance: "zoonotic",
  summaryText: "The paper argues for a zoonotic origin. It cites spatial clustering of early cases. It does not weigh the lab hypothesis.",
});

const ok = (content: string): LlmTransport => () => Promise.resolve({ ok: true, content, seconds: 0 });
const httpError: LlmTransport = () => Promise.resolve({ ok: false, error: "HTTP 500", seconds: 0 });

describe("extractFirstJSON", () => {
  it("strips <think> and extracts the first JSON object", () => {
    expect(extractFirstJSON('<think>reasoning…</think>\n{"a":1} trailing')).toEqual({ a: 1 });
  });
  it("returns null when there is no JSON object", () => {
    expect(extractFirstJSON("no json here")).toBeNull();
  });
});

describe("summarizeClaim", () => {
  it("(a) good response → structured fields + summaryMethod 'llm'", async () => {
    const out = await summarizeClaim(claim(), ok(goodJson));
    const p = out.provenance[0];
    expect(p?.summaryMethod).toBe("llm");
    expect(p?.structured?.originStance).toBe("zoonotic");
    expect(p?.structured?.centralClaim).toBe("Spillover at a wet market is the most parsimonious origin.");
    expect(p?.summary).toBe(p?.structured?.summaryText); // demo summary = summaryText
  });

  it("(b) leaked <think> → extractFirstJSON cleans it and we still parse", async () => {
    const out = await summarizeClaim(claim(), ok(`<think>let me think</think>\n${goodJson}`));
    expect(out.provenance[0]?.summaryMethod).toBe("llm");
    expect(out.provenance[0]?.structured?.originStance).toBe("zoonotic");
  });

  it("(c) invalid JSON → fallback to truncated-stub, no structured fields", async () => {
    const out = await summarizeClaim(claim(), ok("the model rambled without any json"));
    expect(out.provenance[0]?.summaryMethod).toBe("truncated-stub");
    expect(out.provenance[0]?.structured).toBeUndefined();
  });

  it("(d) HTTP error → fallback to truncated-stub", async () => {
    const out = await summarizeClaim(claim(), httpError);
    expect(out.provenance[0]?.summaryMethod).toBe("truncated-stub");
    expect(out.provenance[0]?.structured).toBeUndefined();
  });

  it("(e) originStance outside the enum → coerced to 'none', still 'llm'", async () => {
    const badEnum = JSON.stringify({
      centralClaim: "c", citedEvidence: "e", originStance: "banana", summaryText: "A two sentence summary. Really.",
    });
    const out = await summarizeClaim(claim(), ok(badEnum));
    expect(out.provenance[0]?.summaryMethod).toBe("llm");
    expect(out.provenance[0]?.structured?.originStance).toBe("none");
  });

  it("leaves the original truncated-stub summary untouched on fallback", async () => {
    const out = await summarizeClaim(claim(), httpError);
    expect(out.provenance[0]?.summary).toBe("An abstract discussing zoonotic spillover evidence.");
  });
});
