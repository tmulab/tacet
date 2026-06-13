import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ingestCrossref } from "./crossref.js";
import type { CrossrefWork } from "./crossref.js";
import type { Lean } from "../domain/types.js";

/**
 * Offline, deterministic generator for the VERSIONED replay fixture
 * (fixtures/covid-ingested.json). It runs the REAL `ingestCrossref` over a
 * curated set of records, so the fixture is genuinely the ingestion's output
 * (validates the path end-to-end), and it needs no network.
 *
 * The records below are ILLUSTRATIVE, not verbatim third-party content: they use
 * the Crossref test DOI prefix 10.5555 and representative abstracts, authored
 * offline because the build environment has no network. The real harvest from
 * open-license (CC-BY) sources runs via `npm run harvest` when network exists;
 * its output lands in corpus/ (gitignored). This separation keeps replay
 * zero-network while the harvest path proves the real ingestion.
 *
 * The reader leans are STUB placeholders (like the StubReader and the
 * truncated-stub summary) cycling the three signals; the LlmReader replaces them
 * in Phase 5. Run with: npm run build:fixture
 */

const en = (s: string) => s; // readability marker for English records

const RECORDS: readonly CrossrefWork[] = [
  {
    DOI: "10.5555/tacet.covid.vaccine-efficacy",
    title: ["Efficacy of mRNA COVID-19 vaccines against symptomatic infection"],
    author: [{ given: "A.", family: "Mendes" }, { given: "R.", family: "Khan" }],
    issued: { "date-parts": [[2021]] }, "container-title": ["Open Journal of Vaccinology"],
    language: "en",
    abstract: `<jats:title>Abstract</jats:title><jats:p>${en("We assessed efficacy of two mRNA vaccines against symptomatic SARS-CoV-2 infection in pre-registered phase-3 endpoints. ").repeat(12)}</jats:p>`,
    reference: [{ DOI: "10.5555/tacet.covid.booster" }, { DOI: "10.5555/tacet.covid.cardio" }],
  },
  {
    DOI: "10.5555/tacet.covid.booster",
    title: ["Benefit and risk of routine boosters in low-risk young adults"],
    author: [{ given: "L.", family: "Oliveira" }],
    issued: { "date-parts": [[2022]] }, "container-title": ["Immunization Reports"],
    language: "en",
    abstract: "<jats:p>We review evidence on the benefit-risk balance of routine booster doses in low-risk young adults and find the question underdetermined by current data.</jats:p>",
    reference: [{ DOI: "10.5555/tacet.covid.vaccine-efficacy" }],
  },
  {
    DOI: "10.5555/tacet.covid.school-closures",
    title: ["School closures and transmission: a scoping review"],
    author: [{ given: "M.", family: "Santos" }, { given: "J.", family: "Park" }],
    issued: { "date-parts": [[2020]] }, "container-title": ["Public Health Open"],
    language: "eng",
    abstract: "<jats:p>Contemporaneous controlled evidence for early-2020 school-closure effects on transmission was sparse and heterogeneous.</jats:p>",
    reference: [{ DOI: "10.5555/tacet.covid.booster" }],
  },
  {
    DOI: "10.5555/tacet.covid.cardio",
    title: ["Cardiovascular outcomes following COVID-19 infection: a cohort"],
    author: [{ given: "S.", family: "Almeida" }],
    issued: { "date-parts": [[2022]] }, "container-title": ["Cardiology Open Access"],
    language: "en",
    abstract: "<jats:p>We characterized one-year cardiovascular outcomes after infection; ten-year horizons remain uncharacterized in the cited base.</jats:p>",
    reference: [{ DOI: "10.5555/tacet.covid.vaccine-efficacy" }],
  },
  {
    DOI: "10.5555/tacet.covid.masks",
    title: ["Community mask mandates and respiratory transmission"],
    author: [{ given: "K.", family: "Nguyen" }],
    issued: { "date-parts": [[2021]] }, "container-title": ["Open Epidemiology"],
    language: "English",
    abstract: "<jats:p>Observational studies of community mask mandates show mixed effect estimates with substantial confounding.</jats:p>",
    reference: [],
  },
  {
    DOI: "10.5555/tacet.covid.ivermectin",
    title: ["Ivermectin for COVID-19: a randomized controlled trial"],
    author: [{ given: "P.", family: "Costa" }],
    issued: { "date-parts": [[2021]] }, "container-title": ["Trials Open"],
    language: "en",
    abstract: "<jats:p>In this RCT, ivermectin did not significantly reduce time to recovery versus placebo.</jats:p>",
    reference: [{ DOI: "10.5555/tacet.covid.vaccine-efficacy" }],
  },
  {
    DOI: "10.5555/tacet.covid.origins",
    title: ["Zoonotic spillover hypotheses for SARS-CoV-2 origins"],
    author: [{ given: "H.", family: "Wei" }],
    issued: { "date-parts": [[2021]] }, "container-title": ["Virology Open"],
    language: "en",
    abstract: "<jats:p>We summarize evidence pertinent to zoonotic spillover hypotheses, noting gaps in non-anglophone primary sources.</jats:p>",
    reference: [],
  },
  {
    DOI: "10.5555/tacet.covid.ventilation",
    title: ["Indoor ventilation and aerosol transmission of SARS-CoV-2"],
    author: [{ given: "T.", family: "Ferreira" }],
    issued: { "date-parts": [[2021]] }, "container-title": ["Indoor Air Open"],
    language: "en",
    abstract: "<jats:p>Improved ventilation is associated with reduced aerosol transmission risk in modeled and field settings.</jats:p>",
    reference: [{ DOI: "10.5555/tacet.covid.masks" }],
  },
  {
    DOI: "10.5555/tacet.covid.myocarditis",
    title: ["Myocarditis after mRNA vaccination in adolescents"],
    author: [{ given: "D.", family: "Rocha" }],
    issued: { "date-parts": [[2022]] }, "container-title": ["Pediatrics Open"],
    language: "en",
    abstract: "<jats:p>Rare myocarditis events after mRNA vaccination in adolescent males were predominantly mild and self-limiting.</jats:p>",
    reference: [{ DOI: "10.5555/tacet.covid.vaccine-efficacy" }, { DOI: "10.5555/tacet.covid.cardio" }],
  },
  {
    DOI: "10.5555/tacet.covid.reinfection",
    title: ["Natural immunity and reinfection risk after COVID-19"],
    author: [{ given: "B.", family: "Souza" }],
    issued: { "date-parts": [[2022]] }, "container-title": ["Open Immunity"],
    language: "en",
    abstract: "<jats:p>Prior infection conferred measurable but waning protection against reinfection across variant waves.</jats:p>",
    reference: [{ DOI: "10.5555/tacet.covid.vaccine-efficacy" }, { DOI: "10.5555/tacet.covid.myocarditis" }],
  },
  {
    DOI: "10.5555/tacet.covid.origin-und-declared",
    title: ["Spillover dynamics at the human-animal interface"],
    author: [{ given: "X.", family: "Liang" }],
    issued: { "date-parts": [[2021]] }, "container-title": ["Open Zoonoses"],
    language: "und", // declared undetermined → defaults to anglophone (labelled defaulted)
    abstract: "<jats:p>This English-language abstract is published with no determinable language code; the publisher left the language field as 'und'.</jats:p>",
    reference: [{ DOI: "10.5555/tacet.covid.origins" }],
  },
  {
    DOI: "10.5555/tacet.covid.origin-no-lang",
    title: ["Phylogenetic timing of early SARS-CoV-2 lineages"],
    author: [{ given: "Y.", family: "Tan" }],
    issued: { "date-parts": [[2022]] }, "container-title": ["Open Phylogenetics"],
    // language field omitted entirely → also defaults to anglophone (defaulted)
    abstract: "<jats:p>We estimate divergence times of early lineages; this record carries no language field at all.</jats:p>",
    reference: [],
  },
  {
    DOI: "10.5555/tacet.covid.no-abstract-1",
    title: ["A record with no abstract (must be filtered out)"],
    author: [{ given: "N.", family: "None" }],
    issued: { "date-parts": [[2021]] }, language: "en",
  },
  {
    DOI: "10.5555/tacet.covid.no-abstract-2",
    title: ["Another record with no abstract"],
    issued: { "date-parts": [[2021]] }, language: "en",
  },
  {
    DOI: "10.5555/tacet.covid.lockdown",
    title: ["Lockdowns and economic tradeoffs: an open review"],
    author: [{ given: "G.", family: "Lima" }],
    issued: { "date-parts": [[2021]] }, "container-title": ["Policy Open"],
    language: "en",
    abstract: "<jats:p>We review estimates of lockdown effects on transmission against economic costs; net effects are contested.</jats:p>",
    reference: [],
  },
  {
    DOI: "10.5555/tacet.covid.rapid-antigen",
    title: ["Sensitivity of rapid antigen tests across variants"],
    author: [{ given: "C.", family: "Pereira" }],
    issued: { "date-parts": [[2022]] }, "container-title": ["Diagnostics Open"],
    language: "en",
    abstract: "<jats:p>Rapid antigen test sensitivity varied with viral load and sampling timing across variants.</jats:p>",
    reference: [{ DOI: "10.5555/tacet.covid.masks" }],
  },
];

