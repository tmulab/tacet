/**
 * fetch-retry — retry + exponential backoff (with jitter) around a single HTTP
 * fetch, used ONLY by the harvest (the one networked path). Pure policy + an
 * injected transport, so tests drive it offline (no real network, no real sleep).
 *
 * Transient failures are retried: a thrown network error; HTTP 429; any 5xx; and
 * 404 — Crossref returns a transient 404 under load, which once aborted a whole
 * harvest. Permanent failures (400/401/403, other non-404 4xx) fail at once.
 * A `Retry-After` header (seconds or HTTP date) overrides the computed backoff,
 * capped for sanity. Every retry is logged; nothing is swallowed.
 */

/** Classify a non-ok HTTP status. The single source of the retry decision. */
export function classifyHttpFailure(status: number): "transient" | "permanent" {
  if (status === 429 || status === 404 || status >= 500) return "transient";
  return "permanent";
}

const RETRY_AFTER_CAP_MS = 60_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_FACTOR = 2;
const BACKOFF_CAP_MS = 30_000;

/**
 * Parse a `Retry-After` header into milliseconds: a delta-seconds integer, or an
 * HTTP date relative to `nowMs`. Garbage / absent → null (fall back to backoff).
 * Capped at RETRY_AFTER_CAP_MS so a hostile/buggy header cannot hang the harvest.
 */
export function parseRetryAfter(header: string | null | undefined, nowMs: number): number | null {
  if (header === null || header === undefined) return null;
  const trimmed = header.trim();
  if (trimmed.length === 0) return null;
  if (/^\d+$/.test(trimmed)) return Math.min(Number(trimmed) * 1000, RETRY_AFTER_CAP_MS);
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return null;
  return Math.min(Math.max(0, dateMs - nowMs), RETRY_AFTER_CAP_MS);
}

/** Exponential backoff with full-ish jitter: raw = min(cap, base·factor^(n-1));
 * the actual wait is 50–100% of raw so concurrent clients don't sync up. */
export function backoffDelay(attempt: number, rand: () => number): number {
  const raw = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * BACKOFF_FACTOR ** (attempt - 1));
  return Math.round(raw / 2 + rand() * (raw / 2));
}

export interface RetryDeps {
  readonly fetchFn: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly maxAttempts: number;
  readonly log?: (msg: string) => void;
  readonly rand?: () => number;
  readonly nowMs?: () => number;
}

/**
 * Fetch `url` with retry/backoff. Returns the first ok Response. Throws on a
 * permanent failure immediately, or after `maxAttempts` transient failures with
 * an error naming the attempt count and last status/error.
 */
export async function fetchWithRetry(url: string, init: RequestInit, deps: RetryDeps): Promise<Response> {
  const log = deps.log ?? ((m: string) => console.warn(m));
  const rand = deps.rand ?? Math.random;
  const nowMs = deps.nowMs ?? Date.now;
  let lastDesc = "no attempt";

  for (let attempt = 1; attempt <= deps.maxAttempts; attempt++) {
    let res: Response | null = null;
    try {
      res = await deps.fetchFn(url, init);
    } catch (e: unknown) {
      lastDesc = `network error: ${e instanceof Error ? e.message : String(e)}`; // thrown fetch = transient
    }

    if (res !== null) {
      if (res.ok) return res;
      if (classifyHttpFailure(res.status) === "permanent") {
        throw new Error(`Crossref HTTP ${res.status} (permanent — not retried)`);
      }
      lastDesc = `HTTP ${res.status}`;
    }

    if (attempt >= deps.maxAttempts) {
      throw new Error(`Crossref unavailable after ${deps.maxAttempts} attempts (${lastDesc})`);
    }

    const retryAfter = res !== null ? parseRetryAfter(res.headers.get("retry-after"), nowMs()) : null;
    const wait = retryAfter ?? backoffDelay(attempt, rand);
    log(`harvest: attempt ${attempt}/${deps.maxAttempts} failed (${lastDesc}); retrying in ${wait}ms`);
    await deps.sleep(wait);
  }
  // Unreachable: the loop returns or throws. Satisfies the type checker.
  throw new Error(`Crossref unavailable after ${deps.maxAttempts} attempts (${lastDesc})`);
}
