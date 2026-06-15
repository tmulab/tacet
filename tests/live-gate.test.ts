import { describe, it, expect } from "vitest";
import {
  secretMatches,
  checkSecret,
  SlidingWindowRateLimiter,
  guardLive,
  runLiveGuarded,
  extractSecret,
  liveSecretFromEnv,
} from "../src/live/gate.js";
import type { GuardInput } from "../src/live/gate.js";

/**
 * E3-AUTH — the SERVER-SIDE gate for live mode. Pure logic, no HTTP, no network:
 * the future Next route wires these. The model call is modelled as an injected
 * `action` so "the model is NEVER called on a blocked path" is a real assertion,
 * not a hope. The frozen-case replay never touches this gate (it spends no LLM).
 */

const SECRET = "correct-horse-battery-staple-9f3a";

function limiter(over: Partial<{ windowMs: number; perKeyMax: number; globalMax: number }> = {}): SlidingWindowRateLimiter {
  return new SlidingWindowRateLimiter({ windowMs: 3_600_000, perKeyMax: 5, globalMax: 100, ...over });
}
function input(over: Partial<GuardInput> = {}): GuardInput {
  return { expectedSecret: SECRET, providedSecret: SECRET, ip: "1.1.1.1", now: 0, limiter: limiter(), ...over };
}

describe("secretMatches (timing-safe, length-normalized)", () => {
  it("accepts the exact secret", () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true);
  });
  it("rejects a wrong secret of the SAME length", () => {
    const wrong = "x".repeat(SECRET.length);
    expect(secretMatches(wrong, SECRET)).toBe(false);
  });
  it("rejects a wrong secret of a DIFFERENT length WITHOUT throwing", () => {
    expect(() => secretMatches("short", SECRET)).not.toThrow();
    expect(secretMatches("short", SECRET)).toBe(false);
    expect(secretMatches(SECRET + "tail", SECRET)).toBe(false);
  });
  it("rejects undefined and empty", () => {
    expect(secretMatches(undefined, SECRET)).toBe(false);
    expect(secretMatches("", SECRET)).toBe(false);
  });
});

describe("checkSecret", () => {
  it("503 (fail-closed) when no secret is configured", () => {
    expect(checkSecret(undefined, SECRET)).toMatchObject({ allow: false, status: 503 });
    expect(checkSecret("", SECRET)).toMatchObject({ allow: false, status: 503 });
  });
  it("401 on a wrong secret", () => {
    expect(checkSecret(SECRET, "nope")).toMatchObject({ allow: false, status: 401 });
  });
  it("401 on a missing secret", () => {
    expect(checkSecret(SECRET, undefined)).toMatchObject({ allow: false, status: 401 });
  });
  it("allows the correct secret", () => {
    expect(checkSecret(SECRET, SECRET)).toEqual({ allow: true });
  });
});

