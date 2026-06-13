import { describe, it, expect } from "vitest";
import { classifyLanguage, ingestCrossref, normalizeLanguage, stripJats } from "../src/ingestion/crossref.js";
import type { CrossrefWork } from "../src/ingestion/crossref.js";

/**
 * TDD-first. Locks the ingestion contract (cravadas of Phase 4) BEFORE
 * implementation:
 *   - only records WITH an abstract are ingested (no-abstract is filtered, not error)
 *   - JATS tags and newlines are stripped from the abstract
 *   - the summary is a deterministic ~1000-char truncation, labelled
 *     "truncated-stub" (NOT a real summary)
 *   - language is normalized to a canonical short code across variants
 *   - coverage tag anglophone/non-anglophone derives from the language
 *   - the citation graph is extracted from reference[].DOI
 *   - provenance is filled (DOI as sourceId/locator, year, authors, venue)
 *   - duplicate DOIs are deduplicated
 * Pure function over JSON records — no network anywhere in this file.
 */

const work = (over: Partial<CrossrefWork> = {}): CrossrefWork => ({
  DOI: "10.1234/abc",
  title: ["A study of something"],
  author: [{ given: "Jane", family: "Doe" }],
  issued: { "date-parts": [[2021, 5, 3]] },
  "container-title": ["Journal of Examples"],
  language: "en",
  abstract: "<jats:p>An abstract.</jats:p>",
  reference: [{ DOI: "10.9999/cited-one" }, { DOI: "10.9999/cited-two" }],
  ...over,
});

describe("ingestCrossref", () => {
  it("(a) discards a record with no abstract (filter, not error)", () => {
    const noAbstract: CrossrefWork = { DOI: "10.2/noabs", title: ["No abstract"], language: "en" };
    const { claims } = ingestCrossref([
      work({ DOI: "10.1/withabs", abstract: "<jats:p>has one</jats:p>" }),
      noAbstract,
    ]);
    expect(claims.map((c) => c.id)).toEqual(["10.1/withabs"]);
  });

  it("(b) strips JATS tags and newlines from the abstract", () => {
    const { claims } = ingestCrossref([
      work({ abstract: "<jats:title>Abstract</jats:title>\n<jats:p>Line one.\nLine two.</jats:p>" }),
    ]);
    const summary = claims[0]?.provenance[0]?.summary ?? "";
    expect(summary).not.toContain("<jats:");
    expect(summary).not.toContain("\n");
    expect(summary).toContain("Line one. Line two.");
  });

  it("(c) summary is truncated to ~1000 chars and labelled truncated-stub", () => {
    const long = "x".repeat(3000);
    const { claims } = ingestCrossref([work({ abstract: `<jats:p>${long}</jats:p>` })]);
    const prov = claims[0]?.provenance[0];
    expect(prov?.summary?.length).toBe(1000);
    expect(prov?.summaryMethod).toBe("truncated-stub");
  });

  it("(d) normalizes language variants to a canonical short code", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("eng")).toBe("en");
    expect(normalizeLanguage("English")).toBe("en");
    expect(normalizeLanguage("EN-US")).toBe("en");
    expect(normalizeLanguage("pt")).toBe("pt");
    expect(normalizeLanguage("Portuguese")).toBe("pt");
  });

  it("(e) derives anglophone / non-anglophone coverage tag from language", () => {
    // Distinct works (distinct titles) so this isolates language, not version dedup.
    const { claims } = ingestCrossref([
      work({ DOI: "10.1/en", title: ["English paper"], language: "English" }),
      work({ DOI: "10.2/zh", title: ["Chinese paper"], language: "zh" }),
    ]);
    const tag = (id: string) =>
      claims.find((c) => c.id === id)?.provenance[0]?.tags?.["language-family"];
    expect(tag("10.1/en")).toBe("anglophone");
    expect(tag("10.2/zh")).toBe("non-anglophone");
  });

  it("(f) extracts the citation graph from reference[].DOI", () => {
    const { citationGraph } = ingestCrossref([
      work({ DOI: "10.1/src", reference: [{ DOI: "10.9/a" }, { key: "no-doi" }, { DOI: "10.9/b" }] }),
    ]);
    expect(citationGraph["10.1/src"]).toEqual(["10.9/a", "10.9/b"]);
  });

  it("(g) fills provenance: DOI as sourceId/locator, year, authors, venue", () => {
    const { claims } = ingestCrossref([work()]);
    const prov = claims[0]?.provenance[0];
    expect(prov?.sourceId).toBe("10.1234/abc");
    expect(prov?.locator).toBe("https://doi.org/10.1234/abc");
    expect(prov?.date).toBe("2021");
    expect(prov?.authors).toEqual(["Jane Doe"]);
    expect(prov?.venue).toBe("Journal of Examples");
    expect(claims[0]?.text).toBe("A study of something");
  });

  it("(h) deduplicates repeated DOIs (keeps the first)", () => {
    const { claims } = ingestCrossref([
      work({ DOI: "10.5/dup", title: ["First"] }),
      work({ DOI: "10.5/dup", title: ["Second"] }),
    ]);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.text).toBe("First");
  });
});

describe("stripJats", () => {
  it("removes tags, decodes entities, collapses whitespace", () => {
    expect(stripJats("<jats:p>a &amp; b\n  c</jats:p>")).toBe("a & b c");
  });
});

