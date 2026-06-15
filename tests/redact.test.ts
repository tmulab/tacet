import { describe, it, expect } from "vitest";
import { REDACTED, redactClaim } from "../src/pipeline/redact.js";
import type { Claim } from "../src/domain/types.js";

/**
 * The PRIMARY non-leak guard (structural): a redistributable:false claim, once
 * redacted, exposes NO text and NO summary — only the verifiable shell (id, DOI,
 * sha256, tags). A redistributable (open) claim passes through untouched.
 */

const closed: Claim = {
  id: "claim-redacted-001",
  text: "The secret internal title of the paper",
  redistributable: false,
  provenance: [
    {
      sourceId: "10.48550/arXiv.0806.3381",
      locator: "https://arxiv.org/abs/0806.3381",
      date: "2008",
      tags: { "language-family": "anglophone", language: "en", genre: "preprint" },
      authors: ["S. Giddings", "M. Mangano"],
      venue: "arXiv",
      summary: "A long confidential summary of the argument that must never appear.",
      summaryMethod: "llm",
      structured: { centralClaim: "secret central", citedEvidence: "secret evidence", originStance: "none", summaryText: "secret prose" },
      sourceAnchor: { file: "0806.3381v2.pdf", sha256: "939f8daa", locus: "accretion risk" },
    },
  ],
};

describe("redactClaim — structural non-leak", () => {
  it("blanks text, summary and structured for a non-redistributable claim", () => {
    const r = redactClaim(closed);
    expect(r.text).toBe(REDACTED);
    expect(r.provenance[0]?.summary).toBe(REDACTED);
    expect(r.provenance[0]?.structured).toBeUndefined();
    // none of the original content survives anywhere in the serialized claim
    const json = JSON.stringify(r);
    for (const secret of ["secret", "confidential summary", "internal title"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("preserves the verifiable shell: id, DOI, sha256, tags, authors, venue", () => {
    const r = redactClaim(closed);
    expect(r.id).toBe("claim-redacted-001");
    expect(r.provenance[0]?.sourceId).toBe("10.48550/arXiv.0806.3381");
    expect(r.provenance[0]?.sourceAnchor?.sha256).toBe("939f8daa");
    expect(r.provenance[0]?.tags?.["genre"]).toBe("preprint");
    expect(r.provenance[0]?.authors).toEqual(["S. Giddings", "M. Mangano"]);
  });

  it("leaves an open (redistributable) claim untouched", () => {
    const open: Claim = { id: "c1", text: "An open CC-BY title", provenance: [{ sourceId: "10.1/x", locator: "l", summary: "open summary" }] };
    expect(redactClaim(open)).toEqual(open);
    // explicit true also passes through
    expect(redactClaim({ ...open, redistributable: true })).toMatchObject({ text: "An open CC-BY title" });
  });
});