describe("SlidingWindowRateLimiter", () => {
  it("allows up to perKeyMax then 429s the next, with a Retry-After", () => {
    const rl = limiter({ perKeyMax: 3 });
    expect(rl.check("ip", 0).allowed).toBe(true);
    expect(rl.check("ip", 10).allowed).toBe(true);
    expect(rl.check("ip", 20).allowed).toBe(true);
    const denied = rl.check("ip", 30);
    expect(denied.allowed).toBe(false);
    if (denied.allowed === false) expect(denied.retryAfterSec).toBeGreaterThan(0);
  });
  it("enforces a GLOBAL cap across distinct keys", () => {
    const rl = limiter({ perKeyMax: 100, globalMax: 2 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("b", 1).allowed).toBe(true);
    expect(rl.check("c", 2).allowed).toBe(false); // global full though each key is fresh
  });
  it("slides: a hit leaving the window frees a slot", () => {
    const rl = limiter({ windowMs: 1000, perKeyMax: 1 });
    expect(rl.check("ip", 0).allowed).toBe(true);
    expect(rl.check("ip", 500).allowed).toBe(false); // within window
    expect(rl.check("ip", 1001).allowed).toBe(true); // first hit aged out
  });
  it("a denied request does NOT consume budget", () => {
    const rl = limiter({ perKeyMax: 1 });
    expect(rl.check("ip", 0).allowed).toBe(true);
    expect(rl.check("ip", 1).allowed).toBe(false);
    expect(rl.check("ip", 2).allowed).toBe(false); // still just the one recorded hit
  });
});

describe("guardLive (secret BEFORE rate limit)", () => {
  it("503 when unconfigured, without touching the limiter", () => {
    const lim = limiter({ perKeyMax: 1 });
    expect(guardLive(input({ expectedSecret: undefined, limiter: lim }))).toMatchObject({ status: 503 });
    expect(lim.check("1.1.1.1", 0).allowed).toBe(true); // budget intact — failed gate didn't spend it
  });
  it("401 on wrong secret, without consuming rate budget", () => {
    const lim = limiter({ perKeyMax: 1 });
    expect(guardLive(input({ providedSecret: "wrong", limiter: lim }))).toMatchObject({ status: 401 });
    expect(lim.check("1.1.1.1", 0).allowed).toBe(true); // public can't exhaust the limiter
  });
  it("allows a correct secret under the limit", () => {
    expect(guardLive(input())).toEqual({ allow: true });
  });
  it("429 with retryAfter once a valid caller exceeds the limit", () => {
    const lim = limiter({ perKeyMax: 1 });
    expect(guardLive(input({ limiter: lim, now: 0 }))).toEqual({ allow: true });
    const d = guardLive(input({ limiter: lim, now: 1 }));
    expect(d).toMatchObject({ allow: false, status: 429 });
    if (d.allow === false && d.status === 429) expect(d.retryAfter).toBeGreaterThan(0);
  });
});

describe("runLiveGuarded — the model is never called on a blocked path", () => {
  const spy = () => {
    let calls = 0;
    return { action: async () => { calls += 1; return "MODEL_RESULT"; }, calls: () => calls };
  };

  it("runs the action exactly once when allowed", async () => {
    const s = spy();
    const r = await runLiveGuarded(input(), s.action);
    expect(r).toEqual({ ok: true, value: "MODEL_RESULT" });
    expect(s.calls()).toBe(1);
  });
  it("wrong secret → 401 and ZERO model calls", async () => {
    const s = spy();
    const r = await runLiveGuarded(input({ providedSecret: "wrong" }), s.action);
    expect(r.ok).toBe(false);
    expect(s.calls()).toBe(0);
  });
  it("missing secret → 401 and ZERO model calls", async () => {
    const s = spy();
    await runLiveGuarded(input({ providedSecret: undefined }), s.action);
    expect(s.calls()).toBe(0);
  });
  it("unconfigured → 503 and ZERO model calls (fail-closed)", async () => {
    const s = spy();
    const r = await runLiveGuarded(input({ expectedSecret: undefined }), s.action);
    expect(r).toMatchObject({ ok: false, blocked: { status: 503 } });
    expect(s.calls()).toBe(0);
  });
  it("rate-limited → 429 and ZERO model calls", async () => {
    const s = spy();
    const lim = limiter({ perKeyMax: 1 });
    await runLiveGuarded(input({ limiter: lim, now: 0 }), s.action); // consumes the one slot
    const r = await runLiveGuarded(input({ limiter: lim, now: 1 }), s.action);
    expect(r).toMatchObject({ ok: false, blocked: { status: 429 } });
    expect(s.calls()).toBe(1); // only the first, allowed, call hit the model
  });
});

describe("extractSecret / liveSecretFromEnv (edge helpers)", () => {
  it("prefers the x-tacet-secret header, falls back to the body field", () => {
    expect(extractSecret({ headers: { "x-tacet-secret": "H" }, body: { secret: "B" } })).toBe("H");
    expect(extractSecret({ body: { secret: "B" } })).toBe("B");
    expect(extractSecret({ headers: {}, body: {} })).toBeUndefined();
  });
  it("reads TACET_LIVE_SECRET from env, treating empty/absent as not-set", () => {
    expect(liveSecretFromEnv({ TACET_LIVE_SECRET: "s" })).toBe("s");
    expect(liveSecretFromEnv({ TACET_LIVE_SECRET: "" })).toBeUndefined();
    expect(liveSecretFromEnv({})).toBeUndefined();
  });
});
