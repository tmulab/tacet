import { describe, it, expect } from "vitest";
import { LlmReader } from "../src/readers/llm-reader.js";
import type { LlmTransport } from "../src/ingestion/llm.js";
import type { Claim } from "../src/domain/types.js";

/**
 * TDD where breaking hurts: parsing the lean JSON, the fallback when a reader
 * fails (the claim simply gets no judgement from that reader), and that
 * "insufficient" is a legitimate lean — never an exception. Transport is
 * INJECTED; no network here.
 */

const claim = (id = "10.x/abc"): Claim => ({
  id,
  text: "A paper about SARS-CoV-2 origins",
  provenance: [
    {
      sourceId: id,
      locator: `https://doi.org/${id}`,
      summary: "Maps the zoonotic vs lab debate.",
      summaryMethod: "llm",
      structured: {
        centralClaim: "The origin question remains contested.",
        citedEvidence: "Reviews spatial data and genomic analyses.",
        originStance: "both-considered",
        summaryText: "The paper weighs both origin hypotheses without settling them.",
      },
    },
  ],
});

const ok = (content: string): LlmTransport => () => Promise.resolve({ ok: true, content, seconds: 0 });
const httpError: LlmTransport = () => Promise.resolve({ ok: false, error: "HTTP 500", seconds: 0 });

describe("LlmReader", () => {
  it("(a) parses a valid structured lean and stamps its own readerId", async () => {
    const r = new LlmReader("reader-a", ok('{"lean":"supports","rationale":"evidence backs it"}'));
    const out = await r.read([claim()]);
    expect(out).toHaveLength(1);
    expect(out[0]?.readerId).toBe("reader-a");
    expect(out[0]?.lean).toBe("supports");
    expect(out[0]?.claimId).toBe("10.x/abc");
  });

  it("stamps the configured model as readerModel on each judgement", async () => {
    const r = new LlmReader("reader-a", ok('{"lean":"supports"}'), "z-ai/glm-4.6");
    const out = await r.read([claim()]);
    expect(out[0]?.readerModel).toBe("z-ai/glm-4.6");
  });

  it("(b) cleans leaked <think> before parsing", async () => {
    const r = new LlmReader("reader-a", ok('<think>hmm…</think>\n{"lean":"contradicts"}'));
    const out = await r.read([claim()]);
    expect(out[0]?.lean).toBe("contradicts");
  });

  it("(c) invalid JSON → fallback: the claim gets no judgement from this reader", async () => {
    const r = new LlmReader("reader-a", ok("the model rambled, no json"));
    const out = await r.read([claim()]);
    expect(out).toHaveLength(0);
  });

  it("(d) lean outside the enum → fallback (omitted), never coerced to a stance", async () => {
    const r = new LlmReader("reader-a", ok('{"lean":"maybe"}'));
    const out = await r.read([claim()]);
    expect(out).toHaveLength(0);
  });

  it("(e) 'insufficient' is a LEGITIMATE lean — returned, never thrown", async () => {
    const r = new LlmReader("reader-a", ok('{"lean":"insufficient","rationale":"cannot tell"}'));
    const out = await r.read([claim()]);
    expect(out).toHaveLength(1);
    expect(out[0]?.lean).toBe("insufficient");
  });

  it("HTTP error → fallback (omitted), does not throw", async () => {
    const r = new LlmReader("reader-a", httpError);
    const out = await r.read([claim()]);
    expect(out).toHaveLength(0);
  });

  it("reads multiple claims, omitting only the ones that fail", async () => {
    let n = 0;
    const flaky: LlmTransport = () => {
      n += 1;
      return Promise.resolve(n === 2 ? { ok: false, error: "boom", seconds: 0 } : { ok: true, content: '{"lean":"supports"}', seconds: 0 });
    };
    const r = new LlmReader("reader-a", flaky);
    const out = await r.read([claim("c1"), claim("c2"), claim("c3")]);
    expect(out.map((j) => j.claimId)).toEqual(["c1", "c3"]); // c2 fell back
  });
});
