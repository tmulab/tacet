/**
 * openrouter.ts — the TACET binding for the pure cascade core.
 *
 * This is the ONE file in `src/llm/` that is NOT framework-free: it wires the
 * `ModelTransport` to `fetchLLM` (network) and carries the project's ranked free
 * model list. `cascade.ts` / `slots.ts` stay pure and extractable; this glue
 * stays here.
 *
 * The queue order is the result of `bench/free-model-bench.mjs` over the REAL
 * reader prompt (gold = the lean both production readers agreed on). Dead ids
 * (404 on OpenRouter) are intentionally absent.
 */

import { fetchLLM } from "../ingestion/llm.js";
import type { AttemptResult, ModelSpec, ModelTransport } from "./cascade.js";

const OR = "https://openrouter.ai/api/v1";

/** Ranked free OpenRouter models. `company` keeps the readers independent;
 * `reasoning` bumps the token budget so chain-of-thought doesn't eat the JSON. */
export const FREE_MODELS: readonly ModelSpec[] = [
  { id: "nvidia/nemotron-3-nano-30b-a3b:free", base: OR, company: "nvidia" },
  { id: "openai/gpt-oss-120b:free", base: OR, company: "openai" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", base: OR, company: "nvidia", reasoning: true },
  { id: "poolside/laguna-m.1:free", base: OR, company: "poolside" },
  { id: "google/gemma-4-26b-a4b-it:free", base: OR, company: "google" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", base: OR, company: "meta-llama" },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free", base: OR, company: "qwen" },
  { id: "qwen/qwen3-coder:free", base: OR, company: "qwen" },
];

/** A `ModelTransport` over `fetchLLM`: reasoning models get 4096 tokens, others
 * 2048. The HTTP status is recovered from fetchLLM's error string so the cascade
 * can tell a retryable 429 from a fatal 404. */
export function openRouterTransport(apiKey: string): ModelTransport {
  return async (model, system, user): Promise<AttemptResult> => {
    const maxTokens = model.reasoning === true ? 4096 : 2048;
    const r = await fetchLLM(model.base, apiKey, model.id, system, user, { temperature: 0, max_tokens: maxTokens });
    if (r.ok) return { ok: true, content: r.content, seconds: r.seconds };
    const m = /^HTTP (\d+)/.exec(r.error);
    return m ? { ok: false, seconds: r.seconds, error: r.error, status: Number(m[1]) } : { ok: false, seconds: r.seconds, error: r.error };
  };
}

/** The spec for an id: the known FREE_MODELS entry when recognized (so company /
 * reasoning come along), else a constructed spec whose company is the id prefix.
 * A custom base overrides. */
export function specFor(id: string, base: string = OR): ModelSpec {
  const known = FREE_MODELS.find((m) => m.id === id);
  if (known !== undefined) return base === known.base ? known : { ...known, base };
  const slash = id.indexOf("/");
  return { id, base, company: slash === -1 ? id : id.slice(0, slash) };
}

export interface ResolvedSlots {
  readonly a: ModelSpec;
  readonly b: ModelSpec;
  /** The reserve pool, ordered: C (the chosen reserve) first, then every other
   * FREE_MODEL not already picked as A/B/C. "What's left over becomes fallback." */
  readonly pool: readonly ModelSpec[];
}

/**
 * Resolve the two reader slots A and B and the reserve pool from env. The user
 * selects A (READER_A_MODEL), B (READER_B_MODEL) and C (READER_FALLBACK_MODEL) —
 * which must be mutually distinct by company (enforced later by DistinctReaders);
 * everything else in FREE_MODELS becomes the tail of the pool.
 */
export function resolveReaderSlots(env: NodeJS.ProcessEnv = process.env): ResolvedSlots {
  const a = specFor(env["READER_A_MODEL"] ?? "nvidia/nemotron-3-nano-30b-a3b:free", env["READER_A_BASE"] ?? OR);
  const b = specFor(env["READER_B_MODEL"] ?? "openai/gpt-oss-120b:free", env["READER_B_BASE"] ?? OR);
  const c = specFor(env["READER_FALLBACK_MODEL"] ?? "google/gemma-4-26b-a4b-it:free", env["READER_FALLBACK_BASE"] ?? OR);
  const taken = new Set([a.id, b.id, c.id]);
  const rest = FREE_MODELS.filter((m) => !taken.has(m.id));
  return { a, b, pool: [c, ...rest] };
}
