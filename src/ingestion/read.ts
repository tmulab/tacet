import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { Claim, Lean, ReaderJudgement } from "../domain/types.js";
import { fetchLLM, readerConfigFromEnv } from "./llm.js";
import type { LlmTransport, SummaryLlmConfig } from "./llm.js";
import { LlmReader } from "../readers/llm-reader.js";

/**
 * Reader prep script (Phase 5b). Runs TWO independent LlmReaders (different
 * companies) over the SAME summarized corpus and saves each reader's leans into
 * the corpus. Replay then reads the saved leans offline — the only LLM-touching
 * path here. Mirrors the 5a summarize prep.
 *
 * Reader A defaults to GLM (Z.AI), reader B to MiniMax (via OpenRouter). A THIRD
 * reader (Gemma, via OpenRouter) is a FALLBACK only: it runs solely to fill a
 * slot whose primary FAILED on a claim (technical error), so the claim recovers
 * two leans and contestation stays measurable. The fallback is NEVER a
 * tiebreaker — it does not arbitrate genuine A-vs-B disagreement; that crux
 * stands. Each saved lean records the MODEL that produced it (readerModel), so a
 * mixed pair (e.g. GLM-vs-Gemma) is auditable.
 *
 * Configurable by env (READER_A_ / READER_B_ / READER_FALLBACK_ vars); keys only
 * in .env. temperature 0.
 *
 * Usage: npm run read -- corpus/<corpus>.summarized.json
 */

interface Corpus {
  readonly case: string;
  readonly claims: readonly Claim[];
  readonly citationGraph?: Readonly<Record<string, readonly string[]>>;
  /** The SHARED reference hypothesis both readers are anchored to (Phase 5c).
   * Per-case, carried by the corpus — NOT hardcoded here, so it varies by case. */
  readonly referenceHypothesis?: string;
}

/** A saved lean carries the producing model, for auditability. */
interface SavedLean {
  readonly lean: Lean;
  readonly model: string;
}

function transportFor(cfg: SummaryLlmConfig): LlmTransport {
  // max_tokens 1024 (was 512): reader B (M2.7) was truncating (~30% finish:length)
  // at 512, which silently dropped its lean and masked the measurement.
  return (system, user) =>
    fetchLLM(cfg.baseUrl, cfg.apiKey, cfg.model, system, user, { temperature: 0, max_tokens: 1024 });
}

/** Re-stamp a fallback judgement onto the slot it is filling (keep its model). */
function reslot(judgement: ReaderJudgement, slot: string): ReaderJudgement {
  return { ...judgement, readerId: slot };
}

/**
 * Produce the two slot leans for one claim. Each primary judges; if a primary
 * FAILS (returns null), the fallback tries to fill that slot.
 *
 * The fallback fills AT MOST ONE slot per claim (it judges at most once). When
 * BOTH primaries fail we deliberately do NOT fill both slots with the fallback:
 * one model at temperature 0 "agreeing" with itself is an artefactual
 * convergence, not two independent doubts. Instead we degrade to one reader
 * (fill one slot, leave the other null) — exactly how a genuine one-reader claim
 * already behaves, so contestation reports not-measured. `bothPrimariesFailed`
 * is surfaced so the run can count it.
 */
