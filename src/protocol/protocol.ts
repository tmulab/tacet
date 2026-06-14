/**
 * Step-0 domain logic — pure. Builds an InvestigationProtocol from a model draft
 * (or an empty human form), and enforces the one non-negotiable invariant: the
 * MODEL PROPOSES, the HUMAN DISPOSES. A clause is "accepted" only once a human
 * edited it OR explicitly accepted it; the referenceHypothesis cannot be rendered
 * (and so can never leak into a reader prompt) until BOTH its clauses are.
 *
 * No I/O, no model calls. The clock is passed in (`nowIso`) so the logic is
 * deterministic and testable; the prep script supplies the real timestamp.
 */

import { PROTOCOL_SCHEMA } from "./types.js";
import type {
  AnchorRef,
  ClauseProvenance,
  Descriptors,
  DraftProposal,
  ExpectedCoverageEntry,
  InvestigationProtocol,
  ProvenancedText,
  SearchStrategy,
  SeedPaper,
} from "./types.js";
import type { ExpectedCategory } from "../domain/coverage.js";

const HUMAN = "human";

/** Provenance for a model-drafted clause: not-yet-accepted, optionally tagged
 * with the anchor it was distilled from. */
function modelProv(modelId: string, anchor?: AnchorRef): ClauseProvenance {
  return anchor === undefined
    ? { proposedBy: modelId, editedByHuman: false, acceptedAt: null }
    : { proposedBy: modelId, editedByHuman: false, acceptedAt: null, sourceAnchor: anchor };
}

/** The invariant predicate: a clause is accepted iff a human edited it OR
 * explicitly accepted it. Everything in step 0 rests on this. */
export function isAccepted(p: ClauseProvenance): boolean {
  return p.editedByHuman || p.acceptedAt !== null;
}

/** A clause the human typed directly: authored and accepted in one move. */
export function humanClause(text: string, nowIso: string): ProvenancedText {
  return { text, provenance: { proposedBy: HUMAN, editedByHuman: true, acceptedAt: nowIso } };
}

/** A model-drafted clause: proposed, NOT yet accepted. With `anchor`, it records
 * the PDF it was distilled from (sourceAnchor). */
export function modelClause(text: string, modelId: string, anchor?: AnchorRef): ProvenancedText {
  return { text, provenance: modelProv(modelId, anchor) };
}

/** An empty clause for the no-model fallback form: the human is to fill it. */
export function emptyClause(): ProvenancedText {
  return { text: "", provenance: { proposedBy: HUMAN, editedByHuman: false, acceptedAt: null } };
}

/** Human ACCEPTS a model draft unchanged (confirma): records acceptance but keeps
 * `proposedBy`, so the artifact still declares the machine proposed it. */
export function acceptAsIs(c: ProvenancedText, nowIso: string): ProvenancedText {
  return { text: c.text, provenance: { ...c.provenance, acceptedAt: nowIso } };
}

/** Human REWRITES a clause (reescreve): editedByHuman + acceptedAt set, with
 * `proposedBy` preserved — the artifact declares what the machine proposed AND
 * that the human changed it. */
export function editClause(c: ProvenancedText, newText: string, nowIso: string): ProvenancedText {
  return { text: newText, provenance: { ...c.provenance, editedByHuman: true, acceptedAt: nowIso } };
}

/** Paths of referenceHypothesis clauses not yet usable (not accepted, or empty
 * text). Empty list ⇒ finalizable. */
export function referenceHypothesisViolations(p: InvestigationProtocol): readonly string[] {
  const out: string[] = [];
  const check = (c: ProvenancedText, path: string): void => {
    if (!isAccepted(c.provenance)) out.push(path);
    else if (c.text.trim().length === 0) out.push(`${path} (empty text)`);
  };
  check(p.referenceHypothesis.bestSustained, "referenceHypothesis.bestSustained");
  check(p.referenceHypothesis.concession, "referenceHypothesis.concession");
  return out;
}

/** Throws unless every referenceHypothesis clause is human-accepted and non-empty. */
export function assertFinalizable(p: InvestigationProtocol): void {
  const v = referenceHypothesisViolations(p);
  if (v.length > 0) {
    throw new Error(
      "protocol not finalizable — these referenceHypothesis clauses are not human-accepted:\n  " +
        v.join("\n  ") +
        "\n(edit the text, or set acceptedAt, in the draft before accepting)",
    );
  }
}

/** Render the two-clause hypothesis into the single string `harvest`/`read`
 * inject into both readers. ASSERTS acceptance first, so an unaccepted hypothesis
 * can never reach a reader prompt. */
export function renderReferenceHypothesis(p: InvestigationProtocol): string {
  assertFinalizable(p);
  const a = p.referenceHypothesis.bestSustained.text.trim();
  const b = p.referenceHypothesis.concession.text.trim();
  return `${a} ${b}`.trim();
}

/** Stamp the protocol as finalized once the invariant holds. */
export function finalizeProtocol(p: InvestigationProtocol, nowIso: string): InvestigationProtocol {
  assertFinalizable(p);
  return { ...p, finalizedAt: nowIso };
}

