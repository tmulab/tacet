import { describe, it, expect } from "vitest";
import { DistinctReaders, assertDistinctCompanies } from "../src/llm/slots.js";
import type { AttemptResult, ModelSpec, ModelTransport } from "../src/llm/cascade.js";

function ok(content: string): AttemptResult {
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

const spec = (id: string): ModelSpec => ({ id, base: "x" }); // company = id prefix
const FAST = { backoffMs: [0, 0, 0] } as const;

// Distinct companies by prefix:
const A = spec("nvidia/nano"); // nvidia
const B = spec("openai/oss"); // openai
const C = spec("google/gemma"); // google
const POOL = [spec("poolside/laguna"), spec("nvidia/super"), spec("mistral/nemo")];

describe("assertDistinctCompanies", () => {
  it("passes for mutually distinct companies", () => {
    expect(() => assertDistinctCompanies([A, B, C])).not.toThrow();
  });
  it("throws when two slots share a company", () => {
    expect(() => assertDistinctCompanies([A, spec("nvidia/super")])).toThrow(/share company 'nvidia'/);
  });
});

describe("DistinctReaders", () => {
  it("throws at construction if slots collide by company", () => {
    const { transport } = scripted({});
    expect(() => new DistinctReaders([A, spec("nvidia/super")], POOL, transport, FAST)).toThrow(/nvidia/);
  });

  it("fills every slot from its primary when all succeed", async () => {
    const { transport } = scripted({
      "nvidia/nano": ok("a"),
      "openai/oss": ok("b"),
      "google/gemma": ok("c"),
    });
    const dr = new DistinctReaders([A, B, C], POOL, transport, FAST);
    const r = await dr.allocate("s", "u");
    expect(r.map((x) => x?.model)).toEqual(["nvidia/nano", "openai/oss", "google/gemma"]);
    expect(r.every((x) => x !== null && !x.fromPool)).toBe(true);
  });

  it("rescues a failed slot from the pool with a distinct company", async () => {
    const { transport } = scripted({
      "nvidia/nano": http(500), // A fails
      "openai/oss": ok("b"),
      "google/gemma": ok("c"),
      "poolside/laguna": ok("rescue"), // poolside ∉ {openai, google} → eligible
    });
    const dr = new DistinctReaders([A, B, C], POOL, transport, FAST);
    const r = await dr.allocate("s", "u");
    expect(r[0]?.model).toBe("poolside/laguna");
    expect(r[0]?.fromPool).toBe(true);
  });

  it("skips a pool model whose company is already used by a surviving slot", async () => {
    // A (nvidia) fails; pool's first eligible by rank is poolside, but make it
    // dead so the next candidate nvidia/super is considered — and REJECTED is
    // wrong here (nvidia is free since A died). Instead test openai collision:
    const POOL2 = [spec("openai/another"), spec("poolside/laguna")];
    const { transport, calls } = scripted({
      "nvidia/nano": http(500), // A (nvidia) fails
      "openai/oss": ok("b"), // B (openai) lives → openai is used
      "google/gemma": ok("c"),
      "openai/another": ok("nope"), // same company as live B → must be skipped
      "poolside/laguna": ok("rescue"),
    });
    const dr = new DistinctReaders([A, B, C], POOL2, transport, FAST);
    const r = await dr.allocate("s", "u");
    expect(r[0]?.model).toBe("poolside/laguna");
    expect(calls()["openai/another"]).toBeUndefined(); // never even called
  });

  it("both primaries fail → both rescued from pool with DISTINCT companies", async () => {
    const { transport } = scripted({
      "nvidia/nano": http(500), // A fails
      "openai/oss": http(500), // B fails
      "poolside/laguna": ok("r1"), // poolside → slot A
      "nvidia/super": ok("r2"), // nvidia → slot B (distinct from poolside)
    });
    const dr = new DistinctReaders([A, B], POOL, transport, FAST);
    const r = await dr.allocate("s", "u");
    expect(r[0]?.model).toBe("poolside/laguna");
    expect(r[1]?.model).toBe("nvidia/super");
    expect(r[0]?.model.split("/")[0]).not.toBe(r[1]?.model.split("/")[0]);
  });

  it("both fail and pool offers only ONE company → one rescued, the other stays null", async () => {
    const ONE = [spec("poolside/laguna"), spec("poolside/other")]; // same company
    const { transport } = scripted({
      "nvidia/nano": http(500),
      "openai/oss": http(500),
      "poolside/laguna": ok("r1"),
      "poolside/other": ok("r2"),
    });
    const dr = new DistinctReaders([A, B], ONE, transport, FAST);
    const r = await dr.allocate("s", "u");
    const filled = r.filter((x) => x !== null);
    expect(filled.length).toBe(1);
    expect(filled[0]?.model).toBe("poolside/laguna");
    expect(r.includes(null)).toBe(true);
  });

  it("leaves a slot null when no eligible pool model succeeds", async () => {
    const { transport } = scripted({
      "nvidia/nano": http(500),
      "openai/oss": ok("b"),
      "google/gemma": ok("c"),
      // pool all dead
      "poolside/laguna": http(500),
      "nvidia/super": http(500),
      "mistral/nemo": http(500),
    });
    const dr = new DistinctReaders([A, B, C], POOL, transport, FAST);
    const r = await dr.allocate("s", "u");
    expect(r[0]).toBeNull();
    expect(r[1]?.model).toBe("openai/oss");
  });

  it("does not call a pool model twice across two failed slots", async () => {
    const { transport, calls } = scripted({
      "nvidia/nano": http(500),
      "openai/oss": http(500),
      "poolside/laguna": http(500), // dead — must not be retried for the 2nd slot
      "mistral/nemo": ok("r"),
    });
    const dr = new DistinctReaders([A, B], [spec("poolside/laguna"), spec("mistral/nemo")], transport, FAST);
    await dr.allocate("s", "u");
    expect(calls()["poolside/laguna"]).toBe(1);
  });
});
