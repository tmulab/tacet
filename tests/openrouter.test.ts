import { describe, it, expect } from "vitest";
import { FREE_MODELS, resolveReaderSlots, specFor } from "../src/llm/openrouter.js";

describe("specFor", () => {
  it("returns the known FREE_MODELS entry (with company + reasoning)", () => {
    const s = specFor("nvidia/nemotron-3-super-120b-a12b:free");
    expect(s.company).toBe("nvidia");
    expect(s.reasoning).toBe(true);
  });
  it("constructs a spec for an unknown id, company = prefix", () => {
    const s = specFor("acme/custom-model:free");
    expect(s.company).toBe("acme");
    expect(s.base).toContain("openrouter.ai");
  });
  it("honors a custom base for a known id", () => {
    const s = specFor("openai/gpt-oss-120b:free", "http://localhost:8000/v1");
    expect(s.base).toBe("http://localhost:8000/v1");
    expect(s.company).toBe("openai");
  });
});

describe("resolveReaderSlots", () => {
  it("defaults: A=nemotron-nano, B=gpt-oss-120b, reserve C=gemma at pool head", () => {
    const { a, b, pool } = resolveReaderSlots({});
    expect(a.id).toBe("nvidia/nemotron-3-nano-30b-a3b:free");
    expect(b.id).toBe("openai/gpt-oss-120b:free");
    expect(pool[0]?.id).toBe("google/gemma-4-26b-a4b-it:free");
  });

  it("A and B are excluded from the pool; the rest of FREE_MODELS tails it", () => {
    const { a, b, pool } = resolveReaderSlots({});
    const ids = pool.map((m) => m.id);
    expect(ids).not.toContain(a.id);
    expect(ids).not.toContain(b.id);
    // every leftover FREE_MODEL (not A/B/C) is present
    expect(ids).toContain("nvidia/nemotron-3-super-120b-a12b:free");
    expect(ids).toContain("poolside/laguna-m.1:free");
  });

  it("honors env overrides for A, B and the reserve C", () => {
    const { a, b, pool } = resolveReaderSlots({
      READER_A_MODEL: "meta-llama/llama-3.3-70b-instruct:free",
      READER_B_MODEL: "qwen/qwen3-coder:free",
      READER_FALLBACK_MODEL: "poolside/laguna-m.1:free",
    });
    expect(a.id).toBe("meta-llama/llama-3.3-70b-instruct:free");
    expect(b.id).toBe("qwen/qwen3-coder:free");
    expect(pool[0]?.id).toBe("poolside/laguna-m.1:free");
    expect(pool.map((m) => m.id)).not.toContain(a.id);
  });

  it("a custom (non-FREE_MODELS) pick gets company = id prefix", () => {
    const { a } = resolveReaderSlots({ READER_A_MODEL: "cohere/command-r:free" });
    expect(a.company).toBe("cohere");
  });

  it("FREE_MODELS has no duplicate ids and every entry carries a company", () => {
    const ids = FREE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(FREE_MODELS.every((m) => (m.company ?? "").length > 0)).toBe(true);
  });
});
