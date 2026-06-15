import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/**
 * Deep-research baseline (FASE C, passo 0). Calls perplexity/sonar-deep-research
 * via OpenRouter ONCE per sub-question and freezes the raw output as a comparison
 * reference. Real cost (~US$0.15–0.50/run) — run once, never in replay.
 *
 * The query is the EXACT referenceHypothesis frozen in each case fixture (not
 * reformulated), so the judge can read the same string from the public fixture.
 *
 * What is frozen is a REPRODUCIBLE REFERENCE POINT, not the SOTA ceiling: the
 * judge should run their own deep-research (any provider) per UPLIFT-PROTOCOL.md.
 * Coherence, not truth.
 *
 * Usage: npm run baseline -- [lhc|eggs|all]
 */

const MODEL = process.env["BASELINE_MODEL"] ?? "perplexity/sonar-deep-research";
const OR = "https://openrouter.ai/api/v1";

const CASES: Readonly<Record<string, string>> = {
  lhc: "lhc-anchored-ingested-v0.1.json",
  eggs: "eggs-cv-v0.1.json",
};

interface ResponseShape {
  readonly choices?: readonly { readonly message?: { readonly content?: string; readonly annotations?: unknown } }[];
  readonly citations?: unknown;
  readonly usage?: unknown;
}

const root = (p: string): string => fileURLToPath(new URL(`../../${p}`, import.meta.url));

async function runOne(caseKey: string, apiKey: string): Promise<void> {
  const fixtureFile = CASES[caseKey];
  if (fixtureFile === undefined) throw new Error(`unknown case '${caseKey}' (expected lhc|eggs)`);
  const fx = JSON.parse(readFileSync(root(`fixtures/replay/${fixtureFile}`), "utf8")) as { referenceHypothesis?: string };
  const query = fx.referenceHypothesis;
  if (query === undefined || query.trim().length === 0) throw new Error(`fixture ${fixtureFile} has no referenceHypothesis`);

  const system = "You are a deep-research assistant. Research the following hypothesis thoroughly and report your findings in prose, citing the sources you rely on.";
  console.log(`[${caseKey}] querying ${MODEL} …`);
  const t0 = Date.now();
  const res = await fetch(`${OR}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, messages: [ { role: "system", content: system }, { role: "user", content: query } ] }),
  });
  const seconds = (Date.now() - t0) / 1000;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as ResponseShape;
  const msg = data.choices?.[0]?.message;
  const prose = msg?.content ?? "";

  const frozen = {
    schema: "tacet/deepresearch-baseline@0.1",
    case: caseKey,
    model: MODEL,
    queriedAt: new Date().toISOString(),
    seconds: Number(seconds.toFixed(1)),
    query,
    prose,
    citations: data.citations ?? msg?.annotations ?? [],
    usage: data.usage ?? null,
    note: "Reproducible REFERENCE POINT, not the SOTA ceiling. Third-party model output captured once for comparison; the judge should run their own deep-research (any provider) per UPLIFT-PROTOCOL.md. Coherence, not truth.",
  };
  const outPath = root(`fixtures/baseline/${caseKey}-deepresearch-v0.1.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(frozen, null, 2) + "\n");
  console.log(`[${caseKey}] froze ${prose.length} chars, ${Array.isArray(frozen.citations) ? frozen.citations.length : 0} citations, ${seconds.toFixed(0)}s → ${outPath}`);
}

async function main(): Promise<void> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) throw new Error("OPENROUTER_API_KEY required (baseline is a paid prep step, run once)");
  const arg = (process.argv[2] ?? "all").toLowerCase();
  const cases = arg === "all" ? Object.keys(CASES) : [arg];
  for (const c of cases) await runOne(c, apiKey);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
