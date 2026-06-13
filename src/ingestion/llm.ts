/**
 * Minimal OpenAI-compatible LLM client, mirroring the quantai pattern
 * (src/app/api/duelo/route.ts): a single `fetchLLM` that POSTs to
 * `${baseUrl}/chat/completions` with `Authorization: Bearer <key>`, an
 * AbortController timeout, and usage/seconds capture; plus `extractFirstJSON`
 * that removes <think>…</think> and extracts the first {…} object.
 *
 * This is the ONLY network module besides harvest, and it is reached ONLY by the
 * summarize prep script — never by replay or tests (which inject a transport).
 */

/** Result shape returned by a transport (mirrors quantai's ok/error union). */
export type LlmResult =
  | { readonly ok: true; readonly content: string; readonly seconds: number }
  | { readonly ok: false; readonly error: string; readonly seconds: number };

/** Injectable transport: (systemPrompt, userContent) → result. The default is
 * `fetchLLM` bound to env config; tests inject stubs so they never hit network. */
export type LlmTransport = (systemPrompt: string, userContent: string) => Promise<LlmResult>;

/** Removes thinking blocks some models leak, then extracts the first JSON object
 * (first "{" to last "}"). Returns null if none parses. (quantai pattern.) */
export function extractFirstJSON(text: string): Record<string, unknown> | null {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

interface ChatCompletion {
  readonly choices?: readonly { readonly message?: { readonly content?: string } }[];
}

/** POST one chat completion. Mirrors quantai's fetchLLM (timeout, Bearer auth,
 * seconds). `extraParams` lets the caller pin temperature, etc. */
export async function fetchLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  extraParams: Record<string, unknown> = {},
  timeoutMs = 90_000,
): Promise<LlmResult> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const seconds = (): number => (Date.now() - t0) / 1000;

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        ...extraParams,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}`, seconds: seconds() };
    }
    const data = (await res.json()) as ChatCompletion;
    return { ok: true, content: data.choices?.[0]?.message?.content ?? "", seconds: seconds() };
  } catch (e: unknown) {
    clearTimeout(timer);
    const isTimeout = e instanceof Error && e.name === "AbortError";
    return { ok: false, error: isTimeout ? "timeout" : String(e), seconds: seconds() };
  }
}

export interface SummaryLlmConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

/**
 * Reads the summarizer's LLM config from env. Returns null when no key is set —
 * the prep script then refuses to run, and offline paths are unaffected.
 *
 * Defaults to OpenRouter with a free open-weights model. Point SUMMARY_BASE +
 * SUMMARY_API_KEY at a local/Z.AI endpoint (same OpenAI-compatible shape) to use
 * that instead — selection is purely by env. Key is NEVER in the repo.
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): SummaryLlmConfig | null {
  const apiKey = env["SUMMARY_API_KEY"] ?? env["OPENROUTER_API_KEY"];
  if (!apiKey) return null;
  return {
    baseUrl: env["SUMMARY_BASE"] ?? "https://openrouter.ai/api/v1",
    apiKey,
    model: env["SUMMARY_MODEL"] ?? "openai/gpt-oss-20b:free",
  };
}

/**
 * Resolves one reader's LLM config from env, e.g. prefix "READER_A" reads
 * READER_A_BASE / READER_A_MODEL / READER_A_API_KEY. `fallbackKeys` lets a
 * reader reuse an existing key (e.g. READER_A reuses the Z.AI/summary key).
 * Returns null when no key resolves. Keys are NEVER in the repo.
 */
export function readerConfigFromEnv(
  prefix: string,
  defaults: { readonly base: string; readonly model: string },
  fallbackKeys: readonly string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): SummaryLlmConfig | null {
  const apiKey =
    env[`${prefix}_API_KEY`] ?? fallbackKeys.map((k) => env[k]).find((v) => v !== undefined && v.length > 0);
  if (apiKey === undefined || apiKey.length === 0) return null;
  return {
    baseUrl: env[`${prefix}_BASE`] ?? defaults.base,
    apiKey,
    model: env[`${prefix}_MODEL`] ?? defaults.model,
  };
}
