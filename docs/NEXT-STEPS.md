# Next steps (for Claude Code)

State: skeleton + documented contracts + TDD tests in RED (implementations pending).

## Implementation order (TDD-first, Akita)
1. **buildConvergenceMap** (`src/domain/convergence.ts`) — make the 6 tests in
   `tests/convergence.test.ts` pass (RED→GREEN). Do not touch the tests.
2. **shouldAbstain** — write the tests first, then implement.
3. **auditCoverage** (`src/domain/coverage.ts`) — tests first (empty chair,
   cited baseline, descriptive-not-conclusive), then implement.
4. **ReliabilityProfile builder** — assemble the 4 axes from claims +
   convergence map + provenance graph; graceful degradation per axis.
5. **StubReader** (`src/readers/`) — deterministic reader from a fixture.
6. **Pipeline** (`src/pipeline/run-replay.ts`) — orchestrates ingest→2 readers→
   map→audit→profile over `fixtures/`. Target: clean clone → runs in ~5 min.
7. **Fixtures** — a curated set of ~20–30 claims from the COVID case, with provenance.
8. **LlmReader** — only after replay is green. Prompt behind the Reader interface.
9. **Temporal layer** (descriptive output over the map) + **Next UI** (the edge).

## Invariants (from CLAUDE.md — non-negotiable)
- TDD-first; strict throughout; OO in the core, functional at the edge.
- UNDECIDED readers; they certify coherence, never truth.
- Profile = 4 juxtaposed axes, never fused; graceful degradation.
- Time = metadata in the output, never a criterion in the judgment.
- No credentials / production data / raw corpus in the repo.