export async function readWithFallback(
  claim: Claim,
  readerA: LlmReader,
  readerB: LlmReader,
  fallback: LlmReader,
): Promise<{
  slotA: ReaderJudgement | null;
  slotB: ReaderJudgement | null;
  fallbackInvoked: boolean;
  bothPrimariesFailed: boolean;
}> {
  let slotA = await readerA.judge(claim);
  let slotB = await readerB.judge(claim);
  const bothPrimariesFailed = slotA === null && slotB === null;
  let fallbackInvoked = false;

  // At most ONE fallback judge() per claim: fill slot A if it failed, otherwise
  // slot B. The `else if` is what guards against Gemma-vs-Gemma when both fail.
  if (slotA === null) {
    fallbackInvoked = true;
    const f = await fallback.judge(claim);
    slotA = f === null ? null : reslot(f, readerA.id);
  } else if (slotB === null) {
    fallbackInvoked = true;
    const f = await fallback.judge(claim);
    slotB = f === null ? null : reslot(f, readerB.id);
  }
  return { slotA, slotB, fallbackInvoked, bothPrimariesFailed };
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === undefined) throw new Error("usage: npm run read -- <corpus.summarized.json>");

  const a = readerConfigFromEnv(
    "READER_A",
    { base: "https://api.z.ai/api/coding/paas/v4", model: "glm-4.6" },
    ["SUMMARY_API_KEY", "ZAI_API_KEY"],
  );
  const b = readerConfigFromEnv(
    "READER_B",
    { base: "https://openrouter.ai/api/v1", model: "minimax/minimax-m2.7" },
    ["OPENROUTER_API_KEY"],
  );
  const fb = readerConfigFromEnv(
    "READER_FALLBACK",
    { base: "https://openrouter.ai/api/v1", model: "google/gemma-4-31b-it:free" },
    ["OPENROUTER_API_KEY"],
  );
  if (a === null || b === null || fb === null) {
    throw new Error("set READER_A / READER_B / READER_FALLBACK keys to read (see .env.example)");
  }

  const inPath = isAbsolute(arg) ? arg : resolve(process.cwd(), arg);
  const corpus = JSON.parse(readFileSync(inPath, "utf8")) as Corpus;

  // The shared anchor both readers read against. Without it there is no honest
  // lean to emit (5b's flat-convergence cause), so we refuse rather than guess.
  const hyp = corpus.referenceHypothesis;
  if (hyp === undefined || hyp.trim().length === 0) {
    throw new Error(
      `corpus '${corpus.case}' has no referenceHypothesis — re-harvest with one set ` +
        `(TACET_REFERENCE_HYPOTHESIS) so both readers can anchor to it`,
    );
  }

  const readerA = new LlmReader("reader-a", transportFor(a), a.model, hyp);
  const readerB = new LlmReader("reader-b", transportFor(b), b.model, hyp);
  const fallback = new LlmReader("reader-fallback", transportFor(fb), fb.model, hyp);

  const readersA: Record<string, SavedLean> = {};
  const readersB: Record<string, SavedLean> = {};
  let twoPrimaries = 0;
  let fallbackUsed = 0;
  let oneReader = 0;
  let dropped = 0;
  let bothFailed = 0;

  console.log(`reading ${corpus.claims.length} claims — A=${a.model}  B=${b.model}  fallback=${fb.model}…`);
  let done = 0;
  for (const claim of corpus.claims) {
    const { slotA, slotB, bothPrimariesFailed } = await readWithFallback(claim, readerA, readerB, fallback);
    if (bothPrimariesFailed) bothFailed += 1;
    if (slotA !== null) readersA[claim.id] = { lean: slotA.lean, model: slotA.readerModel };
    if (slotB !== null) readersB[claim.id] = { lean: slotB.lean, model: slotB.readerModel };

    const usedFb = slotA?.readerModel === fb.model || slotB?.readerModel === fb.model;
    if (slotA !== null && slotB !== null) {
      if (usedFb) fallbackUsed += 1;
      else twoPrimaries += 1;
    } else if (slotA !== null || slotB !== null) {
      oneReader += 1;
    } else {
      dropped += 1;
    }
    done += 1;
    const tag = slotA && slotB ? (usedFb ? "fallback" : "two-prim") : slotA || slotB ? "one-only" : "dropped ";
    console.log(`  [${String(done).padStart(2)}/${corpus.claims.length}] ${tag}`);
  }

  console.log(
    `done: ${twoPrimaries} two-primaries, ${fallbackUsed} fallback-used, ${oneReader} one-reader, ` +
      `${bothFailed} both-primaries-failed` + (dropped > 0 ? `, ${dropped} dropped` : ""),
  );

  const readers = { "reader-a": readersA, "reader-b": readersB };
  const outPath = inPath.replace(/\.json$/, "") + ".read.json";
  writeFileSync(outPath, JSON.stringify({ ...corpus, readers }, null, 2) + "\n");
  console.log(`wrote ${outPath}`);
}

if (process.argv[1] !== undefined && /read\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
