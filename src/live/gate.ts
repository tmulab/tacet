/**
 * gate.ts — the SERVER-SIDE gate for TACET's live mode (E3-AUTH).
 *
 * Live mode is the only path that spends LLM tokens (step 0, harvest, on-demand
 * readers). The frozen-case replay is offline and stays OPEN — the judge sees
 * the method without logging in. This gate protects ONLY the live endpoint.
 *
 * Two cheap layers, both pure and testable here (the future Next route just
 * wires them; the check NEVER lives in the frontend — a password checked in
 * React is theatre):
 *   1. a shared secret (TACET_LIVE_SECRET, server env only) compared
 *      timing-safely BEFORE any token is spent;
 *   2. an in-memory sliding-window rate limit (per-IP + global) as the second
 *      layer if the secret ever leaks.
 *
 * Fail-closed: no secret configured → 503, live mode does not run. A blocked
 * path makes ZERO model calls (proven by injecting the model call as `action`).
 */

import { createHash, timingSafeEqual } from "node:crypto";

export type Blocked =
  | { readonly allow: false; readonly status: 401; readonly reason: string }
  | { readonly allow: false; readonly status: 503; readonly reason: string }
  | { readonly allow: false; readonly status: 429; readonly reason: string; readonly retryAfter: number };
export type GateDecision = { readonly allow: true } | Blocked;

/**
 * Timing-safe secret comparison. Both sides are hashed to a fixed-length SHA-256
 * digest first, so `timingSafeEqual` (which throws on unequal lengths) never
 * throws and the comparison leaks neither the secret's length nor the length of
 * a correct prefix — unlike `===`, which short-circuits.
 */
export function secretMatches(provided: string | undefined, expected: string): boolean {
  if (provided === undefined || provided.length === 0) return false;
  const digest = (s: string): Buffer => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

/** The secret layer. 503 when unconfigured (fail-closed), 401 when wrong/absent. */
export function checkSecret(expected: string | undefined, provided: string | undefined): GateDecision {
  if (expected === undefined || expected.length === 0) {
    return { allow: false, status: 503, reason: "live mode disabled: TACET_LIVE_SECRET not set" };
  }
  if (!secretMatches(provided, expected)) {
    return { allow: false, status: 401, reason: "invalid or missing secret" };
  }
  return { allow: true };
}

export interface RateLimitConfig {
  readonly windowMs: number;
  readonly perKeyMax: number;
  readonly globalMax: number;
}
export type RateLimitResult = { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSec: number };

/**
 * In-memory sliding-window limiter (per-key + global). Pure given (key, now):
 * the caller injects `now`, and a hit is recorded ONLY when allowed — a denied
 * request does not consume budget. In-memory is enough for the submission; no
 * Redis. The route passes the client IP as the key and `Date.now()` as `now`.
 */
export class SlidingWindowRateLimiter {
  private readonly perKey = new Map<string, number[]>();
  private global: number[] = [];

  constructor(private readonly cfg: RateLimitConfig) {}

  check(key: string, now: number): RateLimitResult {
    const cutoff = now - this.cfg.windowMs;
    const keyHits = (this.perKey.get(key) ?? []).filter((t) => t > cutoff);
    const globalHits = this.global.filter((t) => t > cutoff);

    if (globalHits.length >= this.cfg.globalMax) return deny(globalHits, this.cfg.windowMs, now);
    if (keyHits.length >= this.cfg.perKeyMax) return deny(keyHits, this.cfg.windowMs, now);

    keyHits.push(now);
    globalHits.push(now);
    this.perKey.set(key, keyHits);
    this.global = globalHits;
    return { allowed: true };
  }
}

/** Retry-After = seconds until the oldest in-window hit ages out (>= 1). */
function deny(hits: readonly number[], windowMs: number, now: number): RateLimitResult {
  const oldest = hits[0] ?? now;
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
}

export interface GuardInput {
  /** TACET_LIVE_SECRET from the server env (undefined/empty → fail-closed). */
  readonly expectedSecret: string | undefined;
  /** secret sent by the client (x-tacet-secret header or body field). */
  readonly providedSecret: string | undefined;
  readonly ip: string;
  readonly now: number;
  readonly limiter: SlidingWindowRateLimiter;
}

/**
 * The full gate: secret FIRST (so an unauthenticated public can never exhaust
 * the limiter), then rate limit. The limiter is touched only by callers who
 * passed the secret.
 *
 * E3 TODO (deferred, noted at the user's request): a FAILED secret attempt is
 * NOT rate-limited here — by design, the limiter throttles only callers who got
 * in (spec: "the secret bars the public; the limit bars abuse by whoever
 * passed"). The brute-force defense today is a single strong secret + the
 * timing-safe compare. When the live route lands (E3), consider a SECOND,
 * separate per-IP limiter on auth FAILURES (e.g. 10 wrong tries / 15 min → 429)
 * so a leaked endpoint can't be hammered with guesses. Keep it separate from
 * this post-auth limiter so a guesser can't consume the legitimate budget.
 */
export function guardLive(input: GuardInput): GateDecision {
  const secret = checkSecret(input.expectedSecret, input.providedSecret);
  if (!secret.allow) return secret; // 503 / 401 — limiter untouched
  const rl = input.limiter.check(input.ip, input.now);
  if (!rl.allowed) {
    return { allow: false, status: 429, reason: "live rate limit exceeded", retryAfter: rl.retryAfterSec };
  }
  return { allow: true };
}

export type Guarded<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly blocked: Blocked };

/**
 * Run `action` (the token-spending live work) ONLY if the gate allows. On any
 * block, `action` is never invoked — this is the executable form of "no model
 * call on the blocked path".
 */
export async function runLiveGuarded<T>(input: GuardInput, action: () => Promise<T>): Promise<Guarded<T>> {
  const decision = guardLive(input);
  if (!decision.allow) return { ok: false, blocked: decision };
  return { ok: true, value: await action() };
}

// ── edge helpers (used by the future Next route; trivial, kept testable) ──────

/** The provided secret: x-tacet-secret header preferred, then a `secret` body field. */
export function extractSecret(req: {
  readonly headers?: Record<string, string | undefined>;
  readonly body?: { readonly secret?: unknown };
}): string | undefined {
  const header = req.headers?.["x-tacet-secret"];
  if (typeof header === "string" && header.length > 0) return header;
  const field = req.body?.secret;
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

/** Reads TACET_LIVE_SECRET; an empty or absent value is treated as not-set. */
export function liveSecretFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const s = env["TACET_LIVE_SECRET"];
  return s !== undefined && s.length > 0 ? s : undefined;
}
