import type { Claim, Provenance } from "../domain/types.js";
import type { CitationGraph } from "../domain/reliability.js";
import { dedupByVersion } from "./dedup.js";

/**
 * Crossref ingestion — pure, offline, deterministic. Turns Crossref work
 * records (already-parsed JSON) into TACET `Claim[]` with full `Provenance`,
 * plus the citation graph. NO network here: fetching is the harvest's job
 * (src/ingestion/harvest.ts). This is the function the harvest and the fixture
 * generator both call, and it is what the tests pin.
 *
 * Adapts the design of the ecosystem's VIGILIA harvest (crossref-map.ts,
 * normalize.ts): DOI normalization, JATS stripping, one record → one normalized
 * unit. It does NOT drag in VIGILIA's DB shape, dedup ladder, or fingerprints.
 *
 * Cravadas honored: only-with-abstract records are kept; the summary is a
 * deterministic ~1000-char truncated stub (NOT a real summary); language is
 * normalized and drives the anglophone/non-anglophone coverage anchor; the
 * citation graph comes from reference[].DOI.
 */

export interface CrossrefAuthor {
  readonly given?: string;
  readonly family?: string;
  readonly affiliation?: readonly { readonly name?: string }[];
}

export interface CrossrefReference {
  readonly DOI?: string;
  readonly key?: string;
}

export interface CrossrefWork {
  readonly DOI?: string;
  readonly title?: readonly string[];
  readonly author?: readonly CrossrefAuthor[];
  readonly issued?: { readonly "date-parts"?: readonly (readonly (number | null)[])[] };
  readonly published?: { readonly "date-parts"?: readonly (readonly (number | null)[])[] };
  readonly "container-title"?: readonly string[];
  readonly publisher?: string;
  readonly type?: string;
  readonly language?: string;
  readonly abstract?: string;
  readonly reference?: readonly CrossrefReference[];
  readonly license?: readonly { readonly URL?: string }[];
}

export interface IngestResult {
  readonly claims: readonly Claim[];
  readonly citationGraph: CitationGraph;
}

/** Summary-stub length cap. The stub is the first N chars of the cleaned
 * abstract — a placeholder, replaced by a real summarizer in Phase 5. */
export const SUMMARY_MAX = 1000;

interface Candidate {
  readonly doi: string;
  readonly work: CrossrefWork;
  readonly cleaned: string;
}

export function ingestCrossref(works: readonly CrossrefWork[]): IngestResult {
  // Version dedup collapses a work's versions to its most recent. The citation
  // graph below is then built ONLY from the surviving (most recent) records —
  // the latest version is the canonical reference set; we do not union the
  // references of collapsed versions.
  const kept = dedupByVersion(collectCandidates(works), (c) => ({
    doi: c.doi,
    title: c.work.title?.[0] ?? "",
    authorFamily: c.work.author?.[0]?.family ?? "",
    recency: firstYear(c.work) ?? 0,
  }));

  const claims: Claim[] = kept.map((c) => ({
    id: c.doi,
    text: (c.work.title?.[0] ?? "").trim() || c.cleaned.slice(0, 80),
    provenance: [buildProvenance(c.doi, c.work, c.cleaned)],
  }));
  const citationGraph: Record<string, readonly string[]> = {};
  for (const c of kept) citationGraph[c.doi] = extractCitations(c.work.reference);

  return { claims, citationGraph };
}

/** First pass: keep records that have a usable DOI and a non-empty abstract,
 * deduplicating by exact DOI (the pre-existing dedup principle). */
function collectCandidates(works: readonly CrossrefWork[]): readonly Candidate[] {
  const candidates: Candidate[] = [];
  const seenDoi = new Set<string>();
  for (const work of works) {
    const doi = normalizeDoi(work.DOI);
    if (doi === null || seenDoi.has(doi)) continue; // need a stable id; dedup by DOI
    if (!work.abstract) continue; // CRAVADA: only records WITH an abstract
    const cleaned = stripJats(work.abstract);
    if (cleaned.length === 0) continue;
    seenDoi.add(doi);
    candidates.push({ doi, work, cleaned });
  }
  return candidates;
}

function buildProvenance(doi: string, work: CrossrefWork, cleaned: string): Provenance {
  const { family, source } = classifyLanguage(work.language);
  const language = normalizeLanguage(work.language);
  const year = firstYear(work);
  const authors = mapAuthors(work.author);
  const venue = work["container-title"]?.[0]?.trim();

  return {
    sourceId: doi,
    locator: `https://doi.org/${doi}`,
    ...(year !== null ? { date: String(year) } : {}),
    tags: { "language-family": family, language, genre: classifyGenre(work.type) },
    languageSource: source,
    summary: cleaned.slice(0, SUMMARY_MAX),
    summaryMethod: "truncated-stub",
    ...(authors.length > 0 ? { authors } : {}),
    ...(venue !== undefined && venue.length > 0 ? { venue } : {}),
  };
}

