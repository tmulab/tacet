import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { CC_BY, fetchCrossrefWorks } from "../ingestion/harvest.js";
import { ingestCrossref } from "../ingestion/crossref.js";
import { acceptedExpectedCoverage, harvestQuery, renderReferenceHypothesis } from "./protocol.js";
import { buildCorpusReport, formatCorpusReport } from "./corpus-report.js";
import type { InvestigationProtocol } from "./types.js";

/**
 * The BRIDGE — a finalized step-0 protocol → a real harvested corpus + a corpus
 * DIAGNOSTIC. It derives the Crossref query from the protocol's search strategy,
 * runs the EXISTING harvest (license filter relaxed: exploratory, not the frozen
 * fixture path), ingests, writes corpus/<case>.json (carrying the accepted
 * referenceHypothesis for the LATER read), and prints a corpus report.
 *
 * It does NOT run the readers, define an expected coverage, or freeze a fixture.
 * Diagnostic only. Prep-only (network); never on the replay/test path.
 *
 * Usage: TACET_CONTACT_EMAIL=you@x.org npm run protocol:harvest -- protocols/<case>.v1.json [limit]
 */

function corpusDir(): string {
  return fileURLToPath(new URL("../../corpus/", import.meta.url));
}

/** Best-effort HTTP resolve of each DOI against doi.org (HEAD, redirect manual:
 * a valid DOI 302-redirects to its publisher → status < 400). Bounded concurrency. */
async function resolveDois(dois: readonly string[], concurrency = 6): Promise<{ checked: number; resolved: number; failed: number }> {
  let resolved = 0;
  let failed = 0;
  for (let i = 0; i < dois.length; i += concurrency) {
    const batch = dois.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(checkOneDoi));
    for (const ok of results) ok ? (resolved += 1) : (failed += 1);
  }
  return { checked: dois.length, resolved, failed };
}

async function checkOneDoi(doi: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`https://doi.org/${doi}`, { method: "HEAD", redirect: "manual", signal: ctrl.signal });
    return res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === undefined) throw new Error("usage: npm run protocol:harvest -- <protocol.json> [limit] [--cc-by]");
  const mailto = process.env["TACET_CONTACT_EMAIL"];
  if (!mailto) throw new Error("set TACET_CONTACT_EMAIL (Crossref polite pool) — see .env.example");
  const rest = process.argv.slice(3);
  // --cc-by restricts to the redistributable slice (for a corpus to be FROZEN as
  // a fixture); default is exploratory (no license filter, the true field).
  const ccByOnly = rest.includes("--cc-by");
  const limit = Number(rest.find((a) => /^\d+$/.test(a)) ?? "50");
  const license = ccByOnly ? CC_BY : null;

  const inPath = isAbsolute(arg) ? arg : resolvePath(process.cwd(), arg);
  const protocol = JSON.parse(readFileSync(inPath, "utf8")) as InvestigationProtocol;

  // Require a finalized hypothesis: it travels into the corpus for the later read.
  let referenceHypothesis: string;
  try {
    referenceHypothesis = renderReferenceHypothesis(protocol);
  } catch (e: unknown) {
    console.error(`protocol not ready to harvest: ${e instanceof Error ? e.message : String(e)}`);
    console.error("(finalize it first: npm run protocol -- accept <draft.json>)");
    process.exitCode = 1;
    return;
  }

  const query = harvestQuery(protocol);
  console.log(`harvesting (${ccByOnly ? "CC-BY only — freezable slice" : "exploratory, no license filter"}) up to ${limit} abstracted records`);
  console.log(`  case: ${protocol.case}\n  query: ${query}\n`);
  const works = await fetchCrossrefWorks(query, limit, mailto, license);
  const { claims, citationGraph } = ingestCrossref(works);
  console.log(`fetched ${works.length} works → ${claims.length} ingested claims\n`);

  // The accepted expectedCoverage travels with the corpus → summarize → read →
  // freeze (the empty-chair baseline, declared in step 0, never from the corpus).
  const expectedCoverage = acceptedExpectedCoverage(protocol);

  const dir = corpusDir();
  mkdirSync(dir, { recursive: true });
  const outPath = resolvePath(dir, `${protocol.case}.json`);
  writeFileSync(
    outPath,
    JSON.stringify({ case: protocol.case, referenceHypothesis, expectedCoverage, claims, citationGraph }, null, 2) + "\n",
  );
  console.log(`wrote corpus → ${outPath} (gitignored)\n`);

  const report = buildCorpusReport(query, works, claims);
  console.log("resolving DOIs against doi.org…");
  const resolve = await resolveDois(claims.map((c) => c.id));
  console.log("\n" + formatCorpusReport(report, resolve) + "\n");

  const reportPath = resolvePath(dir, `${protocol.case}.report.json`);
  writeFileSync(reportPath, JSON.stringify({ ...report, doiResolution: resolve }, null, 2) + "\n");
  console.log(`wrote report → ${reportPath}`);
}

if (process.argv[1] !== undefined && /harvest-from-protocol\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
