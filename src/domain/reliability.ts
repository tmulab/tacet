import type { AxisValue, ClaimSignal, ReliabilityProfile } from "./convergence.js";
import type { Claim, ReaderJudgement } from "./types.js";

/**
 * The reliability profile builder. Produces a PROFILE of four juxtaposed axes,
 * NEVER a single fused score (decisão cravada #8). It does the opposite of a
 * weighted aggregator: each axis is reported side by side with its own value,
 * and an axis that cannot be measured says so rather than being folded away.
 *
 * Inputs per claim: the claim (for its provenance, the evidence base), the two
 * readers' judgements (for traceability), the ClaimSignal already computed by
 * the convergence map (reused, not recomputed), and the citation graph among
 * sources (for independent corroboration).
 */

/** Who-cites-whom among sources: sourceId → the sourceIds it cites. */
export type CitationGraph = Readonly<Record<string, readonly string[]>>;

export function buildReliabilityProfile(
  claim: Claim,
  judgements: readonly ReaderJudgement[],
  signal: ClaimSignal | null,
  citationGraph: CitationGraph,
): ReliabilityProfile {
  return {
    claimId: claim.id,
    // MEASURED. Combination rule for two readers: traceable if AT LEAST ONE
    // reader could cite a source for this claim (an anchored doubt is enough).
    traceability: { kind: "measured", value: judgements.some((j) => j.citedSources.length > 0) },
    // MEASURED. Independent components in the citation graph over the claim's
    // sources: sources that cite each other collapse into one (correlated, not
    // independent corroboration).
    independentCorroboration: {
      kind: "measured",
      value: countIndependentComponents(claim, citationGraph),
    },
    // MEASURED once there are TWO reader judgements (Phase 5b): the base is
    // internally contested when the two independent readers disagree on the same
    // claim (their leans are not all identical). With fewer than two judgements
    // — e.g. one reader fell back — it stays not-measured (graceful degradation),
    // since disagreement needs two voices to exist.
    internalContestation: measureContestation(judgements),
    // MEASURED. The convergence-map signal for this claim — reused by design,
    // not recomputed. not-measured when no two-reader signal exists (one reader).
    agreementFromDoubt: signal === null ? { kind: "not-measured" } : { kind: "measured", value: signal },
  };
}

/** Internal contestation = do the (two) readers disagree on this claim? Needs
 * two judgements to mean anything; fewer → not-measured. Any difference in lean
 * counts as contestation (supports vs contradicts, or supports vs insufficient). */
function measureContestation(judgements: readonly ReaderJudgement[]): AxisValue<boolean> {
  if (judgements.length < 2) return { kind: "not-measured" };
  const distinctLeans = new Set(judgements.map((j) => j.lean));
  return { kind: "measured", value: distinctLeans.size > 1 };
}

/**
 * Claim-level abstention falls out of the profile; it is not a separate rule.
 * Structural definition, NO magic number: abstain iff, among the MEASURED axes,
 * none gives a positive signal — concretely, traceability is measured-false AND
 * agreementFromDoubt is measured-unsupported. Not-measured axes count neither
 * for nor against. independentCorroboration does not participate: calling a
 * count "positive" would require a magic threshold, exactly what #8 forbids.
 */
export function shouldAbstain(profile: ReliabilityProfile): boolean {
  const notTraceable =
    profile.traceability.kind === "measured" && profile.traceability.value === false;
  const noAgreement =
    profile.agreementFromDoubt.kind === "measured" &&
    profile.agreementFromDoubt.value === "unsupported";
  return notTraceable && noAgreement;
}

/** Counts independent components among the claim's sources under the citation
 * graph (union-find). Mutually-citing sources share a component. */
function countIndependentComponents(claim: Claim, graph: CitationGraph): number {
  const sources = [...new Set(claim.provenance.map((p) => p.sourceId))];
  if (sources.length === 0) return 0;

  const parent = new Map<string, string>();
  for (const s of sources) parent.set(s, s);

  const find = (x: string): string => {
    let root = x;
    let p = parent.get(root);
    while (p !== undefined && p !== root) {
      root = p;
      p = parent.get(root);
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b));
  };

  const inSet = new Set(sources);
  for (const s of sources) {
    for (const cited of graph[s] ?? []) {
      if (inSet.has(cited)) union(s, cited);
    }
  }

  return new Set(sources.map(find)).size;
}