describe("classifyLanguage — three states", () => {
  it("declared English (and variants) → anglophone, declared", () => {
    expect(classifyLanguage("en")).toEqual({ family: "anglophone", source: "declared" });
    expect(classifyLanguage("English")).toEqual({ family: "anglophone", source: "declared" });
    expect(classifyLanguage("en-US")).toEqual({ family: "anglophone", source: "declared" });
  });

  it("declared non-English → non-anglophone, declared", () => {
    expect(classifyLanguage("pt")).toEqual({ family: "non-anglophone", source: "declared" });
    expect(classifyLanguage("hu")).toEqual({ family: "non-anglophone", source: "declared" });
    expect(classifyLanguage("zh")).toEqual({ family: "non-anglophone", source: "declared" });
  });

  it("undetermined or absent → anglophone by PROVISIONAL default, defaulted", () => {
    expect(classifyLanguage("und")).toEqual({ family: "anglophone", source: "defaulted" });
    expect(classifyLanguage(undefined)).toEqual({ family: "anglophone", source: "defaulted" });
    expect(classifyLanguage("")).toEqual({ family: "anglophone", source: "defaulted" });
  });

  it("no producer emits the 'unknown' family this phase (exists in the contract, vacant)", () => {
    const inputs = ["en", "eng", "English", "pt", "zh", "hu", "und", "", "fr", "xx"];
    for (const input of inputs) {
      expect(classifyLanguage(input).family).not.toBe("unknown");
    }
  });
});

describe("ingestCrossref — language source labelling", () => {
  it("labels declared vs defaulted in provenance, defaulting und → anglophone", () => {
    const { claims } = ingestCrossref([
      work({ DOI: "10.1/en", title: ["EN paper"], language: "en" }),
      work({ DOI: "10.2/pt", title: ["PT paper"], language: "pt" }),
      work({ DOI: "10.3/und", title: ["UND paper"], language: "und" }),
    ]);
    const prov = (id: string) => claims.find((c) => c.id === id)?.provenance[0];
    expect(prov("10.1/en")?.tags?.["language-family"]).toBe("anglophone");
    expect(prov("10.1/en")?.languageSource).toBe("declared");
    expect(prov("10.2/pt")?.tags?.["language-family"]).toBe("non-anglophone");
    expect(prov("10.2/pt")?.languageSource).toBe("declared");
    expect(prov("10.3/und")?.tags?.["language-family"]).toBe("anglophone");
    expect(prov("10.3/und")?.languageSource).toBe("defaulted");
  });
});

describe("ingestCrossref — version dedup", () => {
  it("collapses the five 'Candida' records to two, keeping the latest version", () => {
    const candida = (doi: string) =>
      work({ DOI: doi, title: ["Candida and Long Covid"], author: [{ family: "Smith" }], issued: { "date-parts": [[2024]] } });
    const { claims } = ingestCrossref([
      candida("10.32388/je31eo.2"),
      candida("10.32388/je31eo.3"),
      candida("10.32388/je31eo.4"),
      candida("10.32388/je31eo"),
      work({ DOI: "10.32388/3bcgaw", title: ["The Candida Covid Connection"], author: [{ family: "Jones" }], issued: { "date-parts": [[2023]] } }),
    ]);
    expect(claims).toHaveLength(2);
    // the version family collapses to its most recent version (.4)
    expect(claims.find((c) => c.text === "Candida and Long Covid")?.id).toBe("10.32388/je31eo.4");
    // the distinct work (different title+author) survives untouched
    expect(claims.some((c) => c.id === "10.32388/3bcgaw")).toBe(true);
  });

  it("collapses versions with DIVERGENT titles via DOI-base + author (F1000 72956 .3/.5)", () => {
    const { claims } = ingestCrossref([
      work({
        DOI: "10.12688/f1000research.72956.3",
        title: ["Differential enrichment of yeast DNA in SARS-CoV-2 and related genomes supports synthetic origin hypothesis"],
        author: [{ family: "Lisewski" }],
        issued: { "date-parts": [[2021]] },
      }),
      work({
        DOI: "10.12688/f1000research.72956.5",
        title: ["Evidence for yeast artificial synthesis in SARS-CoV-2 and SARS-CoV-1 genomic sequences"],
        author: [{ family: "Lisewski" }],
        issued: { "date-parts": [[2022]] },
      }),
    ]);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.id).toBe("10.12688/f1000research.72956.5"); // most recent version kept
  });

  it("PRESERVES a work and its translation (non-numeric 'en' suffix is not a version)", () => {
    const { claims } = ingestCrossref([
      work({ DOI: "10.1590/s0104-59702025000100061", title: ["História da saúde pública"], author: [{ family: "Costa" }] }),
      work({ DOI: "10.1590/s0104-59702025000100061en", title: ["History of public health"], author: [{ family: "Costa" }] }),
    ]);
    expect(claims).toHaveLength(2);
  });

  it("does NOT merge distinct DOIs whose long trailing numbers are article ids, not versions (.4814 vs .4813)", () => {
    const { claims } = ingestCrossref([
      work({ DOI: "10.1590/1518-8345.7679.4814", title: ["Influência do álcool no agravamento da COVID-19"], author: [{ family: "Silva" }], issued: { "date-parts": [[2025]] } }),
      work({ DOI: "10.1590/1518-8345.7679.4813", title: ["Influence of alcohol on the worsening of COVID-19"], author: [{ family: "Silva" }], issued: { "date-parts": [[2025]] } }),
    ]);
    expect(claims).toHaveLength(2);
  });
});
