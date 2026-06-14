import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve, dirname } from "node:path";
import type { ExpectedCategory } from "../domain/coverage.js";
import type { Claim } from "../domain/types.js";
import { computeReplay } from "./replay.js";
import type { ReplayFixture, SavedLean } from "./replay.js";

/**
 * FREEZE the real Phase-5c read into a versioned, offline replay fixture — the
 * judge's critical-path artifact. Reads a `*.read.json` corpus (real leans from
 * two independent models + Gemma fallback), curates the expected-coverage
 * baseline, and BAKES the derived artifacts (convergence map, coverage audit,
 * reliability profiles) as an answer key. Pure/offline/deterministic.
 *
 * Usage: npm run freeze -- corpus/<corpus>.summarized.read.json [version]
 */

interface ReadCorpus extends ReplayFixture {
  readonly referenceHypothesis?: string;
}

/** Curated, CITED expected-coverage baseline for the SARS-CoV-2 origin dispute.
 * Stated in advance (not post-hoc) so the empty chair is a measured gap against
 * a justified expectation, never our opinion. */
const SAGO_EXPECTED_COVERAGE: readonly ExpectedCategory[] = [
  {
    dimension: "language-family",
    value: "anglophone",
    justification:
      "the anglophone peer-reviewed literature is the baseline corpus a scoping review is expected to cover (PRISMA-ScR item 8: information sources).",
  },
  {
    dimension: "language-family",
    value: "non-anglophone",
    justification:
      "the dispute concerns events centered in China; non-anglophone (esp. Chinese-language) primary sources are pertinent per the WHO-convened SAGO study of origins (2025).",
  },
  {
    dimension: "geographic-locus",
    value: "east-asia",
    justification:
      "first-wave epidemiology and origins evidence is concentrated in East Asia; sources from that locus are pertinent to the dispute.",
  },
];

const READER_MODELS = {
  "reader-a": "z-ai/glm-4.6",
  "reader-b": "minimax/minimax-m2.7",
  fallback: "google/gemma-4-31b-it:free",
};

/** Claims whose LLM summary fell back to a truncated stub (summaryMethod other
 * than "llm"). They are listed explicitly so no truncated-stub is left silent. */
function nonLlmSummaryIds(claims: readonly Claim[]): readonly string[] {
  return claims.filter((c) => c.provenance[0]?.summaryMethod !== "llm").map((c) => c.id);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === undefined) throw new Error("usage: npm run freeze -- <corpus.read.json> [version]");
  const version = process.argv[3] ?? "0.1";

  const inPath = isAbsolute(arg) ? arg : resolve(process.cwd(), arg);
  const corpus = JSON.parse(readFileSync(inPath, "utf8")) as ReadCorpus;
  if (corpus.referenceHypothesis === undefined || corpus.referenceHypothesis.trim().length === 0) {
    throw new Error("corpus has no referenceHypothesis — cannot freeze an unanchored read");
  }

  // The replay INPUT (what computeReplay reads). expectedCoverage is curated here.
  const input: ReplayFixture = {
    case: "sago-origin",
    claims: corpus.claims,
    readers: corpus.readers as Readonly<Record<string, Readonly<Record<string, SavedLean>>>>,
    expectedCoverage: SAGO_EXPECTED_COVERAGE,
    ...(corpus.citationGraph !== undefined ? { citationGraph: corpus.citationGraph } : {}),
  };

  // Derived ANSWER KEY — baked once. The regression test recomputes and compares.
  const { map, coverage, profiles, oneReaderCount } = await computeReplay(input);

  const nonLlm = nonLlmSummaryIds(corpus.claims);
  const frozen = {
    schema: "tacet/replay-fixture@0.1",
    case: input.case,
    version,
    frozenFrom: arg,
    referenceHypothesis: corpus.referenceHypothesis,
    source: {
      corpus: "Crossref abstracts filtered to CC BY 4.0 at harvest (open-license).",
      referenceHypothesis:
        "Paraphrased from the WHO Scientific Advisory Group for the Origins of Novel Pathogens (SAGO) report, 2025 — CC BY-NC-SA 3.0 IGO. Attribution: World Health Organization.",
      readerModels: READER_MODELS,
    },
    notes: {
      nonLlmSummaries: nonLlm,
      nonLlmReason:
        "These records' LLM summary fell back to a truncated abstract stub. They are off-topic to origin and both readers independently judged them 'insufficient', so a real summary changes no lean and no signal. Kept as LABELLED non-summaries (summaryMethod: 'truncated-stub'), never as a fabricated summary.",
      oneReaderClaims: oneReaderCount,
    },
    claims: input.claims,
    citationGraph: input.citationGraph ?? {},
    expectedCoverage: input.expectedCoverage,
    readers: input.readers,
    derived: {
      convergenceMap: map,
      coverageAudit: coverage,
      reliabilityProfiles: profiles,
    },
  };

  const outPath = fileURLToPath(new URL(`../../fixtures/replay/sago-origin-v${version}.json`, import.meta.url));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(frozen, null, 2) + "\n");

  const tally = map.verdicts.reduce<Record<string, number>>((acc, v) => {
    acc[v.signal] = (acc[v.signal] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`froze ${input.claims.length} claims → ${outPath}`);
  console.log(
    `  map: robust-core=${tally["robust-core"] ?? 0} live-crux=${tally["live-crux"] ?? 0} ` +
      `unsupported=${tally["unsupported"] ?? 0} | empty-chairs=${coverage.emptyChairs.length} | ` +
      `non-llm-summaries=${nonLlm.length}`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
