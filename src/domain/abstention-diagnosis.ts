import type { Claim, OriginStance } from "./types.js";
import type { ConvergenceMap } from "./convergence.js";

/**
 * Abstention diagnosis — when a case comes back MOSTLY unsupported (the readers
 * abstained), WHY did it abstain? This makes the reason a measured property of
 * the CORPUS, not a verdict on the question. It never fires unless abstention is
 * high; when it does, it reads the corpus to label the shape of the silence:
 *
 *   - "adjacent"  — the corpus does not bear on the question (most sources take
 *                   no stance on it). The pertinent literature is the empty chair.
 *                   (The LHC regime-zero: CC-BY returns adjacent physics.)
 *   - "polarized" — the corpus IS on the question and splits (both "supports" and
 *                   "contradicts" leans are present) yet still does not converge.
 *   - "mixed"     — high abstention with neither shape clearly dominant.
 *   - null        — abstention is not high enough to diagnose.
 *
 * Pure: no I/O, no network. Honest caveat: `originStance` is the summarizer's
 * (currently COVID-framed) stance field; for a non-COVID corpus "none" means
 * "takes no such stance", which is exactly the adjacency signal we want. Real
 * topicality inference is later work; this is a heuristic over present metadata.
 */

export type AbstentionDiagnosis = "adjacent" | "polarized" | "mixed";

export interface AbstentionOptions {
  /** Min unsupported fraction of the map to count as high abstention. */
  readonly unsupportedThreshold?: number;
  /** Min fraction of sources with originStance "none" to call it adjacent. */
  readonly noneThreshold?: number;
  /** Min claims on EACH side (supports / contradicts) to call it polarized. */
  readonly minPolarizedSide?: number;
}

const DEFAULTS = { unsupportedThreshold: 0.8, noneThreshold: 0.7, minPolarizedSide: 3 } as const;

export function diagnoseAbstention(
  claims: readonly Claim[],
  map: ConvergenceMap,
  options: AbstentionOptions = {},
): AbstentionDiagnosis | null {
  const unsupportedThreshold = options.unsupportedThreshold ?? DEFAULTS.unsupportedThreshold;
  const noneThreshold = options.noneThreshold ?? DEFAULTS.noneThreshold;
  const minSide = options.minPolarizedSide ?? DEFAULTS.minPolarizedSide;

  const verdicts = map.verdicts;
  if (verdicts.length === 0) return null; // no map → nothing to diagnose
  const unsupported = verdicts.filter((v) => v.signal === "unsupported").length;
  if (unsupported / verdicts.length < unsupportedThreshold) return null; // abstention not high

  // High abstention — classify by the corpus.
  const stances = claims
    .map((c) => c.provenance[0]?.structured?.originStance)
    .filter((s): s is OriginStance => s !== undefined);
  const noneRate = stances.length > 0 ? stances.filter((s) => s === "none").length / stances.length : 0;
  if (noneRate >= noneThreshold) return "adjacent";

  const leans = verdicts.flatMap((v) => Object.values(v.leans));
  const supports = leans.filter((l) => l === "supports").length;
  const contradicts = leans.filter((l) => l === "contradicts").length;
  if (supports >= minSide && contradicts >= minSide) return "polarized";

  return "mixed";
}
