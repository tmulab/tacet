import type { Claim } from "./types.js";

/**
 * Relevance gate — a minimal drift detector. It measures how well the harvested
 * corpus aligns with the REFERENCE HYPOTHESIS (the accepted ruler), NOT with the
 * search query. That is the whole point: the query can drift (homonymy, a more
 * populous adjacent field) while the ruler does not — so measuring against the
 * ruler is what EXPOSES the drift. A warning, never a block: it reports a status,
 * it does not stop the read.
 *
 * Method: extract distinctive content terms from the ruler (stopwords removed),
 * then for each claim count how many ruler-terms appear in its title+summary.
 * alignedFraction = fraction of claims meeting a per-claim floor.
 *
 * LIMITATION (documented): lexical overlap is a PROXY for topicality (a cousin of
 * the D1 not-measured frontier). Two fields that share vocabulary (e.g. "capital",
 * "value") can register overlap without being on-topic; real semantic relevance
 * inference is future work. Pure: no I/O.
 */

/** "not-assessed" = the ruler shares too little vocabulary with the corpus for a
 * lexical judgment to mean anything (e.g. a Portuguese ruler over an English
 * corpus): the gate ABSTAINS rather than cry "drifted" on a language mismatch.
 * This is the difference between no LEXICAL BASIS (not-assessed) and a real basis
 * with low alignment (drifted). */
export type RelevanceStatus = "aligned" | "drifted" | "mixed" | "not-assessed";

export interface RelevanceOptions {
  /** Min token length to count as a content term. Default 4. */
  readonly minTermLength?: number;
  /** Min ruler-terms a claim must match to count as aligned. Default 2. */
  readonly perClaimFloor?: number;
  /** alignedFraction ≥ this → aligned. Default 0.5. */
  readonly alignedThreshold?: number;
  /** alignedFraction ≤ this → drifted. Default 0.2. */
  readonly driftedThreshold?: number;
  /** Min ruler-terms that must appear in AT LEAST ONE claim for the lexical basis
   * to be judgeable; below it → not-assessed. Default 3. */
  readonly minBasis?: number;
}

export interface RelevanceAssessment {
  readonly status: RelevanceStatus;
  readonly alignedFraction: number;
  readonly ruleTerms: readonly string[];
  readonly perClaimOverlap: readonly { readonly claimId: string; readonly overlap: number }[];
}

// Modest EN+PT stopword set — enough to drop function words from the ruler/claims.
const STOP = new Set(
  ("the a an and or of to in on for with by is are be that this it its as at from not no nor " +
    "una uno que com por para uma dos das de da do no na em ao aos sobre como mais entre " +
    "than into onto under over within without about also been being such these those their")
    .split(/\s+/),
);

/** Distinctive Portuguese/Spanish function words absent from English. The lexical
 * gate is calibrated for an ENGLISH ruler; a ruler carrying several of these is in
 * another language, so an English-lexical comparison cannot judge it → abstain.
 * LIMITATION (future work, D1-adjacent): this makes the gate EN-only — pt/es/de
 * rulers all fall to not-assessed. A semantic/multilingual gate (embeddings) would
 * remove this; the lexical proxy does not. */
const NON_EN_MARKERS = new Set(
  "que nao uma sao pela pelo dos das para por como mais esta sobre ser nem una del los las con".split(/\s+/),
);

function looksNonEnglish(text: string): boolean {
  const toks = new Set(
    text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, " ").split(/\s+/),
  );
  let n = 0;
  for (const m of NON_EN_MARKERS) if (toks.has(m)) n += 1;
  return n >= 3;
}

function terms(text: string, minLen: number): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics so pt/en align lexically
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= minLen && !STOP.has(w));
}

function claimText(claim: Claim): string {
  return [claim.text, ...claim.provenance.map((p) => p.summary ?? "")].join(" ");
}

export function assessRelevance(
  referenceHypothesis: string,
  claims: readonly Claim[],
  options: RelevanceOptions = {},
): RelevanceAssessment {
  const minLen = options.minTermLength ?? 4;
  const floor = options.perClaimFloor ?? 2;
  const alignedThreshold = options.alignedThreshold ?? 0.5;
  const driftedThreshold = options.driftedThreshold ?? 0.2;
  const minBasis = options.minBasis ?? 3;

  const ruleTerms = [...new Set(terms(referenceHypothesis, minLen))];
  const ruleSet = new Set(ruleTerms);

  const seen = new Set<string>(); // ruler-terms appearing in at least one claim
  const perClaimOverlap = claims.map((c) => {
    const tokens = new Set(terms(claimText(c), minLen));
    let overlap = 0;
    for (const t of ruleSet) if (tokens.has(t)) { overlap += 1; seen.add(t); }
    return { claimId: c.id, overlap };
  });

  const aligned = perClaimOverlap.filter((p) => p.overlap >= floor).length;
  const alignedFraction = claims.length > 0 ? aligned / claims.length : 0;
  // ABSTAIN when the lexical gate cannot meaningfully judge: a non-English ruler
  // (the gate's lexical base is English), or too thin a shared vocabulary. Better
  // a declared not-assessed than a language mismatch misreported as topic drift.
  const status: RelevanceStatus =
    looksNonEnglish(referenceHypothesis) || seen.size < minBasis
      ? "not-assessed"
      : alignedFraction >= alignedThreshold
        ? "aligned"
        : alignedFraction <= driftedThreshold
          ? "drifted"
          : "mixed";

  return { status, alignedFraction, ruleTerms, perClaimOverlap };
}
