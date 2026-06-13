import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve } from "node:path";
import { buildConvergenceMap } from "../domain/convergence.js";
import type { ClaimSignal, ConvergenceMap } from "../domain/convergence.js";
import { auditCoverage } from "../domain/coverage.js";
import type { CoverageAudit, ExpectedCategory } from "../domain/coverage.js";
import { buildReliabilityProfile, shouldAbstain } from "../domain/reliability.js";
import type { CitationGraph } from "../domain/reliability.js";
import type { AxisValue, ReliabilityProfile } from "../domain/convergence.js";
import type { Claim, Lean, ReaderJudgement } from "../domain/types.js";
import { StubReader } from "../readers/stub-reader.js";
import type { Reader } from "../readers/reader.js";

/**
 * Replay-mode entrypoint. Loads a curated fixture, runs TWO undecided stub
 * readers over the SAME claims, builds the convergence map, and prints it.
 * No model call, deterministic, zero-GPU — the judge's default path.
 *
 * Orchestration mirrors the production ArenaOrchestrator (pattern only, not a
 * port): the per-reader execution is INJECTED (here, each Reader's own `read`),
 * we make ONE pass per reader preserving input order, and we JUXTAPOSE the two
 * outputs without fusing them — C-2: dissent is the product, not consensus.
 */

/** A saved lean is either a bare lean (stub fixtures) or a {lean, model} record
 * (the `read` output, which records the producing model for auditability). */
type SavedLean = Lean | { readonly lean: Lean; readonly model: string };

interface Fixture {
  readonly case: string;
  readonly claims: readonly Claim[];
  /** Saved per-reader leans. A reader MAY omit a claim (LLM-reader fallback);
   * such a claim ends up with one lean and not-measured contestation. */
  readonly readers: Readonly<Record<string, Readonly<Record<string, SavedLean>>>>;
  readonly expectedCoverage?: readonly ExpectedCategory[];
  readonly citationGraph?: CitationGraph;
}

const leanOf = (entry: SavedLean): Lean => (typeof entry === "string" ? entry : entry.lean);
const modelOf = (entry: SavedLean): string => (typeof entry === "string" ? "stub" : entry.model);

function loadFixture(path: string): Fixture {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as Fixture;
}

const SIGNAL_GLYPH: Readonly<Record<ClaimSignal, string>> = {
  "robust-core": "● robust-core",
  "live-crux": "▲ live-crux ",
  unsupported: "○ unsupported",
};