function descriptorsFromDraft(
  d: Readonly<Record<string, readonly string[]>>,
  modelId: string,
  anchor?: AnchorRef,
): Descriptors {
  const out: Record<string, readonly ProvenancedText[]> = {};
  for (const [lang, terms] of Object.entries(d)) {
    out[lang] = terms.map((t) => modelClause(t, modelId, anchor));
  }
  return out;
}

/** A first search strategy derived from the proposed descriptors (English when
 * present, else the first language). Operational glue — also a model proposal, so
 * stamped as a draft clause for the same audit trail. */
function strategiesFromDraft(d: DraftProposal, modelId: string, anchor?: AnchorRef): readonly SearchStrategy[] {
  const langs = Object.values(d.descriptors);
  const terms = d.descriptors["en"] ?? langs[0] ?? [];
  if (terms.length === 0) return [];
  return [{ source: "crossref", query: terms.join(" "), provenance: modelProv(modelId, anchor) }];
}

/** Build a DRAFT protocol (v1) from a model proposal. Every proposed clause is
 * NOT-yet-accepted; the researcher must accept or rewrite before finalizing. The
 * raw question is always the human's. When `anchor` is given (anchored mode),
 * every model clause records the PDF it was distilled from (sourceAnchor). */
export function protocolFromDraft(
  caseSlug: string,
  rawQuestion: string,
  draft: DraftProposal,
  modelId: string,
  nowIso: string,
  anchor?: AnchorRef,
): InvestigationProtocol {
  return {
    schema: PROTOCOL_SCHEMA,
    case: caseSlug,
    version: 1,
    question: humanClause(rawQuestion, nowIso),
    referenceHypothesis: {
      bestSustained: modelClause(draft.bestSustained, modelId, anchor),
      concession: modelClause(draft.concession, modelId, anchor),
    },
    descriptors: descriptorsFromDraft(draft.descriptors, modelId, anchor),
    criteria: {
      inclusion: draft.inclusion.map((t) => modelClause(t, modelId, anchor)),
      exclusion: draft.exclusion.map((t) => modelClause(t, modelId, anchor)),
    },
    seedPapers: draft.seedPapers.map(
      (s): SeedPaper => ({ title: s.title, locator: s.locator, provenance: modelProv(modelId, anchor) }),
    ),
    searchStrategies: strategiesFromDraft(draft, modelId, anchor),
    expectedCoverage: (draft.expectedCoverage ?? []).map(
      (e): ExpectedCoverageEntry => ({ dimension: e.dimension, value: e.value, justification: e.justification, provenance: modelProv(modelId, anchor) }),
    ),
    createdAt: nowIso,
    finalizedAt: null,
  };
}

/** The expected-coverage categories the human has ACCEPTED — stripped to the
 * domain ExpectedCategory the audit consumes. The invariant in action: an
 * unaccepted (model-proposed-only) entry is NOT returned, so it can never become
 * the empty-chair baseline without explicit human acceptance. */
export function acceptedExpectedCoverage(p: InvestigationProtocol): readonly ExpectedCategory[] {
  return (p.expectedCoverage ?? [])
    .filter((e) => isAccepted(e.provenance))
    .map((e) => ({ dimension: e.dimension, value: e.value, justification: e.justification }));
}

/**
 * Derive the Crossref harvest query from a protocol: prefer a crossref search
 * strategy, then any strategy, then the flattened descriptors, then the raw
 * question. This is the BRIDGE from step 0's search protocol to the existing
 * harvest — the descriptors the researcher accepted become the actual query.
 */
export function harvestQuery(p: InvestigationProtocol): string {
  const crossref = p.searchStrategies.find((s) => s.source === "crossref" && s.query.trim().length > 0);
  if (crossref !== undefined) return crossref.query.trim();
  const anyStrategy = p.searchStrategies.find((s) => s.query.trim().length > 0);
  if (anyStrategy !== undefined) return anyStrategy.query.trim();
  const terms = Object.values(p.descriptors)
    .flat()
    .map((d) => d.text.trim())
    .filter((t) => t.length > 0);
  if (terms.length > 0) return terms.join(" ");
  return p.question.text.trim();
}

/** The honest no-model fallback: an EMPTY form the researcher fills by hand.
 * Schema-valid and proposedBy "human" throughout; NOT finalizable until the human
 * writes and accepts the hypothesis. Never fabricates a model proposal. */
export function emptyProtocol(caseSlug: string, rawQuestion: string, nowIso: string): InvestigationProtocol {
  return {
    schema: PROTOCOL_SCHEMA,
    case: caseSlug,
    version: 1,
    question: humanClause(rawQuestion, nowIso),
    referenceHypothesis: { bestSustained: emptyClause(), concession: emptyClause() },
    descriptors: {},
    criteria: { inclusion: [], exclusion: [] },
    seedPapers: [],
    searchStrategies: [],
    expectedCoverage: [],
    createdAt: nowIso,
    finalizedAt: null,
  };
}