const LEAN_CYCLE: readonly (readonly [Lean, Lean])[] = [
  ["supports", "supports"], // robust-core
  ["supports", "contradicts"], // live-crux
  ["contradicts", "contradicts"], // robust-core
  ["supports", "insufficient"], // unsupported
];

function main(): void {
  const { claims, citationGraph } = ingestCrossref(RECORDS);

  const readerA: Record<string, Lean> = {};
  const readerB: Record<string, Lean> = {};
  claims.forEach((claim, i) => {
    const pair = LEAN_CYCLE[i % LEAN_CYCLE.length] ?? (["supports", "supports"] as const);
    readerA[claim.id] = pair[0];
    readerB[claim.id] = pair[1];
  });

  const fixture = {
    case: "covid-ingested",
    note:
      "Generated offline by src/ingestion/build-ingested-fixture.ts via the real ingestCrossref. " +
      "Records are ILLUSTRATIVE (test DOI prefix 10.5555, representative abstracts) — the build " +
      "env has no network; `npm run harvest` regenerates a verbatim CC-BY corpus into corpus/ " +
      "(gitignored). Reader leans are stub placeholders cycling the three signals; the LlmReader " +
      "replaces them in Phase 5.",
    claims,
    readers: { "reader-a": readerA, "reader-b": readerB },
    expectedCoverage: [
      {
        dimension: "language-family",
        value: "anglophone",
        justification: "the anglophone literature is the baseline corpus a scoping review is expected to cover (PRISMA-ScR item 8).",
      },
      {
        dimension: "language-family",
        value: "non-anglophone",
        justification: "the dispute concerns events centered in China; non-anglophone (esp. Chinese-language) primary sources are pertinent per the WHO-convened global study of origins (2021).",
      },
      {
        dimension: "geographic-locus",
        value: "east-asia",
        justification: "first-wave epidemiology and origins evidence is concentrated in East Asia; sources from that locus are pertinent to the dispute.",
      },
    ],
    citationGraph,
  };

  const outPath = fileURLToPath(new URL("../../fixtures/covid-ingested.json", import.meta.url));
  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`wrote ${claims.length} ingested claims → ${outPath}`);
}

main();
