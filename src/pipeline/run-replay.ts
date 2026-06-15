import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve } from "node:path";
import { buildSkeleton } from "../domain/narrative-skeleton.js";
import type { SkeletonInput } from "../domain/narrative-skeleton.js";
import { verifyNarrative } from "../domain/narrative-verify.js";
import type { ClaimSignal, ConvergenceMap } from "../domain/convergence.js";
import type { MeasuredCoverageAudit } from "../domain/coverage.js";
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
  console.log("COHERENCE of the evidence relation, never TRUTH.");
  console.log("\nThe three outcomes the engine distinguishes:");
  console.log("  ● robust-core  — both readers converge: robust convergence");
  console.log("  ▲ live-crux    — readers take opposite leans: a genuine crux");
  console.log("  ○ unsupported  — at least one reader: evidence insufficient");
  console.log("(the empty chair — a measured coverage gap — is the section below the map.)\n");

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

function printCoverage(audit: MeasuredCoverageAudit): void {
  console.log("\nTACET — coverage audit (the empty chair)");
  console.log("Observed-vs-expected coverage. DESCRIPTIVE only. A dimension with no");
  console.log("metadata is NOT-MEASURED (never a guessed empty chair); a measured");
  console.log("dimension with zero observed IS an empty chair.\n");

  if (audit.findings.length === 0) {
    console.log("  (no expected coverage categories declared for this fixture)");
    return;
  }
  const label = (dimension: string, value: string): string => `${dimension}=${value}`;
  const width = Math.max(...audit.findings.map((f) => label(f.dimension, f.value).length));
  for (const f of audit.findings) {
    const pad = label(f.dimension, f.value).padEnd(width);
    if (f.measurability === "not-measured") {
      console.log(`  ${pad}  not-measured (no metadata — needs content inference)`);
    } else {
      const flag = f.isEmptyChair ? "  ← empty chair" : "";
      console.log(`  ${pad}  observed: ${f.observedSources}  (expected)${flag}`);
    }
  }

  if (audit.emptyChairs.length > 0) {
    console.log("\nempty chairs (MEASURED categories with zero observed sources):");
    for (const f of audit.emptyChairs) {
      console.log(`  ● ${f.value} [${f.dimension}] — 0 observed`);
      console.log(`    expected because: ${f.justification}`);
    }
  }
  if (audit.notMeasured.length > 0) {
    console.log(`\nnot-measured (${audit.notMeasured.length}): ${audit.notMeasured.map((f) => `${f.dimension}=${f.value}`).join(", ")}`);
  }
}

const DIAGNOSIS_NOTE: Readonly<Record<string, string>> = {
  adjacent: "the corpus does not bear on the question — the pertinent literature is the empty chair, not a flaw",
  polarized: "the corpus engages the question but splits (supports vs contradicts) without converging",
  mixed: "high abstention with no single dominant shape",
};

