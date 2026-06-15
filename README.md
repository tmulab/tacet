# TACET

**A research engine from The Machine Unconscious (TMU).**
Two undecided readers, one body of evidence, and the map between them — where
they converge is the robust core, where they split is the live crux, and what
their evidence never covered is the empty chair.

> Competition entry (FLF Epistemic Case Study Competition). Deliberately small
> and self-contained. A production version lives in the TMU ecosystem.

## What it does

1. **Ingest** evidence into claims with provenance.
2. Run **two undecided readers** over the *same* evidence — each starts with no
   side assigned (not advocates).
3. Build a **convergence/divergence map**: converge → robust core; diverge →
   live crux.
4. **Coverage audit (the empty chair):** which pertinent perspective has no
   corpus in the evidence — observed vs. expected, baseline cited in advance.
5. **Reliability profile** per claim: four juxtaposed axes (traceability,
   independent corroboration, internal contestation, agreement-from-doubt),
   never fused into one number, each axis degrading gracefully to "not measured"
   rather than guessing.

A reader **certifies coherence, never truth.**

## Run it — one command, offline, no key

**Prerequisite:** Node.js ≥ 18 (tested on 22). That's all.

```bash
npm ci && npm run demo:replay
```

This compiles TypeScript → `dist/` with `tsc` and runs the demo on **plain
`node` over the compiled JS** — it does **not** use `tsx`/`ts-node`. It loads the
frozen fixture `fixtures/replay/sago-origin-v0.1.json` and prints, as text, the
three outcomes the engine distinguishes (robust convergence / genuine crux /
empty chair) plus the four juxtaposed reliability axes (an axis it cannot
compute prints `not measured`). No server, **no network, no API key**.

> **Contingency (Norton / antivirus).** Some antivirus quarantines `esbuild`
> (a dependency of the dev tooling `tsx`/`vitest`). The judge path above does
> **not** use esbuild — only `tsc` + `node`. If `npm ci` itself trips on
> esbuild's install step, run `npm rebuild esbuild` and retry, or install
> without dev tooling: `npm ci --omit=dev` is enough for `npm run demo:replay`.

Other scripts (`npm test`, `npm run typecheck`) are for maintainers and do use
the dev tooling.

### The web app is optional — to run the model locally you need none of it

There is also a hosted demo at **[tacet.tmulab.org](https://tacet.tmulab.org)** —
visit it if you want the visual experience in a browser. Its source is the
`frontend/` directory: an **isolated Next app with its own `package.json`**. It
is deliberately kept out of the command above —

- the root `npm ci` does **not** install it (no Next/React at the root);
- `npm run demo:replay`, `npm test`, `npm run build` and `npm run typecheck`
  **never touch `frontend/`** (the root `tsconfig` is scoped to `src`/`tests`;
  the test runner excludes `frontend/**`).

So a judge who just wants to **run the model locally** ignores `frontend/`
entirely and uses the one command above. To run the web app locally instead:
`cd frontend && npm install && npm run dev`.

### Visual replay — `TACET.html`

`TACET.html` (repo root) is the **same replay, read visually**. Open it in a
browser — **offline, no server, no key**. It shows the three outcomes (a genuine
crux, a robust core, an empty chair with the reserve swap) with the real leans,
models, and four axes. (Google Fonts are the only external reference and degrade
to system fonts offline.)

The terminal demo and the page **read the same frozen fixture**
(`fixtures/replay/sago-origin-v0.1.json`) and must agree — same leans, same
models, same axes. The page's data is generated from the fixture by
`npm run build:html` (plain `node`, no tsx), and `tests/html-fixture.test.ts`
fails if the two ever drift. **To regenerate after the fixture changes:**

```bash
npm run freeze -- corpus/<corpus>.summarized.read.json   # rebuild the fixture
npm run build:html                                        # re-embed it into TACET.html
```

### What this verifies (and what it doesn't)

- **Honest limitation.** The corpus contains only sources whose **abstract was
  available** (records without an abstract are filtered at ingestion). The
  replay is the **deterministic floor**: same input → same output, frozen from a
  real run. A **live mode** (readers calling models over the network, behind the
  `Reader` interface, keys via `.env`) is **0.2** and is **not required** to
  verify 0.1 — everything the judge needs is in the frozen fixture.

## Two worked cases

- **SARS-CoV-2 origin** — the anchor case. `fixtures/replay/sago-origin-v0.1.json`
  is a frozen real run: 44 CC-BY abstracts, two independent models anchored to
  the SAGO hypothesis. Default of `npm run demo:replay`.
- **Coverage audit / curated** — `fixtures/covid-ingested.json` and
  `fixtures/minimal.json` exercise the empty chair and the three signals
  deterministically. Run via `npm run demo:replay -- <path>`.

## Layout

See `docs/ARCHITECTURE.md` for the pipeline and `CLAUDE.md` for the full
project contract and crav​ed decisions. Domain core is pure TypeScript in
`src/domain`; readers in `src/readers`; orchestration in `src/pipeline`.

## Status

Pipeline complete through the frozen real run (ingestion → summarize → two
anchored readers → map + coverage + reliability profile). Offline, deterministic
replay over a versioned fixture; full TDD suite green.

## Data, sources & licensing

**Code:** MIT.

**Replay corpus (`fixtures/replay/`).** The frozen fixture
`sago-origin-v0.1.json` is the judge's offline artifact for the SARS-CoV-2
origin case. Its claims are **abstracts harvested from Crossref filtered to
Creative Commons Attribution (CC BY 4.0)** at harvest time — open-license,
redistributable with attribution to the original publishers (each claim carries
its DOI in `provenance.locator`). Two claims whose LLM summary fell back are
kept as **labelled** truncated stubs (`notes.nonLlmSummaries`), never fabricated.

**Reference hypothesis (the shared anchor both readers read against).** The PT
text in `referenceHypothesis` is **paraphrased from the World Health
Organization's Scientific Advisory Group for the Origins of Novel Pathogens
(SAGO) report, 2025**, which states that a natural zoonotic origin is the
best-supported hypothesis while the question remains inconclusive and a
research-related incident cannot be excluded or proven. The WHO/SAGO report is
published under **CC BY-NC-SA 3.0 IGO**; attribution: **World Health
Organization**. The anchor is a paraphrased two-clause derivation, not a
verbatim reproduction, and it is carried inside the fixture (not hardcoded).

**Reader models.** The demo replays **v0.2**, produced entirely by **free
OpenRouter models from distinct companies** — reader A `nvidia/nemotron-3-nano-30b-a3b:free`
(NVIDIA), reader B `openai/gpt-oss-120b:free` (OpenAI), reserve pool led by
`google/gemma-4-26b-a4b-it:free` (Google) — ranked by `bench/free-model-bench.mjs`.
**v0.1** is kept as historical provenance: its leans came from `z-ai/glm-4.6` and
`minimax/minimax-m2.7` (with `google/gemma-4-31b-it:free` fallback). Every saved
lean records its `readerModel`, so any disagreement is auditable, and replaying
either fixture makes **no network call**. The two independent free pairs land on
nearly the same map (robust-core 8 vs 9), evidence the doubt is in the method,
not a brand.

**What is NOT redistributed:** no raw third-party full texts, no closed-license
abstracts, no API keys. Bulk harvested corpora live in `corpus/` and are
git-ignored; only the curated CC-BY replay fixture is versioned.
