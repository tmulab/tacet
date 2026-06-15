import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSkeleton } from "../src/domain/narrative-skeleton.js";
import type { SkeletonInput } from "../src/domain/narrative-skeleton.js";
import { verifyFidelity, verifyThematic, verifyNarrative } from "../src/domain/narrative-verify.js";

/**
 * Passo 2 — the two guards. Guard 1 (numeric fidelity, deterministic) is
 * inegociável; guard 2 (thematic) is partial and named as such. Synthetic prose:
 * faithful passes, an invented number fails, a swapped status fails, a wrong
 * empty-chair dimension fails, a leaked thematic term fails. Coherence, not truth.
 */

const load = (file: string): SkeletonInput =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/replay/${file}`, import.meta.url)), "utf8")) as SkeletonInput;

// freud-derived: claims 21, all unsupported, gate mixed @0.476, chairs pt/de/book/chapter
const sk = buildSkeleton(load("freud-midas-derived-v0.1.json"));

describe("guard 1 — numeric/status/coverage fidelity (deterministic)", () => {
  it("faithful prose passes", () => {
    const prose =
      "The engine judged 21 claims; 0 reached robust-core and all 21 were unsupported. " +
      "The relevance gate read mixed, at a lexical overlap fraction of 0.476. The measured empty " +
      "chairs were language=pt, language=de and genre=book. Coherence, not truth.";
    expect(verifyFidelity(prose, sk).pass).toBe(true);
  });

  it("an invented number fails", () => {
    const r = verifyFidelity("The engine judged 21 claims and found 7 robust-core convergences.", sk);
    expect(r.pass).toBe(false);
    expect(r.violations.join(" ")).toContain("7");
  });

  it("a swapped relevance status fails", () => {
    const r = verifyFidelity("The relevance gate read aligned across the corpus.", sk);
    expect(r.pass).toBe(false);
    expect(r.violations.join(" ")).toContain("aligned");
  });

  it("a wrong empty-chair dimension fails", () => {
    const r = verifyFidelity("The measured empty chair was genre=report.", sk);
    expect(r.pass).toBe(false);
    expect(r.violations.join(" ")).toContain("genre=report");
  });

  it("a spelled-out invented number fails (zero..twelve mapped)", () => {
    const r = verifyFidelity("There were five empty chairs in the audit.", sk);
    expect(r.pass).toBe(false);
    expect(r.violations.join(" ")).toContain("5");
  });

  it("DOI digits in a locator are NOT mistaken for invented numbers", () => {
    const prose = "21 claims, 0 robust-core, 21 unsupported. A source: https://doi.org/10.1590/1809-43412023v20d911. Coherence, not truth.";
    expect(verifyFidelity(prose, sk).pass).toBe(true);
  });
});

describe("guard 2 — thematic non-contamination (partial)", () => {
  const banned = ["Freud", "psychoanalysis", "Marx", "capitalism", "libidinal"];

  it("clean structural prose passes", () => {
    const prose = "The engine judged 21 claims; all 21 were unsupported. Coherence, not truth.";
    expect(verifyThematic(prose, sk, banned).pass).toBe(true);
  });

  it("a leaked thematic term fails", () => {
    const r = verifyThematic("The corpus drifted into psychoanalysis and capitalism.", sk, banned);
    expect(r.pass).toBe(false);
    expect(r.violations.length).toBeGreaterThanOrEqual(2);
  });

  it("a banned term that the skeleton itself sanctions is exempt", () => {
    // the skeleton mentions 'tradition'; banning it must not fire (structure holds it)
    const r = verifyThematic("Three categories under the tradition dimension were not measured.", sk, ["tradition"]);
    expect(r.pass).toBe(true);
  });
});

describe("verifyNarrative — both guards together", () => {
  it("admissible only when BOTH pass", () => {
    const good = "21 claims; 0 robust-core; 21 unsupported; gate mixed at 0.476. Coherence, not truth.";
    expect(verifyNarrative(good, sk, ["Freud"]).pass).toBe(true);
    expect(verifyNarrative(good + " Freud's clinic.", sk, ["Freud"]).pass).toBe(false);
    expect(verifyNarrative("99 claims judged.", sk, ["Freud"]).pass).toBe(false);
  });
});
