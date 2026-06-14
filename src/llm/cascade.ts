/**
 * cascade.ts — a transport-injected, framework-free fallback cascade.
 *
 * Try an ordered list of models until one returns a usable response. Per model:
 * retry on HTTP 429 with exponential backoff; give up immediately on a
 * non-retryable error (404/400/403/timeout); optionally gate the response
 * through a `validate` predicate so a 200 that is empty or unparseable counts
 * as a failure and falls through to the next model.
 *
 * Pure and dependency-free by design (no fetch, no env, no domain types): the
 * NETWORK lives in the injected `ModelTransport`, so tests drive it with stubs
 * and it can be lifted into its own package later. The TACET reader's
 * independence rule (mutually-distinct companies across slots) is built ON this
 * core in `slots.ts`; this file knows nothing about it.
 */

/** A model the cascade can try. `company` defaults to the id prefix (before the
 * first "/"), which is what `slots.ts` uses to keep readers independent. */
export interface ModelSpec {
  readonly id: string;
  readonly base: string;
  readonly company?: string;
  readonly reasoning?: boolean;
}

/** One transport call's outcome. `status` lets the cascade tell a retryable 429
 * from a fatal 404; `content` is present on success. */
export interface AttemptResult {
  readonly ok: boolean;
  readonly content?: string;
  readonly seconds: number;
  readonly status?: number;
  readonly error?: string;
}

/** Injected network boundary: (model, system, user) → one attempt's result. */
export type ModelTransport = (model: ModelSpec, system: string, user: string) => Promise<AttemptResult>;

export interface CascadeOptions {
  /** Max RETRIES (beyond the first try) on HTTP 429, per model. Default 3. */
  readonly retries?: number;
  /** Backoff per retry, ms. Default [1000, 2000, 4000]; last value repeats. */
  readonly backoffMs?: readonly number[];
  /** Optional semantic gate: a 200 whose content fails this is a failure and the
   * cascade moves on (e.g. "parses to a valid lean", "has summaryText"). */
  readonly validate?: (content: string) => boolean;
}

/** The result of trying ONE model (after its retries). */
export interface ModelOutcome {
  readonly ok: boolean;
  readonly content: string;
  readonly model: string;
  readonly seconds: number;
  readonly attempts: number;
  readonly error?: string;
}

/** The company a spec belongs to — explicit override, else the id prefix. */
export function companyOf(m: ModelSpec): string {
  if (m.company !== undefined && m.company.length > 0) return m.company;
  const slash = m.id.indexOf("/");
  return slash === -1 ? m.id : m.id.slice(0, slash);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Try a SINGLE model: success on the first ok+valid response; retry only on 429
 * (with backoff) up to `retries`; stop immediately on any other failure or on a
 * validate() rejection (temperature 0 makes a re-roll pointless).
 */
export async function tryModel(
  model: ModelSpec,
  transport: ModelTransport,
  system: string,
  user: string,
  opts: CascadeOptions = {},
): Promise<ModelOutcome> {
  const retries = opts.retries ?? 3;
  const backoff = opts.backoffMs ?? [1000, 2000, 4000];
  let attempts = 0;
  let lastError = "no attempt";
  let lastSeconds = 0;

  for (let i = 0; i <= retries; i++) {
    attempts += 1;
    const r = await transport(model, system, user);
    lastSeconds = r.seconds;
    if (r.ok) {
      const content = r.content ?? "";
      if (opts.validate === undefined || opts.validate(content)) {
        return { ok: true, content, model: model.id, seconds: r.seconds, attempts };
      }
      return { ok: false, content, model: model.id, seconds: r.seconds, attempts, error: "validation-failed" };
    }
    lastError = r.error ?? `HTTP ${r.status ?? 0}`;
    if (r.status === 429 && i < retries) {
      await sleep(backoff[Math.min(i, backoff.length - 1)] ?? 0);
      continue;
    }
    break; // non-retryable → give up on this model
  }
  return { ok: false, content: "", model: model.id, seconds: lastSeconds, attempts, error: lastError };
}

/**
 * An ordered cascade: the first model whose attempt succeeds wins; later models
 * are never called. Returns the last failure outcome if all are exhausted.
 */
export class Cascade {
  constructor(
    private readonly models: readonly ModelSpec[],
    private readonly transport: ModelTransport,
    private readonly opts: CascadeOptions = {},
  ) {
    if (models.length === 0) throw new Error("Cascade: needs at least one model");
  }

  async run(system: string, user: string): Promise<ModelOutcome> {
    let last: ModelOutcome | null = null;
    for (const model of this.models) {
      const outcome = await tryModel(model, this.transport, system, user, this.opts);
      if (outcome.ok) return outcome;
      last = outcome;
    }
    return last ?? { ok: false, content: "", model: "", seconds: 0, attempts: 0, error: "no models" };
  }
}
