/**
 * audit-fixtures.ts — TACET submission auditor
 *
 * Deterministic invariant checker over the FROZEN fixtures. It does NOT read prose
 * (spec / protocol) — prose is verified by a human following SKILL.md. This script
 * audits the STRUCTURED data the prose depends on, and fails (exit 1) if any
 * invariant breaks.
 *
 * Run:  npx tsx scripts/audit-fixtures.ts
 * CI:   npm run audit
 *
 * Each invariant has an id, a human-readable claim, and a check. The output names
 * exactly which fixture / claim / field failed, so a fix is one lookup away.
 *
 * Philosophy: a number without its rule attached is the defect. Several invariants
 * therefore check not "is the number right" (we can't know that here) but "does the
 * number carry, in the fixture, the rule that makes it interpretable" — because the
 * real failure mode we hit was a TRUE number that misled for lack of its rule.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ---------- config: where the fixtures live ----------
const ROOT = process.argv[2] ?? ".";
const DIRS = {
  replay: join(ROOT, "fixtures", "replay"),
  baseline: join(ROOT, "fixtures", "baseline"),
  comparison: join(ROOT, "fixtures", "comparison"),
};
const SRC_REPLAY = join(ROOT, "src", "pipeline", "run-replay.ts");

// ---------- tiny harness ----------
type Result = { id: string; claim: string; ok: boolean; detail?: string };
const results: Result[] = [];
function check(id: string, claim: string, fn: () => string | null) {
  let detail: string | null = null;
  try {
    detail = fn();
  } catch (e) {
    detail = `threw: ${(e as Error).message}`;
  }
  results.push({ id, claim, ok: detail === null, detail: detail ?? undefined });
}
function loadJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}
function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
}

// ---------- load everything once ----------
const replayFiles = listJson(DIRS.replay);
const baselineFiles = listJson(DIRS.baseline);
const comparisonFiles = listJson(DIRS.comparison);

// fixtures/replay/ holds TWO kinds of file: true replay fixtures (schema starts
// with "tacet/replay-fixture") and META-artifacts (anchor-comparison, freud-
// contrast) that carry their OWN schemaName and have no convergenceMap. The
// replay invariants (groups 2-3) are scoped to replay fixtures; the meta-artifacts
// are audited by GROUP 5 against their own contract — never silently skipped.
const replays = new Map<string, any>();
const narratives = new Map<string, any>();
const metas = new Map<string, any>();
const replayByBasename = new Map<string, any>();
for (const f of replayFiles) {
  const j = loadJson(f);
  const base = f.split(/[\\/]/).pop() ?? f;
  replayByBasename.set(base, j);
  // Key replay fixtures by BASENAME, never j.case: two fixtures can share a case
  // (sago-origin v0.1 and v0.2 both case "sago-origin"); keying by case let one
  // silently overwrite the other in the map and skipped its audit entirely.
  if (typeof j.schema === "string" && j.schema.startsWith("tacet/replay-fixture")) replays.set(base, j);
  else if (j.schema === "tacet/narrative@0.1") narratives.set(base, j);
  else metas.set(base, j);
}
const baselines = new Map<string, any>();
for (const f of baselineFiles) {
  const j = loadJson(f);
  baselines.set(j.case ?? f, j);
}
const comparisons = new Map<string, any>();
for (const f of comparisonFiles) {
  const j = loadJson(f);
  comparisons.set(j.case ?? f, j);
}

// =====================================================================
// GROUP 1 — the error we actually hit: claims about the baseline must
//           trace to the frozen baseline, and numbers must carry their rule.
// =====================================================================

// 1a. Every source the comparison says the baseline cited (hiddenDependency.idMatches)
//     must actually appear in the frozen baseline's citation list. This is the
//     structural form of "blog/YouTube/Wikipedia" — an assertion ABOUT the baseline
//     that is checkable AGAINST the baseline.
for (const [caseId, cmp] of comparisons) {
  check(
    `1a/${caseId}`,
    "comparison.hiddenDependency.idMatches ⊆ baseline citations",
    () => {
      const idMatches: string[] = cmp?.measurements?.hiddenDependency?.idMatches ?? [];
      if (idMatches.length === 0) return null; // nothing claimed, nothing to verify
      const baseline = baselines.get(caseId);
      if (!baseline)
        return `comparison for "${caseId}" claims idMatches ${JSON.stringify(idMatches)} but no baseline fixture for "${caseId}" exists to verify against`;
      const cited: string[] = (baseline.citations ?? [])
        .map((c: any) => c?.url_citation?.url ?? "")
        .join(" | ")
        .toLowerCase();
      const missing = idMatches.filter((id) => {
        // normalize arxiv:NNNN.NNNN → match the numeric id anywhere in the cited URLs
        const num = id.replace(/^arxiv:/i, "").replace(/^10\.48550\/arxiv\./i, "");
        return !cited.includes(num.toLowerCase());
      });
      return missing.length
        ? `comparison claims baseline cited ${JSON.stringify(missing)} but these do not appear in baseline citations`
        : null;
    }
  );
}

// 1b. Every verifiability number in the comparison must carry a `note` (its rule).
//     A number without its rule is the defect. We do not check the number's value;
//     we check that the rule that makes it interpretable is attached to the fixture.
for (const [caseId, cmp] of comparisons) {
  check(
    `1b/${caseId}`,
    "verifiability.{tacet,baseline} each carry a non-empty note (the interpretive rule)",
    () => {
      const v = cmp?.measurements?.verifiability;
      if (!v) return `no verifiability block in comparison "${caseId}"`;
      const probs: string[] = [];
      for (const side of ["tacet", "baseline"]) {
        const note = v[side]?.note;
        if (!note || String(note).trim().length < 10)
          probs.push(`${side}.note missing/too short — the number has no rule attached`);
      }
      return probs.length ? probs.join("; ") : null;
    }
  );
}

// 1c. The registered=landing fallback must be DECLARED, not silent.
//     If a side has zero DOIs, its `registered` is a fallback to landing, not a
//     verification — and the fixture must say so (hasDoiLayer:false), so "registered
//     1.00 vs 1.00" is never read as false parity.
for (const [caseId, cmp] of comparisons) {
  check(
    `1c/${caseId}`,
    "registered layer declares whether it is real DOI verification or a landing fallback",
    () => {
      const v = cmp?.measurements?.verifiability;
      if (!v) return `no verifiability block in comparison "${caseId}"`;
      const probs: string[] = [];
      for (const side of ["tacet", "baseline"]) {
        const s = v[side];
        if (!s) continue;
        if (typeof s.hasDoiLayer !== "boolean")
          probs.push(`${side}.hasDoiLayer absent — cannot tell if registered is verification or fallback`);
        // if no DOI layer, registered should equal landing (fallback), and that must be explicit
        if (s.hasDoiLayer === false && s.registered?.fraction !== s.landing?.fraction)
          probs.push(`${side} has no DOI layer but registered≠landing — fallback is inconsistent`);
      }
      return probs.length ? probs.join("; ") : null;
    }
  );
}

// =====================================================================
// GROUP 2 — non-leakage: redacted claims never expose text or summary.
// =====================================================================
for (const [caseId, rep] of replays) {
  check(
    `2/${caseId}`,
    "redactable claims (redistributable:false) expose neither text nor summary",
    () => {
      const claims = rep.claims ?? [];
      const leaks: string[] = [];
      const REDACTED = "[non-redistributable source";
      for (const c of claims) {
        if (c.redistributable === false) {
          if (!String(c.text ?? "").startsWith(REDACTED))
            leaks.push(`${c.id}: text not redacted`);
          for (const p of c.provenance ?? []) {
            if (!String(p.summary ?? "").startsWith(REDACTED))
              leaks.push(`${c.id}: provenance summary not redacted`);
            // DOI + sha256 are allowed to remain (provenance without redistribution)
          }
        }
      }
      return leaks.length ? leaks.join("; ") : null;
    }
  );
}

// =====================================================================
// GROUP 3 — internal consistency of the structured artifacts.
// =====================================================================

// 3a. convergenceMap covers exactly the claim set.
for (const [caseId, rep] of replays) {
  check(`3a/${caseId}`, "convergenceMap verdicts cover exactly the claims array", () => {
    const claimIds = new Set((rep.claims ?? []).map((c: any) => c.id));
    const verdicts = rep?.derived?.convergenceMap?.verdicts ?? [];
    const verdictIds = new Set(verdicts.map((v: any) => v.claimId));
    if (claimIds.size !== verdictIds.size)
      return `claims=${claimIds.size} but convergence verdicts=${verdictIds.size}`;
    for (const id of claimIds)
      if (!verdictIds.has(id)) return `claim ${id} has no convergence verdict`;
    return null;
  });
}

// 3b. empty chairs only on MEASURED dimensions with zero observed sources;
//     never on not-measured (the B3 bug must not return).
for (const [caseId, rep] of replays) {
  check(
    `3b/${caseId}`,
    "isEmptyChair only where measurability=measured AND observedSources=0",
    () => {
      const findings = rep?.derived?.coverageAudit?.findings ?? [];
      const bad: string[] = [];
      for (const f of findings) {
        if (f.isEmptyChair === true) {
          if (f.measurability !== "measured")
            bad.push(`${f.dimension}=${f.value}: empty chair on '${f.measurability}' dim`);
          if (f.observedSources !== 0)
            bad.push(`${f.dimension}=${f.value}: empty chair but observedSources=${f.observedSources}`);
        }
        if (f.measurability === "not-measured" && f.isEmptyChair === true)
          bad.push(`${f.dimension}=${f.value}: not-measured dim flagged as empty chair`);
      }
      return bad.length ? bad.join("; ") : null;
    }
  );
}

// 3c. every claim's sourceId is a well-formed DOI or arXiv id.
for (const [caseId, rep] of replays) {
  check(`3c/${caseId}`, "every provenance sourceId is a well-formed DOI/arXiv id", () => {
    const DOI = /^10\.\d{4,9}\//;
    const ARXIV = /^(10\.48550\/arxiv\.)?\d{4}\.\d{4,5}/i;
    const bad: string[] = [];
    for (const c of rep.claims ?? [])
      for (const p of c.provenance ?? []) {
        const sid = String(p.sourceId ?? "");
        if (!DOI.test(sid) && !ARXIV.test(sid)) bad.push(`${c.id}: bad sourceId "${sid}"`);
      }
    return bad.length ? bad.join("; ") : null;
  });
}

// =====================================================================
// GROUP 4 — method discipline: replay is offline; judge axes blank.
// =====================================================================

// 4a. run-replay.ts contains no network call.
check("4a", "run-replay.ts performs no network I/O (offline replay)", () => {
  if (!existsSync(SRC_REPLAY)) return `cannot find ${SRC_REPLAY} to verify`;
  const src = readFileSync(SRC_REPLAY, "utf8");
  const hits = ["fetch(", "http://", "https://", "resolveSets", "axios", "got("].filter((p) =>
    src.includes(p)
  );
  return hits.length ? `replay references network: ${hits.join(", ")}` : null;
});

// 4b. judge axes ship blank — TACET declares no winner.
for (const [caseId, cmp] of comparisons) {
  check(`4b/${caseId}`, "judge-method rubric axes ship with verdict=null (no self-coronation)", () => {
    const dims = cmp?.rubric?.dimensions ?? [];
    const bad: string[] = [];
    for (const d of dims)
      if (String(d.method).startsWith("judge") && d.judge && d.judge.verdict !== null)
        bad.push(`axis '${d.key}' has a non-null judge verdict`);
    return bad.length ? bad.join("; ") : null;
  });
}

// =====================================================================
// GROUP 5 — meta-artifacts (non-replay schemas that live in fixtures/replay/).
//           Scoped OUT of groups 2-3 above, they are audited HERE by their own
//           schema contract so nothing is swept under the rug. An UNRECOGNIZED
//           meta schema is a failure, not a silent pass.
// =====================================================================
const ANCHOR_CATEGORIES = [
  "anchor-robust-same",
  "anchor-dependent-flip",
  "anchor-decided",
  "anchor-jointly-undecided",
];

// anchor-comparison@0.1 (generated by compare-anchors): a `categories` count map
// over the 4 categories + a `claims` array of {claimId, leanA, leanB, category}
// for the claims judged in BOTH source regimes. Contract (from the generator +
// anchor-comparison.test): rows well-formed; category ∈ the 4; counts == row
// tally; no duplicate claimId; and NO ORPHAN — every claimId is judged in both
// source maps (caseA, caseB), resolved by basename so the check is portable.
function auditAnchorComparison(j: any): string | null {
  const probs: string[] = [];
  for (const k of ["caseA", "caseB", "categories", "claims"]) if (j[k] === undefined) probs.push(`missing ${k}`);
  const claims: any[] = j.claims ?? [];
  for (const c of claims) {
    if (!c.claimId) probs.push(`a row has empty claimId`);
    if (!c.leanA || !c.leanB) probs.push(`${c.claimId}: missing leanA/leanB`);
    if (!ANCHOR_CATEGORIES.includes(c.category)) probs.push(`${c.claimId}: category '${c.category}' not one of the 4`);
  }
  const ids: string[] = claims.map((c) => c.claimId);
  if (new Set(ids).size !== ids.length) probs.push(`duplicate claimId rows`);
  const tally: Record<string, number> = {};
  for (const c of claims) tally[c.category] = (tally[c.category] ?? 0) + 1;
  for (const cat of ANCHOR_CATEGORIES)
    if ((j.categories?.[cat] ?? 0) !== (tally[cat] ?? 0))
      probs.push(`categories.${cat}=${j.categories?.[cat]} but ${tally[cat] ?? 0} rows`);
  // no orphan: each row must be judged in BOTH source convergence maps.
  for (const side of ["caseA", "caseB"]) {
    const base = String(j[side] ?? "").split(/[\\/]/).pop() ?? "";
    const src = replayByBasename.get(base);
    if (!src) {
      probs.push(`cannot resolve ${side} (${base}) to verify orphans`);
      continue;
    }
    const srcIds = new Set((src.derived?.convergenceMap?.verdicts ?? []).map((v: any) => v.claimId));
    const orphans = ids.filter((id) => !srcIds.has(id));
    if (orphans.length) probs.push(`${orphans.length} claimId(s) absent from ${side}: ${orphans.slice(0, 3).join(", ")}${orphans.length > 3 ? "…" : ""}`);
  }
  return probs.length ? probs.join("; ") : null;
}

// freud-contrast@0.1 (B3): derived vs focused regimes + a NAMED difference. It is
// explicitly recognized as a meta-artifact and audited here (it must NOT pass by
// merely lacking a claims field). Contract (from replay-fixture-freud.test): both
// sides carry a relevanceGate.status and a numeric structure; difference names
// nature/derived/focused/proves.
function auditFreudContrast(j: any): string | null {
  const probs: string[] = [];
  for (const k of ["derived", "focused", "difference"]) if (j[k] === undefined) probs.push(`missing ${k}`);
  for (const side of ["derived", "focused"]) {
    const s = j[side] ?? {};
    if (typeof s.relevanceGate?.status !== "string" || !s.relevanceGate.status) probs.push(`${side}.relevanceGate.status missing`);
    for (const f of ["robustCore", "liveCrux", "unsupported"]) if (typeof s.structure?.[f] !== "number") probs.push(`${side}.structure.${f} not numeric`);
  }
  const d = j.difference ?? {};
  for (const f of ["nature", "derived", "focused", "proves"]) if (typeof d[f] !== "string" || d[f].trim().length < 5) probs.push(`difference.${f} missing/too short`);
  return probs.length ? probs.join("; ") : null;
}

// narrative@0.1 (B4 coerced narrative): prose coerced by the deterministic
// skeleton, both fidelity guards green at freeze. Contract (from narrate.ts +
// narrative-frozen.test): non-empty prose declaring the limit; a non-empty
// skeleton; a banned list; and BOTH frozen guards pass. (The vitest test
// RE-VERIFIES the guards against the skeleton; the auditor checks the frozen
// structured result is green and complete.)
function auditNarrative(j: any): string | null {
  const probs: string[] = [];
  if (typeof j.prose !== "string" || j.prose.trim().length === 0) probs.push(`prose missing/empty`);
  else if (!/coherence,\s*not\s*truth/i.test(j.prose)) probs.push(`prose does not declare the limit ("coherence, not truth")`);
  if (!Array.isArray(j.skeleton) || j.skeleton.length === 0) probs.push(`skeleton missing/empty`);
  if (!Array.isArray(j.banned)) probs.push(`banned list missing`);
  if (typeof j.fixture !== "string" || j.fixture.length === 0) probs.push(`fixture pointer missing`);
  const g = j.guards;
  if (!g) probs.push(`guards missing`);
  else {
    if (g.pass !== true) probs.push(`guards.pass is not true`);
    if (g.numericFidelity?.pass !== true) probs.push(`numeric-fidelity guard not green`);
    if (g.thematic?.pass !== true) probs.push(`thematic guard not green`);
  }
  return probs.length ? probs.join("; ") : null;
}

for (const [base, j] of metas) {
  const sid = j.schema ?? j.schemaName;
  check(`5/${base}`, `meta-comparison audited by its own schema contract (${sid ?? "no schema id"})`, () => {
    switch (sid) {
      case "tacet/anchor-comparison@0.1":
        return auditAnchorComparison(j);
      case "tacet/freud-contrast@0.1":
        return auditFreudContrast(j);
      default:
        return `unrecognized meta-artifact schema '${sid ?? "(none)"}' in fixtures/replay — add a Group-5/6 rule or move it out of the replay dir`;
    }
  });
}

// =====================================================================
// GROUP 6 — coerced narratives (B4, schema tacet/narrative@0.1). Separated from
//           the meta-comparisons (group 5) so the report distinguishes a derived-
//           vs-focused/anchor comparison from a structure-coerced narration.
// =====================================================================
for (const [base, j] of narratives) {
  check(`6/${base}`, "coerced narrative: prose coerced by the skeleton, both fidelity guards green", () => auditNarrative(j));
}

// =====================================================================
// report
// =====================================================================
const failed = results.filter((r) => !r.ok);
const passed = results.filter((r) => r.ok);
console.log(`\nTACET fixture audit — ${results.length} invariants\n`);
for (const r of results) {
  const mark = r.ok ? "  ok " : "FAIL ";
  console.log(`${mark} [${r.id}] ${r.claim}`);
  if (!r.ok) console.log(`        ↳ ${r.detail}`);
}
console.log(`\n${passed.length} passed, ${failed.length} failed.\n`);
process.exit(failed.length ? 1 : 0);