function printMap(
  caseName: string,
  claims: readonly Claim[],
  readerIds: readonly string[],
  map: ConvergenceMap,
): void {
  const claimText = new Map(claims.map((c) => [c.id, c.text]));
  console.log(`\nTACET — replay mode · case: ${caseName}`);
  console.log("Two UNDECIDED readers over the same evidence. Signals certify");
  console.log("COHERENCE of the evidence relation, never TRUTH.\n");

  for (const v of map.verdicts) {
    console.log(`${SIGNAL_GLYPH[v.signal]}  [${v.claimId}]`);
    const leans = readerIds.map((id) => `${id}=${v.leans[id] ?? "?"}`).join("  |  ");
    console.log(`    readers: ${leans}`);
    console.log(`    claim:   ${claimText.get(v.claimId) ?? "(unknown)"}\n`);
  }

  const tally = map.verdicts.reduce<Record<string, number>>((acc, v) => {
    acc[v.signal] = (acc[v.signal] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `summary: robust-core=${tally["robust-core"] ?? 0}  ` +
      `live-crux=${tally["live-crux"] ?? 0}  unsupported=${tally["unsupported"] ?? 0}`,
  );
}

function printCoverage(audit: CoverageAudit): void {
  console.log("\nTACET — coverage audit (the empty chair)");
  console.log("Observed-vs-expected coverage of the evidence base. DESCRIPTIVE");
  console.log("only: reports the measured gap, never interprets what it means.\n");

  const label = (dimension: string, value: string): string => `${dimension}=${value}`;
  const width = Math.max(...audit.findings.map((f) => label(f.dimension, f.value).length));
  for (const f of audit.findings) {
    const pad = label(f.dimension, f.value).padEnd(width);
    const flag = f.isEmptyChair ? "  ← empty chair" : "";
    console.log(`  ${pad}  observed: ${f.observedSources}  (expected)${flag}`);
  }

  if (audit.emptyChairs.length > 0) {
    console.log("\nempty chairs (expected categories with zero observed sources):");
    for (const f of audit.emptyChairs) {
      console.log(`  ● ${f.value} [${f.dimension}] — 0 observed`);
      console.log(`    expected because: ${f.justification}`);
    }
  }
}

function showAxis<T>(axis: AxisValue<T>, phaseNote = ""): string {
  return axis.kind === "measured" ? `measured: ${String(axis.value)}` : `not measured${phaseNote}`;
}

function printProfiles(profiles: readonly ReliabilityProfile[]): void {
  console.log("\nTACET — reliability profile (four axes, JUXTAPOSED — never fused)");
  console.log("Each claim gets a PROFILE, not a score. internal-contestation now");
  console.log("measures the two readers' (dis)agreement; an axis it cannot compute");
  console.log("declares not-measured rather than guessing (graceful degradation).\n");

  for (const p of profiles) {
    console.log(`  [${p.claimId}]`);
    console.log(`    traceability:              ${showAxis(p.traceability)}`);
    console.log(`    independent-corroboration: ${showAxis(p.independentCorroboration)}`);
    console.log(`    internal-contestation:     ${showAxis(p.internalContestation, " (needs two readers)")}`);
    console.log(`    agreement-from-doubt:      ${showAxis(p.agreementFromDoubt)}`);
    console.log(`    abstain:                   ${shouldAbstain(p) ? "yes" : "no"}\n`);
  }
}

/** Default replay fixture: the real ingested corpus (Phase 4). Pass a path as
 * the first CLI arg to run over another fixture (e.g. fixtures/minimal.json). */
function resolveFixturePath(): string {
  const arg = process.argv[2];
  if (arg) return isAbsolute(arg) ? arg : resolve(process.cwd(), arg);
  return fileURLToPath(new URL("../../fixtures/covid-ingested.json", import.meta.url));
}

async function main(): Promise<void> {
  const fixture = loadFixture(resolveFixturePath());

  const readerIds = Object.keys(fixture.readers);
  if (readerIds.length !== 2) {
    throw new Error(`replay expects exactly 2 readers, got ${readerIds.length}`);
  }
  const [idA, idB] = readerIds as [string, string];

  // Replay reads SAVED leans (from build:fixture's StubReader or `npm run read`'s
  // two LlmReaders). Each reader replays ONLY the claims it has a lean for — a
  // missing lean is an LLM-reader fallback, not an error. StubReader echoes the
  // saved leans deterministically (no model call), behind the Reader interface.
  const judgementsFor = async (id: string): Promise<readonly ReaderJudgement[]> => {
    const entries = fixture.readers[id] ?? {};
    const leanMap: Record<string, Lean> = {};
    const modelMap: Record<string, string> = {};
    for (const [claimId, entry] of Object.entries(entries)) {
      leanMap[claimId] = leanOf(entry);
      modelMap[claimId] = modelOf(entry);
    }
    const reader: Reader = new StubReader(id, leanMap);
    const claimsForReader = fixture.claims.filter((c) => leanMap[c.id] !== undefined);
    const judgements = await reader.read(claimsForReader);
    // StubReader stamps readerModel "stub"; override with the saved model so the
    // real producer (GLM / M2.7 / Gemma) stays auditable through replay.
    return judgements.map((j) => ({ ...j, readerModel: modelMap[j.claimId] ?? j.readerModel }));
  };
  const judgementsA = await judgementsFor(idA);
  const judgementsB = await judgementsFor(idB);

  // Convergence map over the INTERSECTION (claims both readers judged). The R1
  // contract needs matching claim ids; claims with one lean are profiled but not
  // mapped.
  const idsA = new Set(judgementsA.map((j) => j.claimId));
  const idsB = new Set(judgementsB.map((j) => j.claimId));
  const inBoth = (j: ReaderJudgement): boolean => idsA.has(j.claimId) && idsB.has(j.claimId);
  const interA = judgementsA.filter(inBoth);
  const interB = judgementsB.filter(inBoth);
  const map = interA.length > 0 ? buildConvergenceMap(interA, interB) : { verdicts: [] };

  printMap(fixture.case, fixture.claims, readerIds, map);

  // Coverage audit is a SEPARATE descriptive artifact appended after the map —
  // it audits the evidence base, it does not feed back into the judgement.
  const audit = auditCoverage(fixture.claims, fixture.expectedCoverage ?? []);
  printCoverage(audit);

  // Reliability profile per claim: four axes juxtaposed, never fused. The signal
  // is reused from the map (null → agreementFromDoubt not-measured); internal
  // contestation is measured from the two readers' (dis)agreement on the claim.
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
  printProfiles(profiles);

  const oneReader = fixture.claims.filter((c) => idsA.has(c.id) !== idsB.has(c.id)).length;
  if (oneReader > 0) {
    console.log(`\nnote: ${oneReader} claim(s) had only one reader — contestation not-measured there.`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
