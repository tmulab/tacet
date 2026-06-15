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

/** Per-attempt outcome of `consume`: a usable value, or a transient body failure
 * (e.g. a 200 with a non-JSON body) that should be retried like a 5xx. */
type Consumed<T> = { readonly kind: "ok"; readonly value: T } | { readonly kind: "transient"; readonly desc: string };

/**
 * The shared retry/backoff loop. Per attempt: a thrown fetch is transient; a
 * non-ok status is classified (permanent → throw now, transient → retry, honoring
 * Retry-After); an ok response is handed to `consume`, which may itself report a
 * transient failure (the body). Throws on permanent, or after `maxAttempts` with
 * an error naming the attempt count and last cause.
 */
async function retryLoop<T>(
  url: string,
  init: RequestInit,
  deps: RetryDeps,
  consume: (res: Response) => Promise<Consumed<T>>,
): Promise<T> {
  const log = deps.log ?? ((m: string) => console.warn(m));
  const rand = deps.rand ?? Math.random;
  const nowMs = deps.nowMs ?? Date.now;
  let lastDesc = "no attempt";

  for (let attempt = 1; attempt <= deps.maxAttempts; attempt++) {
    let res: Response | null = null;
    let retryAfter: number | null = null;
    try {
      res = await deps.fetchFn(url, init);
    } catch (e: unknown) {
      lastDesc = `network error: ${e instanceof Error ? e.message : String(e)}`; // thrown fetch = transient
    }

    if (res !== null) {
      if (res.ok) {
        const consumed = await consume(res);
        if (consumed.kind === "ok") return consumed.value;
        lastDesc = consumed.desc; // an ok status but an unusable body → transient
      } else {
        if (classifyHttpFailure(res.status) === "permanent") {
          throw new Error(`Crossref HTTP ${res.status} (permanent — not retried)`);
        }
        lastDesc = `HTTP ${res.status}`;
        retryAfter = parseRetryAfter(res.headers.get("retry-after"), nowMs());
      }
    }

    if (attempt >= deps.maxAttempts) {
      throw new Error(`Crossref unavailable after ${deps.maxAttempts} attempts (${lastDesc})`);
    }

    const wait = retryAfter ?? backoffDelay(attempt, rand);
    log(`harvest: attempt ${attempt}/${deps.maxAttempts} failed (${lastDesc}); retrying in ${wait}ms`);
    await deps.sleep(wait);
  }
  // Unreachable: the loop returns or throws. Satisfies the type checker.
  throw new Error(`Crossref unavailable after ${deps.maxAttempts} attempts (${lastDesc})`);
}

/**
 * Fetch `url` and parse its JSON body, with retry/backoff. A 200 whose body does
 * NOT parse as JSON (an HTML error page, a truncated payload under load) is a
 * TRANSIENT failure — retried like a 5xx — instead of throwing on the first try.
 * Closes the A1 debt: the body parse is now inside the retry scope.
 */
export async function fetchJsonWithRetry<T>(url: string, init: RequestInit, deps: RetryDeps): Promise<T> {
  return retryLoop<T>(url, init, deps, async (res) => {
    try {
      return { kind: "ok", value: (await res.json()) as T };
    } catch (e: unknown) {
      return { kind: "transient", desc: `non-JSON body: ${e instanceof Error ? e.message : String(e)}` };
    }
  });
}
