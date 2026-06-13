import { fetchLLM, readerConfigFromEnv } from "./llm.js";
import type { SummaryLlmConfig } from "./llm.js";

/**
 * Connectivity diagnostic for every LLM endpoint TACET actually uses. Sends a
 * one-word ping to each and reports ok/fail — verifies the key, base URL, and
 * model are accepted before running `npm run summarize` / `npm run read`.
 * Network-only; never on the replay/test path. Run: npm run llm:check
 *
 * Until 5c this only exercised the summarizer (Z.AI / gpt-oss); reader B
 * (MiniMax) and the fallback (Gemma) were never actually pinged. It now probes
 * the SAME three reader endpoints `read.ts` configures, via the same
 * `readerConfigFromEnv` defaults, so a silent reader-B/fallback outage surfaces
 * here instead of masking the measurement mid-run.
 */

const SYSTEM = "You are a helpful assistant.";
const USER = "Bom dia! Responda em uma frase curta.";

async function probe(name: string, base: string, key: string | undefined, model: string): Promise<void> {
  if (key === undefined || key.length === 0) {
    console.log(`\n[${name}] SKIP — no key in env`);
    return;
  }
  console.log(`\n[${name}] ${base}  model=${model}  key=${key.slice(0, 8)}…`);
  const r = await fetchLLM(base, key, model, SYSTEM, USER, { temperature: 0, max_tokens: 64 }, 20_000);
  if (r.ok) console.log(`  OK in ${r.seconds}s  (${r.content.length} chars) -> ${JSON.stringify(r.content.slice(0, 200))}`);
  else console.log(`  FAIL in ${r.seconds}s -> ${r.error}`);
}

/** Probe one reader the way `read.ts` resolves it, or SKIP if no key resolves. */
async function probeReader(name: string, cfg: SummaryLlmConfig | null): Promise<void> {
  if (cfg === null) {
    console.log(`\n[${name}] SKIP — no key in env`);
    return;
  }
  await probe(name, cfg.baseUrl, cfg.apiKey, cfg.model);
}

async function main(): Promise<void> {
  const env = process.env;
  await probe(
    "summary (Z.AI/OpenRouter)",
    env["SUMMARY_BASE"] ?? "https://api.z.ai/api/coding/paas/v4",
    env["SUMMARY_API_KEY"] ?? env["ZAI_API_KEY"],
    env["SUMMARY_MODEL"] ?? "glm-4.6",
  );
  // The three reader endpoints, resolved EXACTLY as read.ts does them.
  await probeReader(
    "reader-A",
    readerConfigFromEnv("READER_A", { base: "https://api.z.ai/api/coding/paas/v4", model: "glm-4.6" }, ["SUMMARY_API_KEY", "ZAI_API_KEY"]),
  );
  await probeReader(
    "reader-B",
    readerConfigFromEnv("READER_B", { base: "https://openrouter.ai/api/v1", model: "minimax/minimax-m2.7" }, ["OPENROUTER_API_KEY"]),
  );
  await probeReader(
    "reader-fallback",
    readerConfigFromEnv("READER_FALLBACK", { base: "https://openrouter.ai/api/v1", model: "google/gemma-4-31b-it:free" }, ["OPENROUTER_API_KEY"]),
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
