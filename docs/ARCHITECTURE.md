# TACET — Architecture

A small, self-contained pipeline. Five stages, mirroring the method in the
plan document. Each stage is a pure domain operation; Next sits only at the
edges (added later).

```
                evidence (PDFs/articles, public sources)
                              │
                  ┌───────────▼───────────┐
                  │  1. INGESTION          │  src/ingestion/
                  │  → Claim[] w/ Provenance│  (adapts VIGILIA design; stubbed first)
                  └───────────┬───────────┘
                              │  same evidence to both
              ┌───────────────┴───────────────┐
              ▼                                 ▼
   ┌──────────────────┐              ┌──────────────────┐
   │ 2. Reader A      │              │    Reader B      │   src/readers/
   │ (undecided)      │              │   (undecided)    │   StubReader first,
   └────────┬─────────┘              └────────┬─────────┘   LlmReader later
            │  ReaderJudgement[]              │
            └───────────────┬─────────────────┘
                            ▼
              ┌──────────────────────────┐
              │ 3. CONVERGENCE MAP        │   src/domain/convergence.ts
              │  converge → robust-core   │
              │  diverge  → live-crux     │
              │  insuff.  → unsupported   │
              └────────────┬─────────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼                              ▼
 ┌────────────────────┐        ┌────────────────────────┐
 │ 4. COVERAGE AUDIT  │        │ 5. RELIABILITY PROFILE  │
 │  the empty chair   │        │  4 axes, juxtaposed,    │
 │  observed vs exp.  │        │  graceful degradation   │
 │  src/domain/        │        │  src/domain/convergence │
 │  coverage.ts        │        │  .ts                    │
 └────────────────────┘        └────────────────────────┘
                           │
                           ▼
              navigable artifact (map + audit + profiles)
              + descriptive TEMPORAL layer over the map
                (dates as metadata, never a decision rule)
```

## Why two undecided readers (not two advocates)

If each reader argued an assigned side, their disagreement would be guaranteed
by construction and discover nothing. Two readers that both start undecided,
over the same evidence, disagree only where the evidence is genuinely
ambiguous — so a split locates a real crux, and convergence-despite-doubt is a
robustness signal that construction did not plant. This is the answer to the
circularity objection ("each reader just confirms its own corpus"): there is no
per-side corpus to confirm.

## Modes

- **replay** (judge default): runs over `fixtures/`, deterministic, zero-GPU,
  no model call. `npm run demo:replay`.
- **live**: `LlmReader` calls a real model behind the `Reader` interface.

## What is stubbed first

`StubReader` (deterministic leans from a fixture) and a stub ingestion let the
whole pipeline run and be tested before any model is wired in. The LLM reader
arrives later as a prompt behind the same interface — "roles, not brands".

## Design mirrors the production version

Class names and boundaries here (`Reader`, `ConvergenceMap`, `ReliabilityProfile`,
`CoverageAudit`) are the same the Java production TACET will use. This prototype
is throwaway code but a durable spec.
