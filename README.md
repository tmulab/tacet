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

## Run it (replay mode — no model, no GPU, ~deterministic)

```bash
npm install
npm run demo:replay      # runs over fixtures/, prints map + audit + profiles
npm test                 # the contract, as tests
npm run typecheck
```

Replay mode is the default and needs **no API key**. `live` mode (a real model
behind the `Reader` interface) is opt-in via `.env` — see `.env.example`.

## Two worked cases

- **COVID-origins** — the anchor case (the doubt model).
- **Coverage audit case** — demonstrates the empty chair as a measured gap.

## Layout

See `docs/ARCHITECTURE.md` for the pipeline and `CLAUDE.md` for the full
project contract and crav​ed decisions. Domain core is pure TypeScript in
`src/domain`; readers in `src/readers`; orchestration in `src/pipeline`.

## Status

Skeleton + documented contracts + TDD test suite (red — implementations pending).
Next: implement the domain to green, wire the StubReader, then the LlmReader.

## License

MIT.
