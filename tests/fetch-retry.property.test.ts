import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { classifyHttpFailure, parseRetryAfter } from "../src/ingestion/fetch-retry.js";

/**
 * Property tests for the A1 pure functions: classifyHttpFailure is total and
 * follows the exact rule; parseRetryAfter never returns a negative wait, always
 * respects the sanity cap, and rejects garbage.
 */

const CAP_MS = 60_000;

describe("classifyHttpFailure (property)", () => {
  it("is total over statuses and matches the rule (429/404/5xx transient; else permanent)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 599 }), (status) => {
        const r = classifyHttpFailure(status);
        expect(r === "transient" || r === "permanent").toBe(true);
        const expected = status === 429 || status === 404 || status >= 500 ? "transient" : "permanent";
        expect(r).toBe(expected);
      }),
    );
  });
});

describe("parseRetryAfter (property)", () => {
  it("never negative, never above the cap, null for non-numeric/non-date garbage", () => {
    const headerArb = fc.oneof(
      fc.constant(null),
      fc.string(),
      fc.nat().map(String),
      fc.date({ min: new Date(0), max: new Date(4_000_000_000_000) }).map((d) => d.toUTCString()),
    );
    fc.assert(
      fc.property(headerArb, fc.integer({ min: 0, max: 4_000_000_000_000 }), (header, nowMs) => {
        const r = parseRetryAfter(header, nowMs);
        if (r !== null) {
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThanOrEqual(CAP_MS);
        }
      }),
    );
  });

  it("integer seconds → min(n*1000, cap), exactly", () => {
    fc.assert(
      fc.property(fc.nat(200_000), (n) => {
        expect(parseRetryAfter(String(n), 0)).toBe(Math.min(n * 1000, CAP_MS));
      }),
    );
  });

  it("a past HTTP date clamps to 0; pure garbage is null", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 10_000_000 }), (deltaMs) => {
        const now = 2_000_000_000_000;
        const past = new Date(now - deltaMs).toUTCString();
        expect(parseRetryAfter(past, now)).toBe(0); // never negative
      }),
    );
    expect(parseRetryAfter("not-a-date-or-number", 0)).toBeNull();
  });
});
