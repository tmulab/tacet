import type { Claim } from "../domain/types.js";

/**
 * Redaction for the public fixture. TACET reviews evidence; it does not
 * redistribute it. A claim whose source is `redistributable: false` (read locally
 * — e.g. an arXiv PDF) keeps, in the public artifact, ONLY the verifiable shell:
 * its id, its provenance (DOI/locator + sha256 sourceAnchor + bibliographic tags),
 * and — elsewhere in the fixture — the readers' leans and its structural position.
 * The CONTENT (claim text, the summary, the structured summary) is replaced by a
 * placeholder. This holds even where the licence might permit a factual abstract:
 * the redaction is methodological coherence, not just a legal margin.
 *
 * Pure: no I/O. Applied at freeze, after the derived artifacts are computed (which
 * use only ids, tags and provenance ids — never the redacted content), so the
 * frozen map/coverage/profiles are unchanged by redaction.
 */

export const REDACTED = "[non-redistributable source — see DOI; full text not included]";

/** Redact a claim IFF its source is non-redistributable; otherwise identity. */
export function redactClaim(claim: Claim): Claim {
  if (claim.redistributable !== false) return claim;
  return {
    ...claim,
    text: REDACTED,
    provenance: claim.provenance.map((p) => {
      // drop content (summary + structured); keep id/locator/date/tags/authors/
      // venue/languageSource/summaryMethod/sourceAnchor — bibliographic, not content
      const { structured: _structured, ...rest } = p;
      return { ...rest, summary: REDACTED };
    }),
  };
}
