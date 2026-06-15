import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { ingestCrossref } from "./crossref.js";
import type { CrossrefWork } from "./crossref.js";
import { fetchJsonWithRetry } from "./fetch-retry.js";

/**
 * Harvest utility — the ONLY part of TACET that touches the network. It is a
 * preparation tool, run by hand (`npm run harvest`); it is NEVER imported by
 * the replay path or the tests, so replay stays deterministic and offline.
 *
 * Polite-pool etiquette mirrors VIGILIA's Crossref adapter: a contact mailto in
 * the User-Agent and cursor pagination. The contact e-mail comes from config
 * (TACET_CONTACT_EMAIL), never hardcoded.
 *
 * Flow: page through Crossref → keep only records WITH an abstract → ingest →
 * write the corpus to corpus/<case>.json (which is gitignored: third-party
 * content in bulk is not versioned).
 *
 * Usage: TACET_CONTACT_EMAIL=you@example.org npm run harvest -- covid 50
 */

const API_BASE = "https://api.crossref.org/works";
const PAGE_ROWS = 100;
/** CC-BY 4.0 license URL — the redistributable slice a frozen fixture is allowed
 * to contain. Exported so the step-0 bridge can request it for a freezable case. */
export const CC_BY = "http://creativecommons.org/licenses/by/4.0/";

/**
 * Default query: the COVID-19 ORIGIN debate, not COVID in general. A broad
 * "covid" query dragged in football, oil, and the stock market. These terms aim
 * the corpus at the origin controversy (zoonotic spillover vs. lab-leak), which
 * is the anchor dispute. Crossref's free `query` does a dismax over the terms.
 */
const ORIGIN_QUERY = "sars-cov-2 origin zoonotic spillover lab leak wuhan";

/**
 * The shared reference hypothesis the two readers anchor to (Phase 5c), carried
 * into the corpus so it travels through summarize → read. NOT hardcoded in the
 * reader: it is per-case data. Default is the SARS-CoV-2 origin case in the
 * SAGO formulation (WHO 2025, CC BY-NC-SA 3.0 IGO) — recognizedly inconclusive,
 * so ambiguous evidence can pull the readers apart. Override per case with
 * TACET_REFERENCE_HYPOTHESIS.
 */
const SAGO_ORIGIN_HYPOTHESIS =
  "A origem zoonótica natural por spillover (de animais selvagens, diretamente ou via hospedeiro " +
  "intermediário) é a hipótese atualmente mais sustentada pela evidência científica disponível; " +
  "porém a questão permanece inconclusiva. A hipótese de um acidente laboratorial ou relacionado a " +
  "pesquisa não pode ser descartada nem provada, por falta de dados disponibilizados.";

interface CrossrefPage {
  readonly message: {
    readonly "next-cursor"?: string | null;
    readonly items?: readonly CrossrefWork[];
  };
}

function buildUrl(query: string, cursor: string, rows: number, license: string | null): string {
  const url = new URL(API_BASE);
  url.searchParams.set("query", query);
  // has-abstract is always required; the license clause is optional. The frozen
  // fixture path keeps CC-BY (redistributable); an EXPLORATORY corpus (step-0
  // bridge) relaxes it (license=null) to see the true field, not the CC-BY slice.
  const filter = license === null ? "has-abstract:true" : `has-abstract:true,license.url:${license}`;
  url.searchParams.set("filter", filter);
  url.searchParams.set("rows", String(rows));
  url.searchParams.set("cursor", cursor);
  return url.toString();
}

/** Injectable dependencies for the networked fetch — defaults are the real fetch,
 * a real sleep, and 4 attempts. Tests inject a fetch double and an instant sleep
 * so the retry path is exercised offline; production omits this entirely. */
export interface HarvestDeps {
  readonly fetchFn?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxAttempts?: number;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Page through Crossref for `query`, keeping records WITH an abstract. `license`
 * defaults to CC-BY (the redistributable slice, for the frozen fixture); pass
 * `null` to drop the license clause (exploratory corpus). Each page fetch is
 * retried with backoff (see fetch-retry); a transient Crossref hiccup no longer
 * aborts the harvest. The ONLY network here; never reached by replay or tests
 * (which inject `deps`).
 */
export async function fetchCrossrefWorks(
  query: string,
  limit: number,
  mailto: string,
  license: string | null = CC_BY,
  deps: HarvestDeps = {},
): Promise<readonly CrossrefWork[]> {
  const headers = { "User-Agent": `TACET/0.1 (mailto:${mailto})` };
  const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
  const sleep = deps.sleep ?? realSleep;
  const maxAttempts = deps.maxAttempts ?? 4;
  const collected: CrossrefWork[] = [];
  let cursor = "*";

  while (collected.length < limit) {
    const rows = Math.min(PAGE_ROWS, limit - collected.length);
    // The body parse is INSIDE the retry: a 200 with a non-JSON body (HTML error
    // page / truncated payload under load) is retried, not thrown (A1 debt closed).
    const page = await fetchJsonWithRetry<CrossrefPage>(buildUrl(query, cursor, rows, license), { headers }, { fetchFn, sleep, maxAttempts });
    const items = page.message.items ?? [];
    if (items.length === 0) break;
    // Keep only records WITH an abstract — the rest are filtered at ingestion
    // too, but filtering here saves storage in the corpus file.
    collected.push(...items.filter((w) => typeof w.abstract === "string"));
    const next = page.message["next-cursor"];
    if (!next) break;
    cursor = next;
  }
  return collected.slice(0, limit);
}

async function main(): Promise<void> {
  const mailto = process.env["TACET_CONTACT_EMAIL"];
  if (!mailto) {
    throw new Error("set TACET_CONTACT_EMAIL (Crossref polite pool) — see .env.example");
  }
  const query = process.argv[2] ?? ORIGIN_QUERY;
  const limit = Number(process.argv[3] ?? "50");

  console.log(`harvesting up to ${limit} CC-BY abstracted records for "${query}"…`);
  const works = await fetchCrossrefWorks(query, limit, mailto);
  const { claims, citationGraph } = ingestCrossref(works);
  console.log(`fetched ${works.length} records → ${claims.length} ingested claims`);

  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "corpus";
  const referenceHypothesis = process.env["TACET_REFERENCE_HYPOTHESIS"] ?? SAGO_ORIGIN_HYPOTHESIS;
  const outPath = fileURLToPath(new URL(`../../corpus/${slug}.json`, import.meta.url));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify({ case: `${slug}-harvested`, referenceHypothesis, claims, citationGraph }, null, 2),
  );
  console.log(`wrote corpus → ${outPath} (gitignored)`);
}

// Run only when invoked directly (not when the bridge imports fetchCrossrefWorks).
if (process.argv[1] !== undefined && /harvest\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