/** Coarse document genre from the Crossref `type`, for the coverage audit's
 * genre dimension. Crossref's many types collapse to book / chapter / article /
 * preprint / other. */
const GENRE_MAP: Readonly<Record<string, string>> = {
  "journal-article": "article", "proceedings-article": "article", "report": "article",
  "book-chapter": "chapter", "book-section": "chapter", "book-part": "chapter",
  "book": "book", "monograph": "book", "edited-book": "book", "reference-book": "book",
  "posted-content": "preprint",
};
export function classifyGenre(type: string | null | undefined): string {
  if (!type) return "other";
  return GENRE_MAP[type.trim().toLowerCase()] ?? "other";
}

function firstYear(work: CrossrefWork): number | null {
  const parts = work.issued?.["date-parts"]?.[0] ?? work.published?.["date-parts"]?.[0];
  const year = parts?.[0];
  return typeof year === "number" ? year : null;
}

function mapAuthors(authors: CrossrefWork["author"]): readonly string[] {
  return (authors ?? [])
    .map((a) => [a.given?.trim(), a.family?.trim()].filter(Boolean).join(" "))
    .filter((name) => name.length > 0);
}

function extractCitations(references: CrossrefWork["reference"]): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ref of references ?? []) {
    const doi = normalizeDoi(ref.DOI);
    if (doi !== null && !seen.has(doi)) {
      seen.add(doi);
      out.push(doi);
    }
  }
  return out;
}

/** DOI normalized: lowercase, URL/`doi:` prefix stripped, must start with "10.". */
export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const doi = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "");
  return doi.startsWith("10.") ? doi : null;
}

/** Strips JATS/XML tags, decodes the common entities, collapses whitespace
 * (incl. newlines). Crossref abstracts arrive as JATS XML. */
export function stripJats(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  en: "en", eng: "en", english: "en",
  pt: "pt", por: "pt", portuguese: "pt",
  zh: "zh", zho: "zh", chi: "zh", chinese: "zh",
  fr: "fr", fra: "fr", fre: "fr", french: "fr",
  es: "es", spa: "es", spanish: "es",
  de: "de", deu: "de", ger: "de", german: "de",
};

/** Codes/names that mean "no language determined". */
const UNDETERMINED = new Set(["", "und", "zxx", "mul", "mis", "unknown"]);

/** Normalizes a language code/name to a canonical short code (ISO-639-1-ish).
 * "en" / "eng" / "English" / "en-US" → "en"; undetermined codes → "und";
 * unknown falls back to the first two letters of the base subtag. */
export function normalizeLanguage(raw: string | null | undefined): string {
  if (!raw) return "und";
  const key = raw.trim().toLowerCase();
  if (UNDETERMINED.has(key)) return "und";
  const base = key.split("-")[0] ?? key;
  return LANGUAGE_ALIASES[key] ?? LANGUAGE_ALIASES[base] ?? base.slice(0, 2);
}

/** The language family for the coverage audit's anchor dimension. THREE states:
 * `unknown` exists in the contract from now on (so wiring it later is not a
 * contract change), but no producer emits it this phase — it stays vacant. */
export type LanguageFamily = "anglophone" | "non-anglophone" | "unknown";
/** Whether the family was DECLARED by the source or DEFAULTED provisionally. */
export type LanguageSource = "declared" | "defaulted";

export interface LanguageClassification {
  readonly family: LanguageFamily;
  readonly source: LanguageSource;
}

/**
 * Classifies a source's language into a family + provenance source.
 *
 *  - declared "en"/variants → anglophone, declared
 *  - declared non-English   → non-anglophone, declared
 *  - "und"/absent           → anglophone, DEFAULTED (provisional)
 *
 * The und→anglophone default is TEMPORARY and deliberately labelled: real
 * Crossref returns "und" for most records, including ones with flawless English
 * abstracts, so treating und as non-anglophone fabricated a false non-anglophone
 * population and broke the language empty-chair. Real language inference (which
 * will also light up the `unknown` family for undetectable cases) lands after
 * the LLM phase. Until then the language empty-chair is consciously dormant, and
 * every defaulted call is marked so the data stays honest about what it assumed.
 */
export function classifyLanguage(raw: string | null | undefined): LanguageClassification {
  const code = normalizeLanguage(raw);
  if (code === "und") return { family: "anglophone", source: "defaulted" };
  if (code === "en") return { family: "anglophone", source: "declared" };
  return { family: "non-anglophone", source: "declared" };
}
