// The four worked cases — LITERAL mock data from the Claude-Design prototype
// (Rule 14: copy/numbers verbatim). The prototype itself labels these numbers
// "illustrative until the engine runs"; Phase 3 wires the real frozen fixtures
// (covid → sago-origin-v0.2) through the domain core. Until then, every screen
// shows the `· illustrative` marker.

import { c } from "./tokens";

export type Signal = "core" | "crux" | "unsupported";
export type LeanKey = "supports" | "contradicts" | "insufficient";

export interface ClaimRow {
  readonly signal: Signal;
  readonly text: string;
  readonly leanA: LeanKey;
  readonly leanB: LeanKey;
  readonly reading: string;
}
export interface CoverageReturnRow {
  readonly label: string;
  readonly state: "ok" | "zero" | "unmeasured";
  readonly val: string;
}
export interface EmptyChairRow {
  readonly kind: "zero" | "unmeasured";
  readonly label: string;
  readonly detail: string;
  readonly val: string;
}
export interface NarrativeLine {
  readonly text: string;
  readonly anchor: "core" | "crux" | "empty";
  readonly label: string;
}
export interface CaseData {
  readonly id: string;
  readonly badge: string;
  readonly badgeColor: string;
  readonly star: boolean;
  readonly doorTitle: string;
  readonly doorSub: string;
  readonly question: string;
  readonly hypA: string;
  readonly hypB: string;
  readonly coverage: readonly { readonly dim: string; readonly vals: string; readonly unmeasured?: boolean }[];
  readonly harvest: { readonly scanned: string; readonly abstract: string; readonly claims: string };
  readonly coverageReturn: readonly CoverageReturnRow[];
  readonly readerA: string;
  readonly readerB: string;
  readonly claims: readonly ClaimRow[];
  readonly map: { readonly core: number; readonly crux: number; readonly uns: number };
  readonly emptyChair: readonly EmptyChairRow[];
  readonly insight: string;
  readonly narrative: {
    readonly tacetAnchor: string;
    readonly drAnchor: string;
    readonly tacetLines: readonly NarrativeLine[];
    readonly drText1: string;
    readonly drHighlight: string;
    readonly drText2: string;
    readonly drConclusion: string;
  };
  // ── Phase 3 real-data extensions (absent on the illustrative mock) ──
  /** true → projected from a frozen fixture, not the design mock. */
  readonly isReal?: boolean;
  /** the case's own language when it is not English (e.g. "Portuguese"); the
   * reference hypothesis is shown in the case language, not translated — TACET
   * operates on the case in its own language. Undefined for English cases. */
  readonly caseLanguage?: string;
  /** the deterministic narrative prose (TACET column) for real cases. */
  readonly narrativeProse?: string;
  /** how many claims were unsupported (shown as a summary, not 36 cards). */
  readonly unsupportedCount?: number;
  /** whether a deep-research uplift comparison exists for this case. */
  readonly hasUplift?: boolean;
  /** the TACET-vs-deep-research uplift measurement (eggs, lhc). */
  readonly uplift?: Uplift;
}

/** One side of the two-layer verifiability measure. `landing` = the cited page is
 * reachable; `registered` = the DOI exists at the doi.org handle. `hasDoiLayer`
 * false means registered is a FALLBACK to landing (no DOIs), not verification —
 * so "registered 1.00 vs 1.00" is never read as parity. `note` is the fixture's
 * own interpretive rule, shown verbatim (never rewritten in the UI). */
export interface VerifiabilitySide {
  readonly landingFraction: number;
  readonly registeredFraction: number;
  readonly landingN: string;
  readonly registeredN: string;
  readonly hasDoiLayer: boolean;
  readonly note: string;
}

/** Projected from a `tacet/uplift-comparison` fixture — the four rubric axes. */
export interface Uplift {
  readonly baselineModel: string;
  readonly asymmetry: string;
  readonly verifiability: { readonly tacet: VerifiabilitySide; readonly baseline: VerifiabilitySide };
  readonly uncertainty: { readonly tacetAbstentions: number; readonly baselineHedges: number; readonly baselineVerdicts: number };
  readonly hiddenDependency: { readonly count: number; readonly names: readonly string[] };
  readonly dimensions: readonly { readonly key: string; readonly title: string; readonly criterion: string }[];
}

