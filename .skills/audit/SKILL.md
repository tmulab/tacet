# SKILL — Auditing the TACET submission before it ships

## When to use this

Load and follow this skill **before**:
- freezing any fixture (`fixtures/replay/*`, `fixtures/baseline/*`, `fixtures/comparison/*`);
- writing or editing any submission artifact (the spec, `docs/UPLIFT-PROTOCOL.md`, the README);
- the final submission to the FLF Epistemic Case Study Competition.

It exists because of a specific failure we hit and want to never repeat: a
statement entered a submission document that was *true* but **misleading for lack
of the rule that made it interpretable** — a verifiability number reported as
"1.00" without saying that "resolve" means "the URL exists," not "the source is
good," and without flagging that one side's `registered` layer was a fallback,
not a verification. The number was correct; the missing thing was its rule.

So this skill enforces one discipline above all: **a number without its rule
attached is a defect.** Everything below serves that.

## The division of labour (read this first)

There are two kinds of check, and they are NOT interchangeable.

1. **Structured data → the executable auditor** (`scripts/audit-fixtures.ts`).
   Deterministic. Runs against the frozen JSON fixtures. Catches the
   *structurable* form of every error class below. Run it; trust its red/green.

2. **Prose → a human following this document.** Whether the spec's sentence
   *describes* the fixture correctly is a judgment the script cannot make
   (it would require IA-complete prose understanding). Do not pretend the script
   covers prose. After the script is green, a human still reads the prose against
   the fixtures, using the checklist at the end.

The script makes the structured layer impossible to get wrong silently. The human
makes the prose layer honest. Neither replaces the other.

## Running the auditor

```bash
npx tsx scripts/audit-fixtures.ts          # audits ./fixtures
npx tsx scripts/audit-fixtures.ts /path     # audits /path/fixtures
npm run audit                               # wire this into package.json + CI
```

Exit 0 = all invariants hold. Exit 1 = at least one broke; the output names the
fixture, claim, and field. Wire it next to the existing test suite so a broken
invariant fails the build.

## Schema prerequisite (the auditor needs this)

The "number carries its rule" invariants (group 1) require the comparison fixture
to carry the rule as **structured fields**, not free prose. Extend
`tacet/uplift-comparison` so each verifiability side has:

```jsonc
"verifiability": {
  "tacet": {
    "landing":    { "fraction": 0.967 },
    "registered": { "fraction": 1.00 },
    "hasDoiLayer": true,        // TACET resolves real DOIs/arXiv at the handle
    "note": "registered = DOI/arXiv actually resolved at doi.org handle; landing = publisher page reachable; the single landing miss is link rot on a registered DOI (10.34257/...), named here."
  },
  "baseline": {
    "landing":    { "fraction": 1.00 },
    "registered": { "fraction": 1.00 },
    "hasDoiLayer": false,       // 0 DOIs; registered is a FALLBACK to landing, not verification
    "note": "landing 1.00 = all 10 URLs exist, incl. a blog, a YouTube video and Wikipedia; 'resolve' ≠ academic quality (that falls to the judge axes). 0 DOIs, so 'registered' merely mirrors landing — NOT comparable to TACET's registered, which verified 30 academic identifiers."
  }
}
```

`note` is mandatory and non-trivial on both sides. `hasDoiLayer:false` forces the
`registered=landing` fallback to be declared, so "registered 1.00 vs 1.00" can
never be read as parity when it is not.

## The invariant groups (what the auditor enforces, and why)

**Group 1 — the error we hit.** (a) Every source the comparison claims the
baseline cited (`hiddenDependency.idMatches`) must actually appear in the frozen
baseline's citation list — an assertion *about* the baseline made checkable
*against* the baseline. (b) Every verifiability number carries a non-empty `note`
— its rule. (c) The `registered=landing` fallback is declared via `hasDoiLayer`,
never silent.

**Group 2 — non-leakage.** Redacted claims (`redistributable:false`) expose
neither `text` nor `summary`; DOI + sha256 may remain (provenance without
redistribution). This generalizes the existing non-leakage test to a permanent
invariant over all fixtures.

**Group 3 — internal consistency.** (a) `convergenceMap` covers exactly the claim
set. (b) `isEmptyChair` only on `measured` dimensions with `observedSources:0`,
never on `not-measured` — the B3 bug must not return. (c) Every `sourceId` is a
well-formed DOI or arXiv id.

**Group 4 — method discipline.** (a) `run-replay.ts` performs no network I/O —
replay is deterministic and offline; the network lives only in the prep steps
(`baseline-deepresearch`, `compare-uplift`). (b) Judge-method rubric axes ship
with `verdict:null` — TACET declares no winner on the axes a judge must decide.

## The prose checklist (human, after the script is green)

For each number or factual claim in the spec / protocol / README, confirm:

- [ ] It traces to a frozen fixture field. If you cannot point to the field,
      it does not go in. (Memory is not a source.)
- [ ] If it is a number, the sentence states its rule, or points to the `note`
      that does. "Baseline 1.00" alone is forbidden; "landing 1.00 — URLs exist,
      incl. blog/YouTube/Wikipedia; quality falls to the judge axes" is the bar.
- [ ] If it compares TACET and baseline on the same-named metric, it states
      whether they measure the same thing. (`registered` 1.00 vs 1.00 is NOT
      parity — say so.)
- [ ] Claims about what the baseline cited name the citation, and the citation
      exists in the baseline fixture (the script checks idMatches; you check any
      prose source the script can't structurally match — e.g. "a blog").
- [ ] No redacted source's content is paraphrased into the prose from memory.
- [ ] The prose does not crown TACET the winner on a judge axis.
- [ ] PT version does not soften or overclaim relative to EN.

## Worked example — the error this skill was born from

**Statement drafted:** "the baseline cited a blog, a YouTube video, and Wikipedia
… every cited URL resolves (verifiability 1.00)."

**Why it was dangerous:** both facts were *true* (the citations array confirms
backreaction.blogspot.com, a youtube.com watch URL, and en.wikipedia.org; the
landing layer is 10/10). But reported as a bare "1.00" it read as "the baseline's
sources are solid," when "resolve" only means the URL exists. And "registered
1.00" looked comparable to TACET's "registered 1.00" when the baseline has zero
DOIs and TACET verified thirty academic identifiers.

**What the discipline produces instead:** "Baseline LHC verifiability — landing
1.00 (10/10): all URLs exist, including a blog, a YouTube video and Wikipedia;
'resolve' means the URL exists, not that the source is academic — quality falls
to the judge axes. None of the 10 is a DOI, so the 'registered' layer merely
mirrors landing, and is NOT comparable to TACET's registered (30 academic
identifiers actually resolved at the handle)."

**What now catches it automatically:** group-1a verifies the blog/YouTube/Wikipedia
*structurally* (idMatches ⊆ baseline citations); group-1b fails the build if the
number ships without its `note`; group-1c fails if the `registered=landing`
fallback is undeclared. The prose nuance is then the human's last pass.
