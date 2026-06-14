import { describe, it, expect, vi } from "vitest";
import { classifyHttpFailure, parseRetryAfter } from "../src/ingestion/fetch-retry.js";
import { fetchCrossrefWorks } from "../src/ingestion/harvest.js";

/**
 * Retry/backoff around the ONLY networked call (fetchCrossrefWorks). All offline:
 * the fetch and sleep are INJECTED via deps, so no real network, no real waiting.
 * A transient failure (network error, 429, 5xx, 404 — Crossref 404s under load)
 * is retried with backoff; a permanent one (400/401/403) fails at once. The
 * replay path and the rest of the suite never touch this.
 */

const page = (items: unknown[], nextCursor: string | null = null): Response =>
  new Response(JSON.stringify({ message: { items, "next-cursor": nextCursor } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const ONE_WORK = [{ DOI: "10.1/a", title: ["A"], abstract: "an abstract" }];

/** A fetch double that yields the given responses/errors in order, repeating the
 * last entry once exhausted (so "always 503" is a single 503). Counts calls. */
function fetchSeq(seq: readonly (Response | Error)[]): { fn: typeof fetch; calls: () => number } {
  let i = 0;
  let calls = 0;
  const fn = (async () => {
    calls += 1;
    const r = seq[Math.min(i, seq.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return (r as Response).clone(); // clone: a Response body can be read once
  }) as unknown as typeof fetch;
  return { fn, calls: () => calls };
}

function sleepSpy(): { sleep: (ms: number) => Promise<void>; waits: number[] } {
  const waits: number[] = [];
  return { sleep: async (ms: number) => void waits.push(ms), waits };
}

const run = (fn: typeof fetch, sleep: (ms: number) => Promise<void>, maxAttempts = 4) =>
  fetchCrossrefWorks("q", 5, "me@x.org", null, { fetchFn: fn, sleep, maxAttempts });

describe("fetchCrossrefWorks — retry/backoff (injected fetch + sleep)", () => {
  it("(1) succeeds after transient failures (503, 503, 200)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fn } = fetchSeq([new Response("", { status: 503 }), new Response("", { status: 503 }), page(ONE_WORK)]);
    const { sleep, waits } = sleepSpy();
    const works = await run(fn, sleep);
    expect(works).toHaveLength(1);
    expect(waits).toHaveLength(2); // two retries → two sleeps
    expect(warn).toHaveBeenCalledTimes(2); // honest log per retry
    warn.mockRestore();
  });

  it("(2) a permanent failure (400) throws at once, never sleeps", async () => {
    const { fn, calls } = fetchSeq([new Response("", { status: 400 })]);
    const { sleep, waits } = sleepSpy();
    await expect(run(fn, sleep)).rejects.toThrow(/400/);
    expect(waits).toHaveLength(0);
    expect(calls()).toBe(1);
  });

  it("(3) exhausting the cap throws naming attempts + last status; sleeps maxAttempts-1", async () => {
    const { fn, calls } = fetchSeq([new Response("", { status: 503 })]);
    const { sleep, waits } = sleepSpy();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(run(fn, sleep, 4)).rejects.toThrow(/4|503/);
    expect(waits).toHaveLength(3); // attempts 1,2,3 sleep; attempt 4 throws
    expect(calls()).toBe(4);
    warn.mockRestore();
  });

  it("(4) 404 is TRANSIENT (the real prior bug): 404 then 200 succeeds", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fn } = fetchSeq([new Response("", { status: 404 }), page(ONE_WORK)]);
    const { sleep, waits } = sleepSpy();
    const works = await run(fn, sleep);
    expect(works).toHaveLength(1);
    expect(waits).toHaveLength(1);
    warn.mockRestore();
  });

  it("(5) Retry-After is honored over the computed backoff", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fn } = fetchSeq([new Response("", { status: 429, headers: { "Retry-After": "2" } }), page(ONE_WORK)]);
    const { sleep, waits } = sleepSpy();
    await run(fn, sleep);
    expect(waits[0]).toBe(2000); // 2s from the header, not a jittered backoff
    warn.mockRestore();
  });
});

describe("classifyHttpFailure (pure)", () => {
  it("(6) maps transient vs permanent", () => {
    expect(classifyHttpFailure(429)).toBe("transient");
    expect(classifyHttpFailure(500)).toBe("transient");
    expect(classifyHttpFailure(503)).toBe("transient");
    expect(classifyHttpFailure(404)).toBe("transient");
    expect(classifyHttpFailure(400)).toBe("permanent");
    expect(classifyHttpFailure(401)).toBe("permanent");
    expect(classifyHttpFailure(403)).toBe("permanent");
  });
});

describe("parseRetryAfter (pure)", () => {
  it("parses integer seconds and an HTTP date, caps insane values, ignores garbage", () => {
    expect(parseRetryAfter("2", 0)).toBe(2000);
    const now = Date.parse("2026-06-14T00:00:00Z");
    expect(parseRetryAfter("Sun, 14 Jun 2026 00:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfter("999999", 0)).toBeLessThanOrEqual(60_000); // sanity cap
    expect(parseRetryAfter("not-a-date", 0)).toBeNull();
    expect(parseRetryAfter(null, 0)).toBeNull();
  });
});
