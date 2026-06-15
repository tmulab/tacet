# TACET — web app (optional)

This is the **optional** web front-end for TACET (the hosted demo at
**tacet.tmulab.org**). It is an **isolated Next.js project** with its own
`package.json` and `tsconfig` — it does **not** affect the core engine.

**A competition judge does not need this.** To run the model locally, use the
repository root only:

```bash
npm ci && npm run demo:replay     # from the repo root — no frontend involved
```

The root build/test/typecheck never touch this directory; installing the root
does not install Next or React.

## Run the web app (only if you want the visual experience locally)

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

- The pure domain core lives in `../src` and stays framework-free; this app only
  consumes it at the edges (e.g. `app/api/run` imports the E3-AUTH gate from
  `../src/live/gate.ts`).
- The single LLM-spending endpoint, `POST /api/run`, is gated server-side
  (`TACET_LIVE_SECRET`, fail-closed) and is **not** wired to the live pipeline
  yet — it returns an honest 501 rather than a fabricated result.
- The replay/home stay open (they spend no LLM).

On a machine behind a corporate/MITM TLS proxy, prefix install/build with
`NODE_OPTIONS=--use-system-ca` (see the repo's `CLAUDE.md`).
