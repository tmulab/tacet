import { describe, it, expect } from "vitest";
import { buildCorpusReport } from "../src/protocol/corpus-report.js";
import { harvestQuery } from "../src/protocol/protocol.js";
import { ingestCrossref } from "../src/ingestion/crossref.js";
import type { CrossrefWork } from "../src/ingestion/crossref.js";
import { PROTOCOL_SCHEMA } from "../src/protocol/types.js";
import type { InvestigationProtocol, ProvenancedText, SearchStrategy } from "../src/protocol/types.js";

/**
 * The bridge from a step-0 protocol to the existing harvest, and the corpus
 * DIAGNOSTIC. We run the REAL ingest pipeline (ingestCrossref) over synthetic
 * Crossref works, then assert the report counts the metadata the harvest gives —
 * no invented dimensions, no expected baseline (the empty chair is the human's).
 */

const CC_BY = "http://creativecommons.org/licenses/by/4.0/";

const work = (over: Partial<CrossrefWork>): CrossrefWork => ({
  DOI: "10.1/x",
  title: ["A title"],
  abstract: "<jats:p>An abstract long enough to survive.</jats:p>",
  ...over,
});

// The two "missing field" works OMIT the key (exactOptionalPropertyTypes forbids
// an explicit `undefined`), which is exactly how Crossref returns them.
const NO_ABSTRACT: CrossrefWork = { DOI: "10.1/noabs", title: ["t"], publisher: "Wiley" };
const NO_DOI: CrossrefWork = { title: ["t"], abstract: "<jats:p>has text but no DOI</jats:p>", publisher: "Wiley" };

// Distinct titles so version-dedup (title+author+recency) keeps them all.
const WORKS: readonly CrossrefWork[] = [
  work({ DOI: "10.1/en", title: ["Paper EN"], language: "en", publisher: "Elsevier", "container-title": ["Journal A"], issued: { "date-parts": [[2020]] }, license: [{ URL: CC_BY }] }),
  work({ DOI: "10.1/pt", title: ["Paper PT"], language: "pt", publisher: "SciELO", "container-title": ["Revista B"], issued: { "date-parts": [[2021]] } }),
  work({ DOI: "10.1/und", title: ["Paper UND"], language: "und", publisher: "Elsevier", "container-title": ["Journal A"], issued: { "date-parts": [[2020]] } }),
  NO_ABSTRACT, // dropped at ingest (no abstract)
  NO_DOI, // dropped at ingest (no DOI)
];

describe("buildCorpusReport — counts only what the harvest gives", () => {
  const { claims } = ingestCrossref(WORKS);
  const r = buildCorpusReport("freud capital", WORKS, claims);

  it("counts fetched vs abstract vs DOI vs CC-BY", () => {
    expect(r.fetchedWorks).toBe(5);
    expect(r.withAbstract).toBe(4);
    expect(r.withoutAbstract).toBe(1);
    expect(r.withWellFormedDoi).toBe(4); // the no-DOI work is excluded
    expect(r.ccByLicensed).toBe(1);
    expect(r.ingestedClaims).toBe(3); // no-abstract AND no-DOI both dropped
  });

  it("distributes by language, family, year, venue, publisher", () => {
    expect(r.byLanguage).toEqual(expect.arrayContaining([["en", 1], ["pt", 1], ["und", 1]]));
    expect(Object.fromEntries(r.byLanguageFamily)).toMatchObject({ anglophone: 2, "non-anglophone": 1 }); // und→anglophone
    expect(r.declaredLanguage).toBe(2); // en + pt declared
    expect(r.defaultedLanguage).toBe(1); // und defaulted
    expect(Object.fromEntries(r.byYear)).toMatchObject({ "2020": 2, "2021": 1 });
    expect(Object.fromEntries(r.byVenue)).toMatchObject({ "Journal A": 2, "Revista B": 1 });
    expect(Object.fromEntries(r.byPublisher)).toMatchObject({ Elsevier: 2, SciELO: 1, Wiley: 2 });
  });
});

describe("harvestQuery — the protocol becomes the query", () => {
  const human = (text: string): ProvenancedText => ({ text, provenance: { proposedBy: "human", editedByHuman: true, acceptedAt: "t" } });
  const strat = (source: string, query: string): SearchStrategy => ({ source, query, provenance: { proposedBy: "m", editedByHuman: false, acceptedAt: null } });
  const base: InvestigationProtocol = {
    schema: PROTOCOL_SCHEMA,
    case: "c",
    version: 1,
    question: human("Did Freud operate within capital's logic?"),
    referenceHypothesis: { bestSustained: human("a"), concession: human("b") },
    descriptors: { en: [human("psychoanalysis"), human("capital")] },
    criteria: { inclusion: [], exclusion: [] },
    seedPapers: [],
    searchStrategies: [],
    expectedCoverage: [],
    createdAt: "t",
    finalizedAt: "t",
  };

  it("prefers a crossref search strategy", () => {
    const p = { ...base, searchStrategies: [strat("openalex", "oa terms"), strat("crossref", "freud fee capital")] };
    expect(harvestQuery(p)).toBe("freud fee capital");
  });

  it("falls back to flattened descriptors when no strategy", () => {
    expect(harvestQuery(base)).toBe("psychoanalysis capital");
  });

  it("falls back to the raw question when there are no descriptors either", () => {
    const p = { ...base, descriptors: {} };
    expect(harvestQuery(p)).toBe("Did Freud operate within capital's logic?");
  });
});
