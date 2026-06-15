import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSkeleton } from "../src/domain/narrative-skeleton.js";
import type { SkeletonInput } from "../src/domain/narrative-skeleton.js";
import { buildNarratePrompt, parseNarration, assembleProse, generateNarrative, NARRATE_CASES, CONSTRAINT_NOTE } from "../src/pipeline/narrate.js";

/**
 * Passo 1 — the LLM stitch, exercised with NO network (injected completion). The
 * prompt must be context-starved (no theme); parse/assemble are pure; the retry
 * loop must converge on a guard-passing draft. Coherence, not truth.
 */

const sk = buildSkeleton(
  JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/replay/freud-midas-derived-v0.1.json", import.meta.url)), "utf8")) as SkeletonInput,
);

describe("narrate — prompt is context-starved", () => {
  it("the user prompt carries the opaque id + assertions, never the topic or sourceNode", () => {
    const { user } = buildNarratePrompt(sk, "case-08");
    expect(user).toContain("case-08");
    expect(user).toContain("unsupported: 21");
    // no theme, no traceability node, no fixture name leaks into the model's view
    for (const leak of ["freud", "psychoanalysis", "capital", "relevanceGate", "coverageAudit", "freud-midas"]) {
      expect(user.toLowerCase()).not.toContain(leak);
    }
  });

  it("every structured fixture has exactly one narrate case with an opaque id", () => {
    expect(NARRATE_CASES.length).toBe(9);
    const ids = new Set(NARRATE_CASES.map((c) => c.opaque));
    expect(ids.size).toBe(9);
    // the opaque id reveals nothing about the case fixture name
    for (const c of NARRATE_CASES) expect(c.fixture).not.toContain(c.opaque);
  });
});

describe("narrate — parse + assemble (pure)", () => {
  it("parses strict JSON and tolerates surrounding text", () => {
    const p = parseNarration('noise {"prose":"x","mapping":[{"sentence":"x","assertions":[0]}]} trailing');
    expect(p?.prose).toBe("x");
    expect(p?.mapping[0]?.assertions).toEqual([0]);
  });
  it("returns null on unparseable content", () => {
    expect(parseNarration("not json at all")).toBeNull();
  });
  it("appends the constraint note unless the prose already declares the limit", () => {
    expect(assembleProse("hello")).toBe(`hello ${CONSTRAINT_NOTE}`);
    expect(assembleProse("done. Coherence, not truth.")).toBe("done. Coherence, not truth.");
  });
  it("strips a dangling constraint fragment so the note appears exactly once", () => {
    expect(assembleProse("x. This narration is constrained to the measured structure.")).toBe(`x. ${CONSTRAINT_NOTE}`);
  });
});

describe("narrate — generate retries until guards pass", () => {
  it("a faithful completion passes on the first attempt", async () => {
    const faithful = JSON.stringify({
      prose: "The engine judged 21 claims; 0 reached robust-core and 21 were unsupported. The relevance gate read mixed at a lexical overlap fraction of 0.476. Coherence, not truth.",
      mapping: [],
    });
    const gen = await generateNarrative(sk, "case-08", ["freud"], async () => faithful);
    expect(gen.guards.pass).toBe(true);
    expect(gen.attempts).toBe(1);
  });

  it("a contaminated draft is corrected on retry", async () => {
    let call = 0;
    const complete = async (): Promise<string> => {
      call += 1;
      return call === 1
        ? JSON.stringify({ prose: "The corpus drifted into psychoanalysis. 21 claims, 21 unsupported. Coherence, not truth.", mapping: [] })
        : JSON.stringify({ prose: "The engine judged 21 claims; 21 were unsupported. Coherence, not truth.", mapping: [] });
    };
    const gen = await generateNarrative(sk, "case-08", ["psychoanalysis"], complete);
    expect(gen.attempts).toBe(2);
    expect(gen.guards.pass).toBe(true);
  });
});
