import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeReplay } from "../src/pipeline/replay.js";
import { REDACTED } from "../src/pipeline/redact.js";
import type { ReplayFixture } from "../src/pipeline/replay.js";
import type { ConvergenceMap, ReliabilityProfile } from "../src/domain/convergence.js";
import type { CoverageAudit } from "../src/domain/coverage.js";
import type { Claim, Lean } from "../src/domain/types.js";

/**
 * The lhc-anchored-ingested regime (B1.75): the adjacent CC-BY corpus PLUS the two
 * canonical argument PDFs read LOCALLY as claims (redistributable:false). The
 * public fixture publishes the readers' JUDGMENT + provenance (DOI + sha256 +
 * lean + structural position), NEVER the text or summary. This is the answer to
 * the case: closed (the argument converges when read) AND inaccessible in the
 * open literature (regime-zero empty chair), both shown without redistributing
 * the documents. Coherence, not truth.
 *
 * The two non-leak tests are the PRIMARY guard.
 */

const fpath = fileURLToPath(new URL("../fixtures/replay/lhc-anchored-ingested-v0.1.json", import.meta.url));
const raw = readFileSync(fpath, "utf8");

interface Frozen extends ReplayFixture {
  readonly claims: readonly (Claim & { readonly redistributable?: boolean })[];
  readonly readers: Readonly<Record<string, Readonly<Record<string, { lean: Lean; model: string }>>>>;
  readonly source: { readonly referenceHypothesis: string };
  readonly derived: {
    readonly convergenceMap: ConvergenceMap;
    readonly coverageAudit: CoverageAudit;
    readonly reliabilityProfiles: readonly ReliabilityProfile[];
  };
}
const fx = JSON.parse(raw) as Frozen;
const closedIds = ["claim-redacted-001", "claim-redacted-002"];

describe("lhc-anchored-ingested — NON-LEAK (primary guard)", () => {
  it("structural: every redistributable:false claim is redacted — no text, no summary, no structured", () => {
    const closed = fx.claims.filter((c) => c.redistributable === false);
    expect(closed.length).toBe(2);
    for (const c of closed) {
      expect(c.text).toBe(REDACTED);
      expect(c.provenance[0]?.summary).toBe(REDACTED);
      expect(c.provenance[0]?.structured).toBeUndefined();
    }
  });

  it("by scan: no distinctive n-gram from either source PDF appears anywhere in the fixture", () => {
    const ngrams = [
      "Astrophysical implications of hypothetical stable TeV-s", // G-M title
      "capture radius RD, then a warped", // G-M body
      "emit Hawking radiation that might be", // Plaga body
      "all possible values of L", // Plaga body
    ];
    for (const n of ngrams) expect(raw.includes(n)).toBe(false);
  });
});

describe("lhc-anchored-ingested — provenance & judgment preserved", () => {
  it("each redacted claim keeps its DOI + sha256 (the verification path)", () => {
    const byId = new Map(fx.claims.map((c) => [c.id, c]));
    expect(byId.get("claim-redacted-001")?.provenance[0]?.sourceId).toBe("10.48550/arXiv.0806.3381");
    expect(byId.get("claim-redacted-001")?.provenance[0]?.sourceAnchor?.sha256).toBe("939f8daa4ce9a6e93712ddb4f21a3118fdc618dc4c7fd5eaea0171a74429e365");
    expect(byId.get("claim-redacted-002")?.provenance[0]?.sourceId).toBe("10.48550/arXiv.0808.1415");
    expect(byId.get("claim-redacted-002")?.provenance[0]?.sourceAnchor?.sha256).toBe("0f41a2c1385df8e03d9d05bc23f011aeb03a888836cb02638875db5dfa88260a");
  });

  it("the closed argument CONVERGES when read: the safety capstone is a robust-core", () => {
    // claim-redacted-001 = Giddings-Mangano safety paper → both readers 'supports'
    expect(fx.readers["reader-a"]?.["claim-redacted-001"]?.lean).toBe("supports");
    expect(fx.readers["reader-b"]?.["claim-redacted-001"]?.lean).toBe("supports");
    const v = fx.derived.convergenceMap.verdicts.find((x) => x.claimId === "claim-redacted-001");
    expect(v?.signal).toBe("robust-core");
  });

  it("both closed claims carry leans (judgment IS published; only content is withheld)", () => {
    for (const id of closedIds) {
      expect(fx.readers["reader-a"]?.[id]?.lean).toBeDefined();
      expect(fx.readers["reader-b"]?.[id]?.lean).toBeDefined();
    }
  });
});

describe("lhc-anchored-ingested — fixture integrity", () => {
  it("recompute equals the baked answer key (offline) over the redacted claims", async () => {
    const { map, coverage, profiles } = await computeReplay(fx);
    expect(map).toEqual(fx.derived.convergenceMap);
    expect(coverage).toEqual(fx.derived.coverageAudit);
    expect(profiles).toEqual(fx.derived.reliabilityProfiles);
  });

  it("declares coherence, not truth", () => {
    expect(fx.source.referenceHypothesis.toLowerCase()).toContain("coherence, not truth");
  });
});