export const CASE_DATA: Record<string, CaseData> = {
  freud: {
    id: "freud", badge: "outside the envelope", badgeColor: "#2E5A4B", star: true,
    doorTitle: "is psychoanalysis compatible with Marxism?",
    doorSub: "outside the envelope — the tradition that would decide was not harvested",
    question: "is Freudian psychoanalysis compatible with Marxist historical materialism?",
    hypA: "the two traditions operate at distinct levels — psychoanalysis on the individual psychic apparatus, Marxism on the material relations of production — and the best-supported reading is one of structural tension between them.",
    hypB: "the Frankfurt School tradition (Fromm, Marcuse, Adorno) proposed explicit syntheses, so incompatibility cannot be asserted without qualification.",
    coverage: [
      { dim: "language", vals: "pt · de · fr" },
      { dim: "genre", vals: "book" },
      { dim: "tradition", vals: "Frankfurt School", unmeasured: true },
    ],
    harvest: { scanned: "412", abstract: "147", claims: "28" },
    coverageReturn: [
      { label: "language pt", state: "ok", val: "34 records" },
      { label: "language de", state: "zero", val: "0 — expected, didn't appear" },
      { label: "language fr", state: "zero", val: "0 — expected, didn't appear" },
      { label: "genre book", state: "zero", val: "0 — expected, didn't appear" },
      { label: "tradition Frankfurt School", state: "unmeasured", val: "not measured" },
    ],
    readerA: "reader a · glm-4.6", readerB: "reader b · minimax-m2.7",
    claims: [
      { signal: "core", text: "Fromm and Marcuse developed explicit syntheses between drive theory and the critique of political economy.", leanA: "supports", leanB: "supports", reading: "the two readers converge, independently: the Frankfurt-School synthesis is documented. convergence that means something." },
      { signal: "crux", text: "the Freudian topography of the unconscious is reducible to class determination.", leanA: "contradicts", leanB: "insufficient", reading: "here the evidence genuinely does not decide. one reader reads against the reduction; the other finds no sufficient basis. the disagreement was not staged; it emerged." },
      { signal: "unsupported", text: "there is contemporary clinical consensus on the methodological incompatibility between the two traditions.", leanA: "insufficient", leanB: "insufficient", reading: "the base brings no sufficient evidence to support the claim — it is the weakest claim in the corpus, shown rather than hidden." },
    ],
    map: { core: 88, crux: 31, uns: 28 },
    emptyChair: [
      { kind: "zero", label: "language gap", detail: "de and fr expected in step 0 · zero observed", val: "0" },
      { kind: "zero", label: "document-genre gap", detail: "book expected in step 0 · zero observed", val: "0" },
      { kind: "unmeasured", label: "theoretical tradition", detail: "Frankfurt School — the tradition the question was about", val: "not measured" },
    ],
    insight: "the instrument measured the absence of the very tradition the question was about. the empty chair is not a debater who failed to show — it is a hole in the evidence. here, it is the finding.",
    narrative: {
      tacetAnchor: "96%", drAnchor: "61%",
      tacetLines: [
        { text: "the Frankfurt-School synthesis between drive and the critique of political economy is documented and convergent.", anchor: "core", label: "robust core · 88" },
        { text: "whether the unconscious is reducible to class remains in dispute: the evidence does not decide.", anchor: "crux", label: "live crux · 31" },
        { text: "the base did not cover the German- and French-language literature, nor the books of the Frankfurt School itself — the origin of the dispute is outside the harvested envelope.", anchor: "empty", label: "empty chair" },
      ],
      drText1: "although psychoanalysis and Marxism start from distinct assumptions about the subject,",
      drHighlight: "the consensus points to a productive synthesis",
      drText2: "in which critical theory reconciles individual desire and material structure.",
      drConclusion: "the two traditions are, in the end, compatible.",
    },
  },
  covid: {
    id: "covid", badge: "curated debate", badgeColor: "#0F6E56", star: false,
    doorTitle: "which hypothesis about the origin of SARS-CoV-2 does the evidence support?",
    doorSub: "curated debate — two clauses, one WHO/SAGO ruler",
    question: "which hypothesis about the origin of SARS-CoV-2 is best supported by the available evidence?",
    hypA: "under current evidence, natural zoonotic origin via spillover is the best-supported reading.",
    hypB: "the alternative hypothesis can be neither ruled out nor confirmed, for lack of data — the question remains inconclusive.",
    coverage: [
      { dim: "language", vals: "pt · en · zh" },
      { dim: "genre", vals: "peer-reviewed article" },
      { dim: "type", vals: "preprint", unmeasured: true },
    ],
    harvest: { scanned: "980", abstract: "410", claims: "64" },
    coverageReturn: [
      { label: "language en", state: "ok", val: "286 records" },
      { label: "language pt", state: "ok", val: "19 records" },
      { label: "language zh", state: "zero", val: "0 — expected, didn't appear" },
      { label: "type preprint", state: "unmeasured", val: "not measured" },
    ],
    readerA: "reader a · glm-4.6", readerB: "reader b · minimax-m2.7",
    claims: [
      { signal: "core", text: "three close viral relatives were described in bats across independent samplings.", leanA: "supports", leanB: "supports", reading: "the two readers converge: the phylogenetic evidence is consistent with the first clause. robust core." },
      { signal: "crux", text: "the available genomic evidence conclusively distinguishes between the two hypotheses.", leanA: "contradicts", leanB: "insufficient", reading: "one reader reads against the claim of conclusiveness; the other judges it insufficient. the divergence is real — each anchors on a distinct clause." },
      { signal: "unsupported", text: "market records establish the exact point of spillover.", leanA: "insufficient", leanB: "insufficient", reading: "the base brings no sufficient evidence to fix an exact point — the weakest claim in the corpus." },
    ],
    map: { core: 96, crux: 22, uns: 19 },
    emptyChair: [
      { kind: "zero", label: "language gap", detail: "zh literature expected · zero with a traceable abstract", val: "0" },
      { kind: "unmeasured", label: "preprints", detail: "type declared outside the provenance envelope", val: "not measured" },
    ],
    insight: "the ruler anticipated the Chinese-language literature and it did not arrive with traceable provenance. the gap is countable and was foreseen — it is not an excuse, it is a measure.",
    narrative: {
      tacetAnchor: "94%", drAnchor: "58%",
      tacetLines: [
        { text: "the phylogenetic evidence in bats supports, convergently, the first clause of the reference hypothesis.", anchor: "core", label: "robust core · 96" },
        { text: "whether genomics decides between the hypotheses remains in dispute: the evidence does not conclude.", anchor: "crux", label: "live crux · 22" },
        { text: "the base did not cover the Chinese-language literature with traceable provenance — part of the debate stayed outside the envelope.", anchor: "empty", label: "empty chair" },
      ],
      drText1: "despite the remaining uncertainties about the intermediate host,",
      drHighlight: "the weight of evidence converges on a natural origin",
      drText2: "and the other hypotheses lack equivalent empirical support.",
      drConclusion: "the question is, for practical purposes, settled.",
    },
  },
  lhc: {
    id: "lhc", badge: "confident answer", badgeColor: "#3C3489", star: false,
    doorTitle: "could the LHC create a black hole that threatens the Earth?",
    doorSub: "confident answer — deep research would say “no” and stop",
    question: "could the LHC create a black hole that threatens the Earth?",
    hypA: "the best-supported reading: hypothetical micro black holes would evaporate via Hawking radiation in fractions of a second, with no threat.",
    hypB: "Hawking radiation is theoretical and has not been observed directly; the confidence comes from consistency arguments, not from measurement.",
    coverage: [
      { dim: "language", vals: "en" },
      { dim: "genre", vals: "peer-reviewed article" },
      { dim: "observation", vals: "direct Hawking", unmeasured: true },
    ],
    harvest: { scanned: "320", abstract: "180", claims: "22" },
    coverageReturn: [
      { label: "language en", state: "ok", val: "180 records" },
      { label: "astrophysical safety argument", state: "ok", val: "41 records" },
      { label: "direct Hawking observation", state: "unmeasured", val: "not measured" },
    ],
    readerA: "reader a · glm-4.6", readerB: "reader b · minimax-m2.7",
    claims: [
      { signal: "core", text: "cosmic rays of far higher energy have struck the Earth for billions of years without incident.", leanA: "supports", leanB: "supports", reading: "the two converge: the astrophysical safety argument is robust and independent. robust core." },
      { signal: "crux", text: "the evaporation of micro black holes is empirically confirmed.", leanA: "contradicts", leanB: "insufficient", reading: "one reader reads against the claim of empirical confirmation; the other judges it insufficient. popular confidence hides this crux." },
      { signal: "unsupported", text: "there is experimental detection of Hawking radiation in accelerators.", leanA: "insufficient", leanB: "insufficient", reading: "the base brings no sufficient evidence — direct confirmation does not exist in the corpus." },
    ],
    map: { core: 91, crux: 14, uns: 9 },
    emptyChair: [
      { kind: "unmeasured", label: "direct Hawking observation", detail: "the empirical confirmation that would decide the second clause", val: "not measured" },
    ],
    insight: "deep research answers “no danger” and stops. TACET agrees on the first clause — but shows that the second rests on radiation never observed. the confidence is justified; the gap, real.",
    narrative: {
      tacetAnchor: "93%", drAnchor: "64%",
      tacetLines: [
        { text: "the cosmic-ray safety argument supports, convergently, the absence of a threat.", anchor: "core", label: "robust core · 91" },
        { text: "whether evaporation is empirically confirmed remains in dispute: the evidence does not decide.", anchor: "crux", label: "live crux · 14" },
        { text: "the base did not cover direct observation of Hawking radiation — the empirical confirmation stayed outside the envelope.", anchor: "empty", label: "empty chair" },
      ],
      drText1: "the physical mechanisms involved are well understood, and",
      drHighlight: "there is consensus that no risk exists",
      drText2: "as attested by the laboratories' own safety reviews.",
      drConclusion: "there is absolutely nothing to worry about.",
    },
  },
  eggs: {
    id: "eggs", badge: "mundane-but-contested", badgeColor: "#854F0B", star: false,
    doorTitle: "are eggs bad for the heart?",
    doorSub: "mundane-but-contested — the effect is heterogeneous, not null",
    question: "are eggs bad for the heart?",
    hypA: "the best-supported reading: moderate egg consumption does not consistently raise cardiovascular risk in the general population.",
    hypB: "subgroups (for example, diabetics) show an association in some studies — the effect is heterogeneous, not null.",
    coverage: [
      { dim: "language", vals: "en · pt" },
      { dim: "design", vals: "cohort · RCT" },
      { dim: "population", vals: "non-Western", unmeasured: true },
    ],
    harvest: { scanned: "1240", abstract: "520", claims: "96" },
    coverageReturn: [
      { label: "design cohort", state: "ok", val: "318 records" },
      { label: "design long-term RCT", state: "zero", val: "0 — expected, didn't appear" },
      { label: "non-Western population", state: "unmeasured", val: "not measured" },
    ],
    readerA: "reader a · glm-4.6", readerB: "reader b · minimax-m2.7",
    claims: [
      { signal: "core", text: "recent meta-analyses find no consistent association in the general population.", leanA: "supports", leanB: "supports", reading: "the two converge on the first clause: the average signal is null in the general population. robust core." },
      { signal: "crux", text: "the effect in diabetic subgroups is decided by current evidence.", leanA: "contradicts", leanB: "insufficient", reading: "one reader reads against the claim that it is decided; the other judges it insufficient. the crux lives in the heterogeneity." },
      { signal: "unsupported", text: "there is an established safe daily threshold for all populations.", leanA: "insufficient", leanB: "insufficient", reading: "the base brings no sufficient evidence to fix a universal threshold — the weakest claim." },
    ],
    map: { core: 102, crux: 41, uns: 33 },
    emptyChair: [
      { kind: "zero", label: "long-term randomized trials", detail: "long RCT design expected · zero with an abstract", val: "0" },
      { kind: "unmeasured", label: "non-Western populations", detail: "outside the harvested cohorts", val: "not measured" },
    ],
    insight: "the average effect is null, but the real dispute lives in the subgroups — and the long trials that would decide are not in the base. the empty chair points exactly where the science still needs to look.",
    narrative: {
      tacetAnchor: "95%", drAnchor: "60%",
      tacetLines: [
        { text: "in the general population, moderate consumption does not consistently raise risk — convergent.", anchor: "core", label: "robust core · 102" },
        { text: "whether the subgroup effect is decided remains in dispute: the evidence does not decide.", anchor: "crux", label: "live crux · 41" },
        { text: "the base did not cover long-term randomized trials nor non-Western populations — outside the envelope.", anchor: "empty", label: "empty chair" },
      ],
      drText1: "although older studies suggested caution,",
      drHighlight: "current evidence converges on the safety of moderate consumption",
      drText2: "with no relevant distinctions between groups.",
      drConclusion: "you can eat eggs without worry.",
    },
  },
};

// Home door order (the design's doorOrder).
export const DOORS: readonly CaseData[] = ["covid", "lhc", "eggs", "freud"].map((id) => CASE_DATA[id]!);

// signal + lean visual maps (literal from the prototype's _sig/_lean).
export const SIG: Record<Signal, { glyph: string; name: string; color: string; text: string; tint: string; border: string }> = {
  core: { glyph: "●", name: "robust core", color: "#1D9E75", text: "#0F6E56", tint: "#EEF4F0", border: "#cbe2d6" },
  crux: { glyph: "▲", name: "live crux", color: "#BA7517", text: "#854F0B", tint: "#FBF4E7", border: "#BA7517" },
  unsupported: { glyph: "○", name: "unsupported", color: "#8a8275", text: "#57534c", tint: c.panel3, border: c.borderInput },
};
export const LEAN: Record<LeanKey, { text: string; color: string }> = {
  supports: { text: "↑ supports", color: "#0F6E56" },
  contradicts: { text: "↓ contradicts", color: "#993C1D" },
  insufficient: { text: "◦ insufficient", color: "#888780" },
};
