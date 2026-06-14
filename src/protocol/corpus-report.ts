/**
 * Corpus report — a DIAGNOSTIC over a harvested corpus, never a verdict. It only
 * counts the metadata the harvest already gives (Crossref): how many records,
 * with/without abstract, with a well-formed DOI, the CC-BY slice, and the
 * distributions by language, language-family, year, venue and publisher.
 *
 * It deliberately does NOT call auditCoverage: there is no cited expected
 * baseline for this dispute yet, and inventing one would fabricate empty chairs.
 * The OBSERVED distributions here are exactly the raw material the human uses to
 * decide the empty chair LATER. Pure: no I/O, no network.
 */

import type { Claim } from "../domain/types.js";
import type { CrossrefWork } from "../ingestion/crossref.js";
import { normalizeDoi } from "../ingestion/crossref.js";

export type Tally = readonly (readonly [string, number])[];

export interface CorpusReport {
  readonly query: string;
  readonly fetchedWorks: number;
  readonly withAbstract: number;
  readonly withoutAbstract: number;
  readonly withWellFormedDoi: number;
  readonly ccByLicensed: number;
  readonly ingestedClaims: number;
  readonly byLanguage: Tally;
  readonly byLanguageFamily: Tally;
  readonly declaredLanguage: number;
  readonly defaultedLanguage: number;
  readonly byYear: Tally;
  readonly byVenue: Tally;
  readonly byPublisher: Tally;
}

function tally(values: readonly string[]): Tally {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const isCcBy = (w: CrossrefWork): boolean =>
  (w.license ?? []).some((l) => (l.URL ?? "").includes("creativecommons.org/licenses/by/"));

/** Build the diagnostic from the RAW fetched works and the INGESTED claims (the
 * works carry abstract/license/publisher; the claims carry normalized language,
 * year and venue tags). */
export function buildCorpusReport(query: string, works: readonly CrossrefWork[], claims: readonly Claim[]): CorpusReport {
  const provs = claims.map((c) => c.provenance[0]).filter((p): p is NonNullable<typeof p> => p !== undefined);
  return {
    query,
    fetchedWorks: works.length,
    withAbstract: works.filter((w) => typeof w.abstract === "string" && w.abstract.length > 0).length,
    withoutAbstract: works.filter((w) => !w.abstract).length,
    withWellFormedDoi: works.filter((w) => normalizeDoi(w.DOI) !== null).length,
    ccByLicensed: works.filter(isCcBy).length,
    ingestedClaims: claims.length,
    byLanguage: tally(provs.map((p) => p.tags?.["language"] ?? "und")),
    byLanguageFamily: tally(provs.map((p) => p.tags?.["language-family"] ?? "unknown")),
    declaredLanguage: provs.filter((p) => p.languageSource === "declared").length,
    defaultedLanguage: provs.filter((p) => p.languageSource === "defaulted").length,
    byYear: tally(provs.map((p) => p.date ?? "n/a")),
    byVenue: tally(provs.map((p) => p.venue ?? "(no venue)")),
    byPublisher: tally(works.map((w) => w.publisher?.trim() || "(no publisher)")),
  };
}

const line = (t: Tally, top = 12): string =>
  t.slice(0, top).map(([k, n]) => `      ${String(n).padStart(3)}  ${k}`).join("\n") +
  (t.length > top ? `\n      …  (+${t.length - top} more)` : "");

/** Render the report as a human-readable diagnostic block. `resolve` (optional)
 * carries the network DOI-resolution summary the bridge computes. */
export function formatCorpusReport(
  r: CorpusReport,
  resolve?: { readonly checked: number; readonly resolved: number; readonly failed: number },
): string {
  const out = [
    `CORPUS REPORT — diagnostic (not a verdict)`,
    `  query: ${r.query}`,
    `  fetched works:        ${r.fetchedWorks}`,
    `  with abstract:        ${r.withAbstract}   without: ${r.withoutAbstract}`,
    `  well-formed DOI:      ${r.withWellFormedDoi}`,
    `  CC-BY licensed slice: ${r.ccByLicensed}  (the redistributable, fixture-eligible subset)`,
    `  ingested claims:      ${r.ingestedClaims}  (only records WITH an abstract survive)`,
    `  language source:      ${r.declaredLanguage} declared, ${r.defaultedLanguage} defaulted (und→anglophone, provisional)`,
    `  by language:\n${line(r.byLanguage)}`,
    `  by language-family:\n${line(r.byLanguageFamily)}`,
    `  by year:\n${line(r.byYear)}`,
    `  by venue:\n${line(r.byVenue)}`,
    `  by publisher:\n${line(r.byPublisher)}`,
  ];
  if (resolve !== undefined) {
    out.push(`  DOIs resolve (HTTP): ${resolve.resolved}/${resolve.checked} resolved, ${resolve.failed} failed`);
  }
  return out.join("\n");
}
