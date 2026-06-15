import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  UPLIFT_RUBRIC,
  extractCitations,
  normalizeCitation,
  verifiability,
  countTacetAbstentions,
  countBaselineUncertainty,
  hiddenDependencySignal,
} from "../domain/uplift-rubric.js";

/**
 * Apply the uplift rubric (FASE C, passo 2). For LHC and eggs it runs the rubric
 * over (TACET coerced narrative + frozen structure) vs (frozen deep-research
 * baseline) and BAKES the comparison — deterministic measurements + the signals +
 * the BLANK judge rubric — into fixtures/comparison/<case>-uplift-v0.1.json.
 *
 * Honest by construction: it reports the raw deterministic numbers without
 * adjectives, NAMES the asymmetry (deep-research reads more), and declares NO
 * winner on the judge axes. Citation resolution is real I/O, done ONCE here and
 * frozen; replay is offline. Coherence, not truth.
 *
 * Usage: npm run compare-uplift -- [lhc|eggs|all]
 */

interface CaseSpec {
  readonly case: string;
  readonly fixture: string;
  /** Author surnames of the out-of-CC-BY ingested sources (provenance of the
   * specific preprints TACET ingested non-redistributably) — auxiliary name signal. */
  readonly outOfCcbyNames: readonly string[];
}

const CASES: Readonly<Record<string, CaseSpec>> = {
  lhc: { case: "lhc", fixture: "lhc-anchored-ingested-v0.1.json", outOfCcbyNames: ["Giddings", "Mangano"] },
  eggs: { case: "eggs", fixture: "eggs-cv-v0.1.json", outOfCcbyNames: [] },
};

const root = (p: string): string => fileURLToPath(new URL(`../../${p}`, import.meta.url));

interface Fixture {
  readonly referenceHypothesis?: string;
  readonly relevanceGate?: { readonly status: string };
  readonly claims: readonly { readonly redistributable?: boolean; readonly provenance: readonly { readonly locator: string }[] }[];
  readonly derived: { readonly convergenceMap: { readonly verdicts: readonly { readonly signal: string }[] }; readonly coverageAudit: { readonly emptyChairs: readonly unknown[]; readonly notMeasured: readonly unknown[] } };
}
interface Baseline { readonly model: string; readonly queriedAt: string; readonly prose: string; readonly citations: unknown }

/** Best-effort real resolution: a citation RESOLVES if the URL exists (2xx/3xx,
 * or an auth/method status that proves existence). 404/DNS/timeout → unresolved.
 * Paywalled-but-present counts as resolved here; the hidden-dependency axis is
 * what captures "resolves but non-verifiable". */
async function resolves(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal });
    return res.ok || [401, 403, 405, 429].includes(res.status);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** REGISTERED resolution (DOI keys only): is the DOI registered in the global DOI
 * system, regardless of whether the publisher landing page still serves HTML?
 * The DOI HANDLE answers this: doi.org emits a redirect (3xx) for a registered DOI
 * and 404 for an unregistered one. We read the handle WITHOUT following to the
 * publisher (redirect:"manual") — so this bypasses publisher link rot AND the
 * Crossref content-negotiation rate limit that throttles batch CSL lookups. */
async function registeredResolves(key: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`https://doi.org/${key.slice(4)}`, { method: "GET", redirect: "manual", signal: ctrl.signal });
    return res.type === "opaqueredirect" || (res.status >= 200 && res.status < 400);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve a citation key (doi:… / arxiv:… / bare host) into a fetchable URL. */
function toUrl(key: string): string {
  if (key.startsWith("doi:")) return `https://doi.org/${key.slice(4)}`;
  if (key.startsWith("arxiv:")) return `https://arxiv.org/abs/${key.slice(6)}`;
  return key.startsWith("http") ? key : `https://${key}`;
}

interface ResolveLayers {
  readonly landing: ReadonlySet<string>;
  readonly registered: ReadonlySet<string>;
  /** keys registered (DOI exists) but whose landing page 404s — link rot. */
  readonly rot: readonly string[];
}

/** Two-layer resolution over a key set: LANDING (the page is reachable) and
 * REGISTERED (the DOI exists in the DOI system; non-DOI keys fall back to landing,
 * having no registration layer). The difference is link rot. */
async function resolveSets(keys: readonly string[]): Promise<ResolveLayers> {
  const landing = await mapPool(keys, 8, (k) => resolves(toUrl(k)));
  const csl = await mapPool(keys, 8, (k) => (k.startsWith("doi:") ? registeredResolves(k) : Promise.resolve(false)));
  const landingSet = new Set(keys.filter((_, i) => landing[i]));
  const registeredSet = new Set(keys.filter((_, i) => (keys[i]?.startsWith("doi:") ? csl[i] : landing[i])));
  const rot = keys.filter((k, i) => k.startsWith("doi:") && csl[i] === true && landing[i] === false);
  return { landing: landingSet, registered: registeredSet, rot };
}

async function mapPool<T, R>(items: readonly T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length) as R[];
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx] as T);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Collect baseline citation strings from BOTH the prose and the structured
 * annotation list (perplexity returns url_citation objects). */
