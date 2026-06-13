import { describe, it, expect } from "vitest";
import { StubReader } from "../src/readers/stub-reader.js";
import type { Claim } from "../src/domain/types.js";

/**
 * TDD-first. The StubReader is the reproducibility anchor of replay mode:
 * deterministic, no I/O, no randomness, no model call. It is constructed with a
 * fixed claimId → lean map and returns the matching judgements. Contract:
 *   - returns one judgement per claim, in claim order
 *   - maps each claim's predefined lean verbatim
 *   - supports/contradicts cite the claim's provenance sources; insufficient
 *     cites nothing (unsupported by the evidence read)
 *   - identical reads produce identical output (determinism)
 *   - a claim with no predefined lean is an error, never a silent guess
 */

const claim = (id: string, sources: string[] = ["s1"]): Claim => ({
  id,
  text: `claim ${id}`,
  provenance: sources.map((sourceId) => ({ sourceId, locator: `loc:${sourceId}` })),
});

describe("StubReader", () => {
  it("exposes its id", () => {
    const r = new StubReader("reader-a", { c1: "supports" });
    expect(r.id).toBe("reader-a");
  });

  it("returns one judgement per claim, in claim order", async () => {
    const r = new StubReader("reader-a", { c1: "supports", c2: "contradicts" });
    const out = await r.read([claim("c1"), claim("c2")]);
    expect(out.map((j) => j.claimId)).toEqual(["c1", "c2"]);
  });

  it("maps each predefined lean verbatim", async () => {
    const r = new StubReader("reader-a", { c1: "supports", c2: "contradicts", c3: "insufficient" });
    const out = await r.read([claim("c1"), claim("c2"), claim("c3")]);
    expect(out.map((j) => j.lean)).toEqual(["supports", "contradicts", "insufficient"]);
  });

  it("cites the claim's provenance sources for a non-insufficient lean", async () => {
    const r = new StubReader("reader-a", { c1: "supports" });
    const [j] = await r.read([claim("c1", ["s1", "s2"])]);
    expect(j?.citedSources).toEqual(["s1", "s2"]);
  });

  it("cites nothing when the lean is insufficient", async () => {
    const r = new StubReader("reader-a", { c1: "insufficient" });
    const [j] = await r.read([claim("c1", ["s1", "s2"])]);
    expect(j?.citedSources).toEqual([]);
  });

  it("is deterministic — two reads of the same claims are identical", async () => {
    const r = new StubReader("reader-a", { c1: "supports", c2: "contradicts" });
    const first = await r.read([claim("c1"), claim("c2")]);
    const second = await r.read([claim("c1"), claim("c2")]);
    expect(second).toEqual(first);
  });

  it("throws on a claim with no predefined lean (never a silent guess)", async () => {
    const r = new StubReader("reader-a", { c1: "supports" });
    await expect(r.read([claim("c1"), claim("c2")])).rejects.toThrow();
  });
});
