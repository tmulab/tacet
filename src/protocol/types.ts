/**
 * TACET step-0 ("passo 0") — the investigation PROTOCOL contract.
 *
 * Before any harvest, the researcher distils a raw question into a versioned,
 * pre-registered protocol that carries BOTH a VIGILIA-style search protocol
 * (multilingual descriptors, inclusion/exclusion criteria, seed papers, search
 * strategies) AND a SAGO-style two-clause referenceHypothesis (a better-sustained
 * position + a concession/tension that cannot be dismissed). The downstream
 * `referenceHypothesis` string that `harvest`/`read` inject into both readers is
 * PRODUCED here, not received ready-made.
 *
 * A model may PROPOSE a first formulation, but nothing becomes the
 * referenceHypothesis without explicit human acceptance. Every clause records who
 * proposed it and whether a human took it over — pre-registration taken
 * seriously, and the defence against the engine framing its own question.
 *
 * Pure types. No I/O, no model calls. Names mirror the production version.
 */

/** A reference to the anchor text a clause was DISTILLED from. The anchor is a
 * source of TENSION, not of truth: it gives concrete vocabulary and mechanism,
 * never authority over the answer. The artifact declares "distilled from this
 * PDF, as a position-in-dispute". */
export interface AnchorRef {
  /** Basename of the anchor PDF. */
  readonly file: string;
  /** sha256 of the PDF bytes — pins exactly which text was read. */
  readonly sha256: string;
  /** The model's ≤12-word paraphrase naming the crux (NOT a quote — a locator). */
  readonly locus?: string;
}

/** Provenance of one clause: what the machine proposed, what the human did with
 * it. The unit of the "machine proposes, human disposes" audit trail. */
export interface ClauseProvenance {
  /** Model id that drafted it (e.g. "z-ai/glm-4.6"), or "human" when the
   * researcher typed it (no model proposal at all). */
  readonly proposedBy: string;
  /** True once a human rewrote (or confirmed-by-edit) this text. */
  readonly editedByHuman: boolean;
  /** ISO timestamp of explicit human acceptance, or null until accepted. */
  readonly acceptedAt: string | null;
  /** Present when this clause was distilled from an anchor PDF. */
  readonly sourceAnchor?: AnchorRef;
}

/** A unit of protocol text carrying its provenance. */
export interface ProvenancedText {
  readonly text: string;
  readonly provenance: ClauseProvenance;
}

/** SAGO-mold hypothesis: a best-sustained position plus a concession/tension that
 * cannot be dismissed. Two clauses, each independently provenanced and accepted.
 * Rendered to the single string the readers anchor to only AFTER both are
 * human-accepted (see `renderReferenceHypothesis`). */
export interface ReferenceHypothesis {
  readonly bestSustained: ProvenancedText;
  readonly concession: ProvenancedText;
}

/** Inclusion/exclusion criteria (VIGILIA `criteria` JSON), provenanced per line. */
export interface Criteria {
  readonly inclusion: readonly ProvenancedText[];
  readonly exclusion: readonly ProvenancedText[];
}

/** A suggested seed paper. `locator` is a DOI/URL when known, else null. */
export interface SeedPaper {
  readonly title: string;
  readonly locator: string | null;
  readonly provenance: ClauseProvenance;
}

/** One search strategy, in a source's own dialect (VIGILIA `Strategy.query`). */
export interface SearchStrategy {
  readonly source: string; // "crossref" | "openalex" | …
  readonly query: string;
  readonly provenance: ClauseProvenance;
}

/** Multilingual descriptors, keyed by language code → provenanced terms (VIGILIA
 * `descriptors` JSON: { pt: […], en: […], es: […] }). */
export type Descriptors = Readonly<Record<string, readonly ProvenancedText[]>>;

/**
 * One expected-coverage category — a TRADITION / LANGUAGE / GENRE a good corpus
 * for THIS dispute should contain. The empty chair (auditCoverage) is measured
 * against this baseline.
 *
 * ANTI-CIRCULAR DISCIPLINE: it is derived in step 0 from the QUESTION and ANCHOR
 * (the structure of the debate), declared BEFORE any harvest — never read off the
 * corpus that comes back. Looking at the corpus to write the expected would be
 * looking at the answer to write the test. That is exactly why it lives in the
 * protocol, beside the hypothesis, not in a post-harvest analysis. Model proposes,
 * human disposes; nothing counts until accepted.
 */
export interface ExpectedCoverageEntry {
  /** "tradition" | "language" | "genre" (matched against corpus provenance tags;
   * "tradition" has no metadata yet → reported not-measured). */
  readonly dimension: string;
  readonly value: string;
  /** Why this category is pertinent to the dispute — cited, stated in advance. */
  readonly justification: string;
  readonly provenance: ClauseProvenance;
}

export const PROTOCOL_SCHEMA = "tacet/investigation-protocol@0.1" as const;

/** The versioned, pre-registered investigation protocol — the product of step 0,
 * ready to feed the harvest and, later, a TACET fixture. */
export interface InvestigationProtocol {
  readonly schema: typeof PROTOCOL_SCHEMA;
  readonly case: string;
  readonly version: number;
  /** The researcher's raw question (always human-authored). */
  readonly question: ProvenancedText;
  readonly referenceHypothesis: ReferenceHypothesis;
  readonly descriptors: Descriptors;
  readonly criteria: Criteria;
  readonly seedPapers: readonly SeedPaper[];
  readonly searchStrategies: readonly SearchStrategy[];
  /** What a good corpus for this dispute should contain — the empty-chair
   * baseline, derived from question+anchor BEFORE the harvest (anti-circular). */
  readonly expectedCoverage: readonly ExpectedCoverageEntry[];
  /** ISO timestamp the draft was created. */
  readonly createdAt: string;
  /** ISO timestamp the human FINALISED it (all hypothesis clauses accepted), or
   * null while still a draft. */
  readonly finalizedAt: string | null;
}

/** The model's RAW proposal, before it becomes a (draft) protocol. Shaped to the
 * prompt's JSON; produced by the LLM, never persisted on its own. A partial reply
 * degrades to empties rather than throwing. */
export interface DraftProposal {
  readonly bestSustained: string;
  readonly concession: string;
  readonly descriptors: Readonly<Record<string, readonly string[]>>;
  readonly inclusion: readonly string[];
  readonly exclusion: readonly string[];
  readonly seedPapers: readonly { readonly title: string; readonly locator: string | null }[];
  /** Anchored mode only: the model's ≤12-word paraphrase naming the crux the
   * anchor text stages. Recorded into each clause's AnchorRef.locus. */
  readonly disputeLocus?: string;
  /** The expected-coverage baseline the model proposes (tradition/language/genre),
   * derived from question+anchor — see ExpectedCoverageEntry. */
  readonly expectedCoverage?: readonly { readonly dimension: string; readonly value: string; readonly justification: string }[];
}
