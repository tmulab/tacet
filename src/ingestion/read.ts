import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { Claim, Lean, ReaderJudgement } from "../domain/types.js";
import { DistinctReaders } from "../llm/slots.js";
import type { SlotFill } from "../llm/slots.js";
import type { CascadeOptions, ModelTransport } from "../llm/cascade.js";
import { openRouterTransport, resolveReaderSlots } from "../llm/openrouter.js";
import type { ResolvedSlots } from "../llm/openrouter.js";
import {
  buildReaderSystem,
  buildReaderUserContent,
  isValidLeanContent,
  judgementFromContent,
} from "../readers/llm-reader.js";

/**
 * Reader prep script (Phase 5b). Runs TWO independent reader slots over the SAME
 * summarized corpus and saves each slot's lean. Replay then reads the saved
 * leans offline. The only LLM-touching path here.
 *
 * The two slots (A, B) are FREE OpenRouter models from DIFFERENT companies
 * (independence is the signal, decision #6). When a slot's primary FAILS
 * technically, it is rescued from an ordered RESERVE POOL — but only by a model
 * whose company is not already held by the other live slot. BOTH slots may be
 * rescued, as long as they land on DISTINCT companies; a model never "agrees
 * with itself". A slot with no eligible rescue stays null → the run degrades to
 * one reader (contestation reports not-measured), never a fabricated agreement.
 *
 * The whole policy lives in the pure `DistinctReaders` (src/llm/slots.ts);
 * here we only build the prompt, parse the lean, and stamp the producing model.
 * Configurable by env (READER_A_/B_/FALLBACK_MODEL pick A/B/C; the rest of
 * FREE_MODELS tails the pool); keys only in .env.
 *
 * Usage: npm run read -- corpus/<corpus>.summarized.json
 */

interface Corpus {
  readonly case: string;
  readonly claims: readonly Claim[];
  readonly citationGraph?: Readonly<Record<string, readonly string[]>>;
  readonly referenceHypothesis?: string;
}

/** A saved lean carries the producing model, for auditability. */
interface SavedLean {
  readonly lean: Lean;
  readonly model: string;
}

export interface ReadOutcome {
  readonly slotA: ReaderJudgement | null;
  readonly slotB: ReaderJudgement | null;
  /** how many of the two slots were filled by a POOL (rescue) model. */
  readonly rescued: number;
  /** true when NEITHER slot kept its own primary (both primaries failed). */
  readonly bothPrimariesFailed: boolean;
}

function toJudgement(fill: SlotFill | null, readerId: string, claim: Claim): ReaderJudgement | null {
  if (fill === null) return null;
  // `validate: isValidLeanContent` already guaranteed the content parses; this
  // re-parse just shapes it into a ReaderJudgement (and is null-safe anyway).
  return judgementFromContent(fill.content, { readerId, model: fill.model, claim });
}

/**
 * Produce the two slot leans for one claim via the distinct-company allocator.
 * `transport` and `opts` are injected so tests drive it with stubs (no network).
 */
export async function readClaim(
  claim: Claim,
  referenceHypothesis: string,
  slots: ResolvedSlots,
  transport: ModelTransport,
  opts: CascadeOptions = {},
): Promise<ReadOutcome> {
  const system = buildReaderSystem(referenceHypothesis);
  const user = buildReaderUserContent(claim);
  const allocator = new DistinctReaders([slots.a, slots.b], slots.pool, transport, { ...opts, validate: isValidLeanContent });
  const [fillA, fillB] = await allocator.allocate(system, user);
  const a = fillA ?? null;
  const b = fillB ?? null;
  return {
    slotA: toJudgement(a, "reader-a", claim),
    slotB: toJudgement(b, "reader-b", claim),
    rescued: [a, b].filter((f) => f?.fromPool === true).length,
    bothPrimariesFailed: (a === null || a.fromPool) && (b === null || b.fromPool),
  };
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === undefined) throw new Error("usage: npm run read -- <corpus.summarized.json>");

  const apiKey =
    process.env["OPENROUTER_API_KEY"] ?? process.env["READER_A_API_KEY"] ?? process.env["SUMMARY_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("set OPENROUTER_API_KEY to read (see .env.example)");
  }
  const slots = resolveReaderSlots();
  const transport = openRouterTransport(apiKey);

  const inPath = isAbsolute(arg) ? arg : resolve(process.cwd(), arg);
  const corpus = JSON.parse(readFileSync(inPath, "utf8")) as Corpus;

  const hyp = corpus.referenceHypothesis;
  if (hyp === undefined || hyp.trim().length === 0) {
    throw new Error(
      `corpus '${corpus.case}' has no referenceHypothesis — re-harvest with one set ` +
        `(TACET_REFERENCE_HYPOTHESIS) so both readers can anchor to it`,
    );
  }

  const readersA: Record<string, SavedLean> = {};
  const readersB: Record<string, SavedLean> = {};
  let twoPrimaries = 0;
  let rescuedRuns = 0;
  let oneReader = 0;
  let dropped = 0;
  let bothFailed = 0;

  console.log(
    `reading ${corpus.claims.length} claims — A=${slots.a.id}  B=${slots.b.id}  ` +
      `reserve=[${slots.pool.map((m) => m.id).join(", ")}]…`,
  );
  let done = 0;
  for (const claim of corpus.claims) {
    const { slotA, slotB, rescued, bothPrimariesFailed } = await readClaim(claim, hyp, slots, transport);
    if (bothPrimariesFailed) bothFailed += 1;
    if (slotA !== null) readersA[claim.id] = { lean: slotA.lean, model: slotA.readerModel };
    if (slotB !== null) readersB[claim.id] = { lean: slotB.lean, model: slotB.readerModel };

    const filled = (slotA !== null ? 1 : 0) + (slotB !== null ? 1 : 0);
    let tag: string;
    if (filled === 2) {
      if (rescued === 0) { twoPrimaries += 1; tag = "two-prim"; }
      else { rescuedRuns += 1; tag = "rescued "; }
    } else if (filled === 1) { oneReader += 1; tag = "one-only"; }
    else { dropped += 1; tag = "dropped "; }
    done += 1;
    console.log(`  [${String(done).padStart(2)}/${corpus.claims.length}] ${tag}`);
  }

  console.log(
    `done: ${twoPrimaries} two-primaries, ${rescuedRuns} rescued, ${oneReader} one-reader, ` +
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
