import { describe, it, expect } from "vitest";
import { Cascade, companyOf, tryModel } from "../src/llm/cascade.js";
import type { AttemptResult, ModelSpec, ModelTransport } from "../src/llm/cascade.js";

// ── test transport: script an AttemptResult (or a sequence) per model id ──────
function ok(content = '{"lean":"supports"}'): AttemptResult {
  return { ok: true, content, seconds: 0.1 };
}
function http(status: number): AttemptResult {
  return { ok: false, status, seconds: 0.1, error: `HTTP ${status}` };
}
function scripted(scripts: Record<string, AttemptResult | AttemptResult[]>): {
  transport: ModelTransport;
  calls: () => Record<string, number>;
} {
  const counts: Record<string, number> = {};
  const transport: ModelTransport = async (model) => {
    counts[model.id] = (counts[model.id] ?? 0) + 1;
    const s = scripts[model.id];
    if (s === undefined) return http(404);
    if (Array.isArray(s)) return s[Math.min(counts[model.id]! - 1, s.length - 1)]!;
    return s;
  };
  return { transport, calls: () => counts };
}

const spec = (id: string, company?: string): ModelSpec =>
  company === undefined ? { id, base: "x" } : { id, base: "x", company };

const FAST = { backoffMs: [0, 0, 0] } as const; // no real sleeps in tests

describe("companyOf", () => {
  it("defaults to the id prefix before the slash", () => {
    expect(companyOf(spec("nvidia/nemotron-3-nano-30b-a3b:free"))).toBe("nvidia");
    expect(companyOf(spec("openai/gpt-oss-120b:free"))).toBe("openai");
  });
  it("honors an explicit company override", () => {
    expect(companyOf(spec("some/weird-id", "acme"))).toBe("acme");
  });
  it("falls back to the whole id when there is no slash", () => {
    expect(companyOf(spec("stub"))).toBe("stub");
  });
});

describe("tryModel", () => {
  it("returns content on first success", async () => {
    const { transport, calls } = scripted({ "a/m": ok("hi") });
    const r = await tryModel(spec("a/m"), transport, "s", "u", FAST);
    expect(r.ok).toBe(true);
    expect(r.content).toBe("hi");
    expect(r.attempts).toBe(1);
    expect(calls()["a/m"]).toBe(1);
  });

  it("retries on 429 with backoff, then succeeds", async () => {
    const { transport, calls } = scripted({ "a/m": [http(429), http(429), ok("ok")] });
    const r = await tryModel(spec("a/m"), transport, "s", "u", { ...FAST, retries: 3 });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
    expect(calls()["a/m"]).toBe(3);
  });

  it("does NOT retry a non-retryable status (404), fails after one attempt", async () => {
    const { transport, calls } = scripted({ "a/m": [http(404), ok("late")] });
    const r = await tryModel(spec("a/m"), transport, "s", "u", FAST);
    expect(r.ok).toBe(false);
    expect(calls()["a/m"]).toBe(1);
  });

  it("gives up on 429 once retries are exhausted", async () => {
    const { transport, calls } = scripted({ "a/m": http(429) });
    const r = await tryModel(spec("a/m"), transport, "s", "u", { ...FAST, retries: 2 });
    expect(r.ok).toBe(false);
    expect(calls()["a/m"]).toBe(3); // 1 initial + 2 retries
  });

  it("treats a response failing validate() as a failure and does not retry it", async () => {
    const { transport, calls } = scripted({ "a/m": ok("") });
    const r = await tryModel(spec("a/m"), transport, "s", "u", {
      ...FAST,
      validate: (c) => c.length > 0,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("validation-failed");
    expect(calls()["a/m"]).toBe(1); // temperature 0 → no point retrying
  });
});

describe("Cascade", () => {
  it("throws when constructed with no models", () => {
    const { transport } = scripted({});
    expect(() => new Cascade([], transport)).toThrow(/at least one/);
  });

  it("returns the first model that succeeds, without calling later ones", async () => {
    const { transport, calls } = scripted({ "a/m": ok("first"), "b/m": ok("second") });
    const c = new Cascade([spec("a/m"), spec("b/m")], transport, FAST);
    const r = await c.run("s", "u");
    expect(r.ok).toBe(true);
    expect(r.model).toBe("a/m");
    expect(r.content).toBe("first");
    expect(calls()["b/m"]).toBeUndefined();
  });

  it("skips a dead (404) model and falls through to the next", async () => {
    const { transport } = scripted({ "a/m": http(404), "b/m": ok("rescued") });
    const c = new Cascade([spec("a/m"), spec("b/m")], transport, FAST);
    const r = await c.run("s", "u");
    expect(r.ok).toBe(true);
    expect(r.model).toBe("b/m");
  });

  it("retries 429 on a model then moves on if still failing", async () => {
    const { transport, calls } = scripted({ "a/m": http(429), "b/m": ok("ok") });
    const c = new Cascade([spec("a/m"), spec("b/m")], transport, { ...FAST, retries: 2 });
    const r = await c.run("s", "u");
    expect(r.model).toBe("b/m");
    expect(calls()["a/m"]).toBe(3);
  });

  it("cascades on a validate() failure, not just HTTP failure", async () => {
    const { transport } = scripted({ "a/m": ok("garbage"), "b/m": ok('{"lean":"supports"}') });
    const c = new Cascade([spec("a/m"), spec("b/m")], transport, {
      ...FAST,
      validate: (cont) => cont.includes("lean"),
    });
    const r = await c.run("s", "u");
    expect(r.model).toBe("b/m");
  });

  it("returns a failure outcome when every model is exhausted", async () => {
    const { transport } = scripted({ "a/m": http(404), "b/m": http(500) });
    const c = new Cascade([spec("a/m"), spec("b/m")], transport, FAST);
    const r = await c.run("s", "u");
    expect(r.ok).toBe(false);
  });
});