function baselineCitations(b: Baseline): string[] {
  const fromProse = extractCitations(b.prose);
  const fromAnn: string[] = [];
  if (Array.isArray(b.citations)) {
    for (const c of b.citations as { url_citation?: { url?: string }; url?: string }[]) {
      const u = c.url_citation?.url ?? c.url;
      if (typeof u === "string") fromAnn.push(u);
    }
  }
  return [...new Set([...fromProse, ...fromAnn])];
}

async function runOne(spec: CaseSpec): Promise<void> {
  const fx = JSON.parse(readFileSync(root(`fixtures/replay/${spec.fixture}`), "utf8")) as Fixture;
  const baseline = JSON.parse(readFileSync(root(`fixtures/baseline/${spec.case}-deepresearch-v0.1.json`), "utf8")) as Baseline;

  // TACET citations = every claim's provenance locator (the corpus the narrative
  // summarizes); CC-BY DOIs resolve by construction, ingested preprints too.
  const tacetCites = [...new Set(fx.claims.map((c) => c.provenance[0]?.locator ?? "").filter((l) => /^https?:|10\.\d/.test(l)))];
  const baseCites = baselineCitations(baseline);

  // Resolve once, keyed by NORMALIZED citation (what verifiability's predicate
  // sees), in TWO layers: landing (page reachable) and registered (DOI exists).
  const tacetKeys = [...new Set(tacetCites.map(normalizeCitation))];
  const baseKeys = [...new Set(baseCites.map(normalizeCitation))];
  const tacetR = await resolveSets(tacetKeys);
  const baseR = await resolveSets(baseKeys);

  const tally = fx.derived.convergenceMap.verdicts.reduce<Record<string, number>>((a, v) => ((a[v.signal] = (a[v.signal] ?? 0) + 1), a), {});
  const abstentions = countTacetAbstentions({
    unsupported: tally["unsupported"] ?? 0,
    emptyChairs: fx.derived.coverageAudit.emptyChairs.length,
    notMeasured: fx.derived.coverageAudit.notMeasured.length,
    gateStatus: fx.relevanceGate?.status,
  });

  const outOfCcbyIds = fx.claims.filter((c) => c.redistributable === false).map((c) => c.provenance[0]?.locator ?? "");
  const baselineBlob = baseline.prose + " " + baseCites.join(" ");
  const hidden = hiddenDependencySignal(baselineBlob, outOfCcbyIds, spec.outOfCcbyNames);

  const comparison = {
    schema: "tacet/uplift-comparison@0.1",
    case: spec.case,
    query: fx.referenceHypothesis,
    baseline: { model: baseline.model, queriedAt: baseline.queriedAt },
    asymmetry:
      "Deep-research reads everything (paywalled, books, non-CC-BY) WITHOUT verifiable provenance; TACET reads only CC-BY with DOI provenance and honest abstention. On COMPLETENESS, deep-research wins — and this comparison does NOT measure completeness. It measures verifiable fidelity, uncertainty preservation, load-bearing visibility, and hidden-dependency disclosure.",
    measurements: {
      verifiability: {
        tacet: { landing: verifiability(tacetCites, (c) => tacetR.landing.has(c)), registered: verifiability(tacetCites, (c) => tacetR.registered.has(c)) },
        baseline: { landing: verifiability(baseCites, (c) => baseR.landing.has(c)), registered: verifiability(baseCites, (c) => baseR.registered.has(c)) },
        note:
          "TWO layers: 'landing' = the cited page is reachable (<400); 'registered' = the DOI exists in the global DOI system (CSL content-negotiation), bypassing publisher link rot. Non-DOI citations have no registration layer (fall back to landing). " +
          (tacetR.rot.length > 0 ? `TACET landing<registered because these registered DOIs have a rotted landing page: ${tacetR.rot.join(", ")}.` : "No link-rot gap on the TACET side.") +
          (baseR.rot.length > 0 ? ` Baseline rotted DOIs: ${baseR.rot.join(", ")}.` : ""),
      },
      uncertainty: { tacet: abstentions, baseline: countBaselineUncertainty(baseline.prose) },
      hiddenDependency: hidden,
    },
    rubric: UPLIFT_RUBRIC,
    note: "The baseline is a REPRODUCIBLE REFERENCE POINT, not the SOTA ceiling; the judge runs their own per UPLIFT-PROTOCOL.md. Deterministic axes report raw numbers; judge axes are left blank — no winner is declared. Coherence, not truth.",
  };

  const outPath = root(`fixtures/comparison/${spec.case}-uplift-v0.1.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(comparison, null, 2) + "\n");
  const m = comparison.measurements;
  console.log(`[${spec.case}] verifiability TACET landing=${m.verifiability.tacet.landing.fraction}/registered=${m.verifiability.tacet.registered.fraction} baseline landing=${m.verifiability.baseline.landing.fraction}/registered=${m.verifiability.baseline.registered.fraction} | abstentions=${abstentions.total} hedges=${m.uncertainty.baseline.hedges} verdicts=${m.uncertainty.baseline.verdicts} | hidden idMatches=${hidden.idMatches.length} rot=[${tacetR.rot.join(",")}] → ${outPath}`);
}

async function main(): Promise<void> {
  const arg = (process.argv[2] ?? "all").toLowerCase();
  const cases = arg === "all" ? Object.keys(CASES) : [arg];
  for (const c of cases) {
    const spec = CASES[c];
    if (spec === undefined) throw new Error(`unknown case '${c}'`);
    await runOne(spec);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
