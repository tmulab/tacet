import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve } from "node:path";
import type { ClaimSignal, ConvergenceMap } from "../domain/convergence.js";
import type { CoverageAudit } from "../domain/coverage.js";
import { shouldAbstain } from "../domain/reliability.js";
import type { AxisValue, ReliabilityProfile } from "../domain/convergence.js";
import type { Claim } from "../domain/types.js";
import { computeReplay } from "./replay.js";
import type { ReplayFixture } from "./replay.js";

/**
 * Replay-mode entrypoint. Loads a curated/frozen fixture and PRINTS the map,
 * coverage audit, and reliability profiles. All computation is in computeReplay
 * (pure, deterministic, no network, no model call) — this file is just I/O and
 * formatting at the edge. The judge's default path.
 */

function loadFixture(path: string): ReplayFixture {
  return JSON.parse(readFileSync(path, "utf8")) as ReplayFixture;
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

  if (audit.findings.length === 0) {
    console.log("  (no expected coverage categories declared for this fixture)");
    return;
  }
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
  console.log("Each claim gets a PROFILE, not a score. internal-contestation");
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

/** Default replay fixture: the FROZEN real SAGO-origin read (Phase 5c), the
 * judge's offline path. Pass a path as the first CLI arg to run another. */
function resolveFixturePath(): string {
  const arg = process.argv[2];
  if (arg) return isAbsolute(arg) ? arg : resolve(process.cwd(), arg);
  return fileURLToPath(new URL("../../fixtures/replay/sago-origin-v0.1.json", import.meta.url));
}

async function main(): Promise<void> {
  const fixture = loadFixture(resolveFixturePath());
  const { readerIds, map, coverage, profiles, oneReaderCount } = await computeReplay(fixture);

  printMap(fixture.case, fixture.claims, readerIds, map);
  printCoverage(coverage);
  printProfiles(profiles);

  if (oneReaderCount > 0) {
    console.log(`\nnote: ${oneReaderCount} claim(s) had only one reader — contestation not-measured there.`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