function printAbstentionDiagnosis(fixture: ReplayFixture): void {
  console.log("\nTACET — abstention diagnosis (WHY the readers abstained, when they did)");
  console.log("A measured property of the CORPUS, never a verdict on the question.\n");
  if (!("abstentionDiagnosis" in fixture)) {
    console.log("  not computed (pre-0.1.1 fixture)");
    return;
  }
  const d = fixture.abstentionDiagnosis ?? null;
  if (d === null) {
    console.log("  null — abstention is not high enough to diagnose (the map carries structure)");
    return;
  }
  console.log(`  ${d} — ${DIAGNOSIS_NOTE[d] ?? ""}`);
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

/** Known frozen cases, selectable by short key: `npm run demo:replay -- lhc`.
 * COVID (sago-origin v0.2, the free-OpenRouter read) stays the default. */
const CASES: Readonly<Record<string, string>> = {
  covid: "fixtures/replay/sago-origin-v0.2.json",
  sago: "fixtures/replay/sago-origin-v0.2.json",
  lhc: "fixtures/replay/lhc-origin-v0.1.json", // regime-zero (CC-BY, no anchor)
  "lhc-safety": "fixtures/replay/lhc-safety-anchored-v0.1.json", // anchored: Giddings-Mangano
  "lhc-objection": "fixtures/replay/lhc-objection-anchored-v0.1.json", // anchored: Plaga
  "lhc-comparison": "fixtures/replay/lhc-anchored-comparison-v0.1.json", // cross-anchor meta-artifact
  "lhc-anchored-ingested": "fixtures/replay/lhc-anchored-ingested-v0.1.json", // adjacent CC-BY + redacted closed-argument claims
  eggs: "fixtures/replay/eggs-cv-v0.1.json",
  "freud-derived": "fixtures/replay/freud-midas-derived-v0.1.json", // drifted ingestion (measured)
  "freud-focused": "fixtures/replay/freud-midas-focused-v0.1.json", // corrected query — still polit-econ
  "freud-contrast": "fixtures/replay/freud-contrast-v0.1.json", // derived vs focused, nature named
  "uplift-lhc": "fixtures/comparison/lhc-uplift-v0.1.json", // TACET vs deep-research (hidden dependency)
  "uplift-eggs": "fixtures/comparison/eggs-uplift-v0.1.json", // TACET vs deep-research (uncertainty/verifiability)
};

/** Resolve the fixture: a known case key, else a path, else the COVID default.
 * v0.1 (glm/minimax) of COVID is kept as historical provenance — pass its path. */
function resolveFixturePath(): string {
  const arg = process.argv[2];
  if (arg === undefined || arg.length === 0) {
    return fileURLToPath(new URL("../../fixtures/replay/sago-origin-v0.2.json", import.meta.url));
  }
  const known = CASES[arg.toLowerCase()];
  if (known !== undefined) return fileURLToPath(new URL(`../../${known}`, import.meta.url));
  return isAbsolute(arg) ? arg : resolve(process.cwd(), arg);
}

/** The cross-anchor comparison fixture is a meta-artifact, not a replay fixture:
 * print its category counts rather than running the map/coverage/profile path. */
function printComparison(raw: { caseA: string; caseB: string; categories: Record<string, number>; claims: unknown[] }): void {
  console.log("\nTACET — cross-anchor comparison (the same case under two anchors)");
  console.log("Which leans held regardless of the anchor, which moved. COHERENCE, not truth.\n");
  console.log(`  A: ${raw.caseA}`);
  console.log(`  B: ${raw.caseB}\n`);
  for (const [cat, n] of Object.entries(raw.categories)) console.log(`  ${cat.padEnd(24)} ${n}`);
  console.log(`  (${raw.claims.length} claims judged in both regimes)`);
}

interface FreudContrast {
  readonly derived: { readonly relevanceGate: { readonly status: string }; readonly structure: Record<string, number> };
  readonly focused: { readonly relevanceGate: { readonly status: string }; readonly structure: Record<string, number> };
  readonly difference: { readonly nature: string; readonly derived: string; readonly focused: string; readonly proves: string };
}

function printFreudContrast(c: FreudContrast): void {
  const line = (s: { relevanceGate: { status: string }; structure: Record<string, number> }): string =>
    `gate=${s.relevanceGate.status}  rc=${s.structure["robustCore"]} lc=${s.structure["liveCrux"]} un=${s.structure["unsupported"]}`;
  console.log("\nTACET — Freud contrast (derived vs focused). COHERENCE, not truth.\n");
  console.log(`  derived  ${line(c.derived)}`);
  console.log(`  focused  ${line(c.focused)}\n`);
  console.log(`  nature: ${c.difference.nature}`);
  console.log(`  · derived: ${c.difference.derived}`);
  console.log(`  · focused: ${c.difference.focused}`);
  console.log(`  · proves:  ${c.difference.proves}`);
}

interface FrozenNarrative {
  readonly prose: string;
  readonly banned: readonly string[];
  readonly model?: string;
}

/** Print the coerced narrative (passo 4) — the human-first reading of the
 * structure — and RE-VERIFY both guards offline so the demo proves the prose
 * never diverged from the measured structure. Skipped when no narrative exists. */
function printNarrative(fixturePath: string): void {
  const narrativePath = fixturePath.replace(/\.json$/, ".narrative.json");
  if (!existsSync(narrativePath)) return;
  const nar = JSON.parse(readFileSync(narrativePath, "utf8")) as FrozenNarrative;
  const fx = JSON.parse(readFileSync(fixturePath, "utf8")) as SkeletonInput;
  const skeleton = buildSkeleton(fx);
  const g = verifyNarrative(nar.prose, skeleton, nar.banned);
  console.log("\nTACET — coerced narrative (structure verbalized; the LLM only stitched");
  console.log("the deterministic skeleton — never the topic). Re-verified offline.\n");
  console.log(`  ${nar.prose}\n`);
  console.log(
    `  guards: numeric-fidelity=${g.numericFidelity.pass ? "PASS" : "FAIL"}  ` +
      `thematic=${g.thematic.pass ? "PASS" : "FAIL"}` +
      (nar.model !== undefined ? `  (stitched by ${nar.model})` : ""),
  );
}

interface UpliftComparison {
  readonly case: string;
  readonly query: string;
  readonly baseline: { readonly model: string; readonly queriedAt: string };
  readonly asymmetry: string;
  readonly measurements: {
    readonly verifiability: { readonly tacet: { readonly resolved: number; readonly total: number; readonly fraction: number }; readonly baseline: { readonly resolved: number; readonly total: number; readonly fraction: number } };
    readonly uncertainty: { readonly tacet: { readonly total: number }; readonly baseline: { readonly hedges: number; readonly verdicts: number } };
    readonly hiddenDependency: { readonly idMatches: readonly string[]; readonly nameMentions: readonly string[]; readonly count: number };
  };
  readonly rubric: { readonly dimensions: readonly { readonly key: string; readonly method: string; readonly criterion: string }[] };
  readonly note: string;
}

/** Print the frozen uplift comparison (FASE C) — deterministic numbers, the
 * signals, and the BLANK judge rubric. Offline; the baseline is NOT re-run. No
 * winner is declared on the judge axes. Coherence, not truth. */
function printUplift(c: UpliftComparison): void {
  const m = c.measurements;
  console.log(`\nTACET — uplift vs deep-research · case: ${c.case}`);
  console.log("Honest by construction: this does NOT measure completeness (deep-research");
  console.log("reads more). It measures verifiable fidelity, uncertainty preservation,");
  console.log("load-bearing visibility, and hidden-dependency disclosure.\n");
  console.log(`  baseline: ${c.baseline.model} (frozen ${c.baseline.queriedAt})\n`);
  console.log("  DETERMINISTIC (raw numbers, no adjectives):");
  console.log(`    verifiability      TACET ${m.verifiability.tacet.fraction} (${m.verifiability.tacet.resolved}/${m.verifiability.tacet.total})   baseline ${m.verifiability.baseline.fraction} (${m.verifiability.baseline.resolved}/${m.verifiability.baseline.total})`);
  console.log(`    TACET abstentions  ${m.uncertainty.tacet.total}   |   baseline hedges ${m.uncertainty.baseline.hedges} / verdict-markers ${m.uncertainty.baseline.verdicts}`);
  console.log(`    hidden-dependency  baseline cites ${m.hiddenDependency.count} source(s) TACET marked out-of-CC-BY: ${m.hiddenDependency.idMatches.join(", ") || "none"}` + (m.hiddenDependency.nameMentions.length > 0 ? ` (names: ${m.hiddenDependency.nameMentions.join(", ")})` : ""));
  console.log("\n  JUDGE AXES (rubric provided; NO winner declared — the judge applies it):");
  for (const d of c.rubric.dimensions) if (d.method.startsWith("judge")) console.log(`    • ${d.key}: ${d.criterion}`);
  console.log(`\n  ${c.note}`);
}

async function main(): Promise<void> {
  const path = resolveFixturePath();
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (raw["schema"] === "tacet/uplift-comparison@0.1") {
    printUplift(raw as unknown as UpliftComparison);
    return;
  }
  if (raw["schemaName"] === "tacet/anchor-comparison@0.1") {
    printComparison(raw as unknown as { caseA: string; caseB: string; categories: Record<string, number>; claims: unknown[] });
    return;
  }
  if (raw["schemaName"] === "tacet/freud-contrast@0.1") {
    printFreudContrast(raw as unknown as FreudContrast);
    return;
  }
  const fixture = raw as unknown as ReplayFixture;
  const { readerIds, map, coverage, profiles, oneReaderCount } = await computeReplay(fixture);

  printNarrative(path);
  printMap(fixture.case, fixture.claims, readerIds, map);
  printCoverage(coverage);
  printAbstentionDiagnosis(fixture);
  printProfiles(profiles);

  if (oneReaderCount > 0) {
    console.log(`\nnote: ${oneReaderCount} claim(s) had only one reader — contestation not-measured there.`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
