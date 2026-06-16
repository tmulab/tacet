# FRONTEND DATA — wiring the web app to the real frozen fixtures

> Coordination doc for **Phase 3** (replacing the design's illustrative mock in
> `frontend/` with the real engine output). Written before wiring so there is no
> rework. The data layer (replay fixtures + narratives + uplift comparisons) is
> produced by the pipeline; this maps it to the screens and names the open
> decisions.

## 1. Door → artifacts (canonical mapping)

The four Home doors, resolved from `src/pipeline/run-replay.ts` `CASES`, the
`*.narrative.json` `fixture`/`opaqueId` fields, and `fixtures/comparison/`:

| Door (id) | Replay fixture | Narrative | Uplift comparison |
|-----------|----------------|-----------|-------------------|
| **covid** | `sago-origin-v0.2.json` (case-02) | `sago-origin-v0.2.narrative.json` | **— none —** |
| **lhc**   | `lhc-origin-v0.1.json` (case-04, regime-zero CC-BY) | `lhc-origin-v0.1.narrative.json` | `lhc-uplift-v0.1.json` |
| **eggs**  | `eggs-cv-v0.1.json` (case-03) | `eggs-cv-v0.1.narrative.json` | `eggs-uplift-v0.1.json` |
| **freud** | `freud-midas-derived-v0.1` (case-08) **or** `freud-midas-focused-v0.1` (case-09) | each has one | **— none —** |

The other `lhc-*` fixtures (safety/objection/comparison/anchored-ingested) are
**anchored experiments**, not the door — leave them out of the four-door UI.

## 2. ⚠️ The real data tells a DIFFERENT story than the design mock

The design's mock was idealized: ~balanced core/crux/unsupported with a **live
crux** as the centerpiece. The real frozen output is not that:

| Case | robust-core | live-crux | unsupported | empty chairs |
|------|-------------|-----------|-------------|--------------|
| covid (sago v0.2) | 8 | **0** | 36 | 1 |
| lhc (lhc-origin)  | 0 | **0** | 28 | 4 |
| eggs (eggs-cv)    | 2 | **0** | 27 | 3 |
| freud-focused     | 1 | **0** | 29 | 4 |
| freud-derived     | 0 | **0** | 21 | — |

**`live-crux = 0` everywhere**, and the output is dominated by **unsupported +
empty chairs**. The honest real story is: over the open CC-BY corpus the two
readers mostly **abstain** (unsupported), and **the empty chair is the finding** —
not "two readers diverge into a crux". The design's crux-centric centerpiece
barely occurs.

→ **The frontend must show the REAL story** (abstention + empty chair as the
result), not force the mock's crux framing. This is the main reason Phase 3 was
not wired blind. (Narrative-honesty matches the prose in `*.narrative.json`,
which already says "No live-crux items were found … there was 1 empty chair".)

## 3. Screen → data source (proposed projection)

Reading the real artifacts (server-side; the JSON is imported/bundled at build):

| Screen | Reads from | Notes |
|--------|-----------|-------|
| **Passo 0** | replay `referenceHypothesis` (one SAGO-style paragraph; *not* two editable clauses) + `expectedCoverage` | The real anchor is one text. Show it; drop the editable two-clause fiction, or split on the concession clause. |
| **Colheita** | replay `claims.length`, `notes.nonLlmSummaries`, `derived.coverageAudit` | harvest count + observed-vs-expected (real). Sources = Crossref only (honest). |
| **Dois leitores** | replay `claims` + `readers` + `derived.convergenceMap.verdicts` | 28–44 claims, mostly unsupported, **0 crux**. Show the robust-core items as cards + the unsupported count; don't fabricate a crux card. |
| **Mapa + cadeira vazia** | `derived.convergenceMap` tally + `derived.coverageAudit.emptyChairs` + `relevanceGate` | the real tricolor (mostly grey), the real empty chairs, the relevance-gate status. |
| **Narrativa** | `*.narrative.json` `prose` (TACET column) + `fixtures/comparison/*-uplift` (deep-research column + the 4 rubric dims) | **covid + freud have no uplift** → no deep-research column for them. |

## 4. Decisions (RESOLVED — Hudson, 2026-06-16)

1. **Deep-research column only where an uplift fixture exists** — i.e. **eggs**
   and **lhc**. **covid + freud** render Narrativa with the **TACET column only**
   (the `*.narrative.json` prose); no deep-research side, and no new uplift
   fixtures are built for them.
2. (subsumed by 1 — do not build covid/freud uplift.)
3. **Crux-less UX:** keep the three-signal vocabulary, but when `live-crux = 0`
   the per-case map shows **"crux ausente"** (absent), not a fabricated crux card.
4. **Real names in the UI:** the public app shows the real case name (the doors
   are real questions); the `opaqueId` (case-0N) stays in the judging artifacts
   (narrative + uplift), not the browsing UI.
5. **freud canonical variant:** not chosen yet → default to `freud-midas-focused`
   (case-09, has 1 robust-core + 4 empty chairs, slightly richer than `derived`'s
   0/21) when freud is wired; overridable.

## 5. Recommended Phase-3 order (once §4 is decided)

1. **covid** first (stable, committed `sago-origin-v0.2` + its narrative; no
   uplift → Narrativa is TACET-prose only). Proves the projection end to end.
2. **eggs** + **lhc** (have uplift → full Narrativa with the deep-research column
   and the 4 rubric dimensions).
3. **freud** once the canonical variant is chosen.

Wire one projection module (`frontend/app/realCase.ts`) that maps a replay
fixture (+ optional narrative + optional comparison) to a view-model the existing
screens consume; flip each door from mock → real as its data is confirmed.
