import { describe, it, expect } from "vitest";
import { auditCoverage } from "../src/domain/coverage.js";
import type { ExpectedCategory } from "../src/domain/coverage.js";
import type { Claim, Provenance } from "../src/domain/types.js";

/**
 * TDD-first. The contract lives in the JSDoc of src/domain/coverage.ts; these
 * tests lock it BEFORE auditCoverage is implemented:
 *   - counts observed sources per (dimension,value) from provenance tags,
 *     deduplicated by sourceId
 *   - any expected category with zero observed sources → empty chair
 *   - never invents expected categories; only audits those passed in
 *   - descriptive only: each finding preserves its cited justification verbatim
 *     and reports the gap, never interprets it
 */

const src = (sourceId: string, tags: Record<string, string>): Provenance => ({
  sourceId,
  locator: `loc:${sourceId}`,
  tags,
});

const claim = (id: string, provenance: readonly Provenance[]): Claim => ({
  id,
  text: `claim ${id}`,
  provenance,
});

const cat = (dimension: string, value: string, justification: string): ExpectedCategory => ({
  dimension,
  value,
  justification,
});

describe("auditCoverage", () => {
  it("(a) an expected category with observed sources > 0 is not an empty chair", () => {
    const claims = [claim("c1", [src("s1", { "language-family": "anglophone" })])];
    const audit = auditCoverage(claims, [cat("language-family", "anglophone", "baseline")]);
    const finding = audit.findings[0];
    expect(finding?.observedSources).toBe(1);
    expect(finding?.isEmptyChair).toBe(false);
    expect(audit.emptyChairs).toHaveLength(0);
  });

  it("(b) an expected category with zero observed sources is an empty chair", () => {
    const claims = [claim("c1", [src("s1", { "language-family": "anglophone" })])];
    const audit = auditCoverage(claims, [cat("language-family", "non-anglophone", "dispute centered on China")]);
    const finding = audit.findings[0];
    expect(finding?.observedSources).toBe(0);
    expect(finding?.isEmptyChair).toBe(true);
    expect(audit.emptyChairs).toHaveLength(1);
    expect(audit.emptyChairs[0]?.value).toBe("non-anglophone");
  });

  it("(c) counts per (dimension,value), deduplicating by sourceId across claims", () => {
    const claims = [
      claim("c1", [src("s1", { "language-family": "anglophone" })]),
      claim("c2", [src("s1", { "language-family": "anglophone" })]), // same source, second claim
      claim("c3", [src("s2", { "language-family": "anglophone" })]), // distinct source
    ];
    const audit = auditCoverage(claims, [cat("language-family", "anglophone", "baseline")]);
    expect(audit.findings[0]?.observedSources).toBe(2); // s1 counted once, plus s2
  });

  it("(d) never invents expected categories — only audits those passed in", () => {
    const claims = [
      claim("c1", [src("s1", { "language-family": "anglophone", "geographic-locus": "north-america" })]),
    ];
    const audit = auditCoverage(claims, [cat("language-family", "anglophone", "baseline")]);
    expect(audit.findings).toHaveLength(1);
    expect(audit.findings[0]?.dimension).toBe("language-family");
    // geographic-locus is observed in the tags but was NOT expected → no finding for it
    expect(audit.findings.some((f) => f.dimension === "geographic-locus")).toBe(false);
  });

  it("(e) preserves each expected category's cited justification verbatim", () => {
    const justification = "the dispute concerns events centered in China per [WHO mission report 2021]";
    const claims = [claim("c1", [src("s1", { "language-family": "anglophone" })])];
    const audit = auditCoverage(claims, [cat("language-family", "non-anglophone", justification)]);
    expect(audit.findings[0]?.justification).toBe(justification);
  });

  it("(f) counts the third language bucket 'unknown' when such a claim exists", () => {
    // The three-state language model adds an 'unknown' family. No producer emits
    // it yet, but the audit must count it correctly if/when one appears.
    const claims = [claim("c1", [src("s1", { "language-family": "unknown" })])];
    const audit = auditCoverage(claims, [cat("language-family", "unknown", "undetectable language is its own bucket")]);
    expect(audit.findings[0]?.observedSources).toBe(1);
    expect(audit.findings[0]?.isEmptyChair).toBe(false);
  });
});
