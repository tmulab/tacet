import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve } from "node:path";
import { compareAnchoredMaps } from "../domain/anchor-comparison.js";
import type { ConvergenceMap } from "../domain/convergence.js";

/**
 * Cross-anchor comparison runner — reads two frozen anchored fixtures, compares
 * their convergence maps claim-by-claim, writes the report and prints the counts.
 * Pure analysis, offline. Defaults to the LHC safety vs objection regimes.
 *
 * Usage: npm run compare-anchors -- [safetyFixture] [objectionFixture] [outPath]
 */

interface FrozenFixture {
  readonly case: string;
  readonly derived: { readonly convergenceMap: ConvergenceMap };
}

function load(path: string): FrozenFixture {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  return JSON.parse(readFileSync(abs, "utf8")) as FrozenFixture;
}

function rel(p: string): string {
  return fileURLToPath(new URL(`../../${p}`, import.meta.url));
}

function main(): void {
  const aPath = process.argv[2] ?? rel("fixtures/replay/lhc-safety-anchored-v0.1.json");
  const bPath = process.argv[3] ?? rel("fixtures/replay/lhc-objection-anchored-v0.1.json");
  const outPath = process.argv[4] ?? rel("fixtures/replay/lhc-anchored-comparison-v0.1.json");

  const a = load(aPath);
  const b = load(bPath);
  const report = compareAnchoredMaps(a.derived.convergenceMap, b.derived.convergenceMap, aPath, bPath);

  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`anchor comparison: ${a.case} vs ${b.case}  (coherence, not truth)`);
  for (const [cat, n] of Object.entries(report.categories)) console.log(`  ${cat.padEnd(24)} ${n}`);
  console.log(`  (${report.claims.length} claims judged in both regimes)`);
  console.log(`wrote ${outPath}`);
}

if (process.argv[1] !== undefined && /compare-anchors\.(ts|js)$/.test(process.argv[1])) {
  main();
}
