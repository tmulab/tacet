import { buildConvergenceMap } from "../domain/convergence.js";
import type { ConvergenceMap } from "../domain/convergence.js";
import { auditCoverage } from "../domain/coverage.js";
import type { CoverageAudit, ExpectedCategory } from "../domain/coverage.js";
import { buildReliabilityProfile } from "../domain/reliability.js";
import type { CitationGraph } from "../domain/reliability.js";
import type { ReliabilityProfile } from "../domain/convergence.js";
import type { Claim, Lean, ReaderJudgement } from "../domain/types.js";
import { StubReader } from "../readers/stub-reader.js";

/**
 * Pure replay computation — the deterministic core shared by the demo printer
 * (run-replay), the fixture freezer (freeze-fixture), and the regression test.
 * Same input → same output, NO network, NO model call: it only echoes SAVED
 * leans and runs the domain functions. Centralizing it here is what makes the
 * frozen fixture a trustworthy answer key: the freezer bakes this output, and
 * the test recomputes it and compares.
 */

/** A saved lean is either a bare lean (stub fixtures) or a {lean, model} record
 * (the `read` output, which records the producing model for auditability). */
export type SavedLean = Lean | { readonly lean: Lean; readonly model: string };

export interface ReplayFixture {
  readonly case: string;
  readonly claims: readonly Claim[];
  /** Saved per-reader leans. A reader MAY omit a claim (LLM-reader fallback);
   * such a claim ends up with one lean and not-measured contestation. */
  readonly readers: Readonly<Record<string, Readonly<Record<string, SavedLean>>>>;
  readonly expectedCoverage?: readonly ExpectedCategory[];
  readonly citationGraph?: CitationGraph;
}

export interface ReplayResult {
  readonly readerIds: readonly string[];
  readonly map: ConvergenceMap;
  readonly coverage: CoverageAudit;
  readonly profiles: readonly ReliabilityProfile[];
  readonly oneReaderCount: number;
}

export const leanOf = (entry: SavedLean): Lean => (typeof entry === "string" ? entry : entry.lean);
export const modelOf = (entry: SavedLean): string => (typeof entry === "string" ? "stub" : entry.model);

/** Echo one reader's saved leans into ReaderJudgements (StubReader behind the
 * Reader interface), then stamp the real producing model for auditability. */
async function judgementsFor(fixture: ReplayFixture, id: string): Promise<readonly ReaderJudgement[]> {
  const entries = fixture.readers[id] ?? {};
  const leanMap: Record<string, Lean> = {};
  const modelMap: Record<string, string> = {};
  for (const [claimId, entry] of Object.entries(entries)) {
    leanMap[claimId] = leanOf(entry);
    modelMap[claimId] = modelOf(entry);
  }
  const claimsForReader = fixture.claims.filter((c) => leanMap[c.id] !== undefined);
  const judgements = await new StubReader(id, leanMap).read(claimsForReader);
  return judgements.map((j) => ({ ...j, readerModel: modelMap[j.claimId] ?? j.readerModel }));
}

export async function computeReplay(fixture: ReplayFixture): Promise<ReplayResult> {
  const readerIds = Object.keys(fixture.readers);
  if (readerIds.length !== 2) {
    throw new Error(`replay expects exactly 2 readers, got ${readerIds.length}`);
  }
  const [idA, idB] = readerIds as [string, string];

  const judgementsA = await judgementsFor(fixture, idA);
  const judgementsB = await judgementsFor(fixture, idB);

  // Convergence map over the INTERSECTION (claims both readers judged). The R1
  // contract needs matching claim ids; claims with one lean are profiled, not mapped.
  const idsA = new Set(judgementsA.map((j) => j.claimId));
  const idsB = new Set(judgementsB.map((j) => j.claimId));
  const inBoth = (j: ReaderJudgement): boolean => idsA.has(j.claimId) && idsB.has(j.claimId);
  const interA = judgementsA.filter(inBoth);
  const interB = judgementsB.filter(inBoth);
  const map: ConvergenceMap = interA.length > 0 ? buildConvergenceMap(interA, interB) : { verdicts: [] };

  const coverage = auditCoverage(fixture.claims, fixture.expectedCoverage ?? []);

  const signalByClaim = new Map(map.verdicts.map((v) => [v.claimId, v.signal]));
  const allJudgements = [...judgementsA, ...judgementsB];
  const profiles = fixture.claims.map((claim) =>
    buildReliabilityProfile(
      claim,
      allJudgements.filter((j) => j.claimId === claim.id),
      signalByClaim.get(claim.id) ?? null,
      fixture.citationGraph ?? {},
    ),
  );

  const oneReaderCount = fixture.claims.filter((c) => idsA.has(c.id) !== idsB.has(c.id)).length;
  return { readerIds, map, coverage, profiles, oneReaderCount };
}
