import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { auditCoverageMeasured } from "../domain/coverage.js";
import type { Claim } from "../domain/types.js";
import { acceptedExpectedCoverage } from "./protocol.js";
import type { InvestigationProtocol } from "./types.js";

/**
 * The empty-chair audit — measures the harvested corpus against the protocol's
 * HUMAN-ACCEPTED expectedCoverage (declared in step 0 from question+anchor, NOT
 * from the corpus: anti-circular). It NEVER derives an expectation from the
 * corpus; it only reads `acceptedExpectedCoverage(protocol)`. Dimensions with no
 * metadata (e.g. theoretical tradition) are reported not-measured, not guessed.
 *
 * Offline-pure analysis (no network); prep-only. The corpus and protocol are read
 * from disk. Usage:
 *   npm run protocol:coverage -- protocols/<case>.v1.json [corpus/<case>.json]
 */

interface Corpus {
  readonly case: string;
  readonly claims: readonly Claim[];
}

function main(): void {
  const protoArg = process.argv[2];
  if (protoArg === undefined) throw new Error("usage: npm run protocol:coverage -- <protocol.json> [corpus.json]");
  const protoPath = isAbsolute(protoArg) ? protoArg : resolvePath(process.cwd(), protoArg);
  const protocol = JSON.parse(readFileSync(protoPath, "utf8")) as InvestigationProtocol;

  const corpusArg = process.argv[3] ?? fileURLToPath(new URL(`../../corpus/${protocol.case}.json`, import.meta.url));
  const corpusPath = isAbsolute(corpusArg) ? corpusArg : resolvePath(process.cwd(), corpusArg);
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as Corpus;

  const expected = acceptedExpectedCoverage(protocol);
  if (expected.length === 0) {
    console.error("no ACCEPTED expectedCoverage in the protocol — accept entries first (set acceptedAt/editedByHuman).");
    console.error("(the empty chair is only measured against human-accepted expectations.)");
    process.exitCode = 1;
    return;
  }

  const audit = auditCoverageMeasured(corpus.claims, expected);
  console.log(`EMPTY-CHAIR AUDIT — ${protocol.case}  (${corpus.claims.length} claims, ${expected.length} expected categories)\n`);
  for (const f of audit.findings) {
    const status =
      f.measurability === "not-measured"
        ? "NOT-MEASURED (no metadata — needs content inference)"
        : f.isEmptyChair
          ? `EMPTY CHAIR (0 observed)`
          : `present (${f.observedSources} observed)`;
    console.log(`  [${f.dimension} = ${f.value}]  ${status}`);
    console.log(`      ${f.justification}`);
  }
  console.log(
    `\nsummary: ${audit.emptyChairs.length} measured empty chair(s), ` +
      `${audit.notMeasured.length} not-measured, ` +
      `${audit.findings.length - audit.emptyChairs.length - audit.notMeasured.length} present.`,
  );

  const outPath = corpusPath.replace(/\.json$/, "") + ".coverage.json";
  writeFileSync(outPath, JSON.stringify(audit, null, 2) + "\n");
  console.log(`\nwrote audit → ${outPath}`);
}

if (process.argv[1] !== undefined && /coverage-audit\.(ts|js)$/.test(process.argv[1])) {
  main();
}
