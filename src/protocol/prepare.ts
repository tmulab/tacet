import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, isAbsolute, resolve } from "node:path";
import { configFromEnv } from "../ingestion/llm.js";
import { FREE_MODELS, openRouterTransport, specFor } from "../llm/openrouter.js";
import type { ModelSpec } from "../llm/cascade.js";
import { proposeDraftViaCascade } from "./draft.js";
import type { ProposeInput } from "./draft.js";
import { extractPdfText, sha256 } from "./pdf.js";
import { emptyProtocol, finalizeProtocol, protocolFromDraft, renderReferenceHypothesis } from "./protocol.js";
import type { AnchorRef, InvestigationProtocol } from "./types.js";

/**
 * Step-0 ("passo 0") prep CLI — the assisted dialogue that distils a raw question
 * into a versioned investigation protocol BEFORE any harvest. Two moves:
 *
 *   npm run protocol -- propose "raw question?" [case-slug] [--anchor <file.pdf>]
 *       Ask a model (prep-only, key+network) for a FIRST DRAFT, write it to
 *       protocols/<slug>.v1.draft.json. With no key/network it degrades to an
 *       EMPTY human form (proposedBy "human") — never a fabricated proposal.
 *       With --anchor <pdf>, the model distils the DISPUTE the text stages and
 *       frames it as two neutral positions (the anchor is TENSION, not truth);
 *       each clause records sourceAnchor (file + sha256). A PDF with no text
 *       layer fails clean ("needs OCR"), never invented.
 *       The researcher then edits the file: rewrite any clause, and for each
 *       referenceHypothesis clause set "editedByHuman": true OR set "acceptedAt".
 *
 *   npm run protocol -- accept protocols/<slug>.v1.draft.json
 *       Enforce the invariant (nothing becomes the referenceHypothesis without
 *       human acceptance) and, if it holds, write the finalized protocol to
 *       protocols/<slug>.v1.json. Refuses, listing the offending clauses, if not.
 *
 * The ONLY LLM-touching step-0 path is `propose` with a key. `accept` is offline.
 * Replay and the unit tests never import or run this file's network path.
 */

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip combining diacritics (ç, á, …)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "investigation"
  );
}

function protocolsDir(): string {
  return fileURLToPath(new URL("../../protocols/", import.meta.url));
}

/** The cascade model order: the configured lead first, then the rest of
 * FREE_MODELS as fallbacks (mirroring summarize). Single-role — no distinct-company
 * rule (that is only for the two independent READERS, src/llm/slots.ts). */
function proposerModels(leadModel: string, baseUrl: string): readonly ModelSpec[] {
  const lead = specFor(leadModel, baseUrl);
  return [lead, ...FREE_MODELS.filter((m) => m.id !== lead.id)];
}

/** Attach the model's dispute-locus paraphrase to the anchor ref, when present. */
function anchorWithLocus(anchor: AnchorRef | undefined, locus: string | undefined): AnchorRef | undefined {
  if (anchor === undefined) return undefined;
  return locus !== undefined && locus.length > 0 ? { ...anchor, locus } : anchor;
}

/** Parse `propose` args: positional question + optional case-slug, plus an
 * optional `--anchor <path>` anywhere. */
function parseProposeArgs(args: readonly string[]): {
  question: string | undefined;
  caseSlug: string | undefined;
  anchor: string | undefined;
} {
  const positionals: string[] = [];
  let anchor: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--anchor") {
      i += 1;
      anchor = args[i];
      continue;
    }
    if (a !== undefined) positionals.push(a);
  }
  return { question: positionals[0], caseSlug: positionals[1], anchor };
}

/** Read + extract an anchor PDF. Returns the AnchorRef (file + hash) and the
 * extracted text. Throws a clean error (no text layer / unreadable) for the
 * caller to surface. */
async function readAnchor(path: string): Promise<{ anchor: AnchorRef; text: string }> {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  const bytes = new Uint8Array(readFileSync(abs));
  const text = await extractPdfText(bytes); // throws clean on a no-text PDF
  return { anchor: { file: basename(abs), sha256: sha256(bytes) }, text };
}

async function propose(rawQuestion: string, caseSlug: string, nowIso: string, anchorPath?: string): Promise<void> {
  // Load the anchor first so a bad PDF fails BEFORE any model call.
  let anchor: AnchorRef | undefined;
  let anchorText: string | undefined;
  if (anchorPath !== undefined) {
    try {
      const a = await readAnchor(anchorPath);
      anchor = a.anchor;
      anchorText = a.text;
    } catch (e: unknown) {
      console.error(`anchor failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
      return;
    }
  }

  const config = configFromEnv();
  let protocol: InvestigationProtocol;

  if (config === null) {
    if (anchor !== undefined) console.log("(anchor ignored — no key; the empty human form carries no model distillation)");
    console.log("no SUMMARY_API_KEY/OPENROUTER_API_KEY — degrading to an EMPTY human form (proposedBy=human).");
    protocol = emptyProtocol(caseSlug, rawQuestion, nowIso);
  } else {
    const input: ProposeInput = anchorText !== undefined ? { question: rawQuestion, anchorText } : { question: rawQuestion };
    console.log(`proposing a draft via cascade (lead: ${config.model})${anchor !== undefined ? ` — anchored to ${anchor.file}` : ""}…`);
    const models = proposerModels(config.model, config.baseUrl);
    const proposed = await proposeDraftViaCascade(input, models, openRouterTransport(config.apiKey));
    if (proposed === null) {
      console.log("no model returned a usable draft — degrading to an EMPTY human form (proposedBy=human).");
      protocol = emptyProtocol(caseSlug, rawQuestion, nowIso);
    } else {
      // Attribute to the model that ACTUALLY produced it, not the configured lead.
      if (proposed.model !== config.model) console.log(`(lead fell through — draft produced by ${proposed.model})`);
      const ref = anchorWithLocus(anchor, proposed.draft.disputeLocus);
      protocol = protocolFromDraft(caseSlug, rawQuestion, proposed.draft, proposed.model, nowIso, ref);
    }
  }

  const dir = protocolsDir();
  mkdirSync(dir, { recursive: true });
  const outPath = resolve(dir, `${caseSlug}.v${protocol.version}.draft.json`);
  writeFileSync(outPath, JSON.stringify(protocol, null, 2) + "\n");
  console.log(`\nwrote draft → ${outPath}`);
  console.log("NEXT: open it, rewrite any clause, and for EACH referenceHypothesis clause either");
  console.log('      set "editedByHuman": true (if you rewrote it) or "acceptedAt": "<ISO date>"');
  console.log('      (if you accept it as-is). Then run:  npm run protocol -- accept "' + outPath + '"');
}

function accept(pathArg: string, nowIso: string): void {
  const inPath = isAbsolute(pathArg) ? pathArg : resolve(process.cwd(), pathArg);
  const protocol = JSON.parse(readFileSync(inPath, "utf8")) as InvestigationProtocol;

  let finalized: InvestigationProtocol;
  try {
    finalized = finalizeProtocol(protocol, nowIso);
  } catch (e: unknown) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exitCode = 1;
    return;
  }

  // <slug>.vN.draft.json → <slug>.vN.json; if the input was not a *.draft.json,
  // emit *.final.json so we never overwrite the human's working copy.
  const outPath = /\.draft\.json$/.test(inPath)
    ? inPath.replace(/\.draft\.json$/, ".json")
    : inPath.replace(/\.json$/, ".final.json");
  writeFileSync(outPath, JSON.stringify(finalized, null, 2) + "\n");
  console.log(`finalized → ${outPath}`);
  console.log("\nreferenceHypothesis (the anchor read.ts will inject into both readers):");
  console.log("  " + renderReferenceHypothesis(finalized));
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const nowIso = new Date().toISOString();

  if (mode === "propose") {
    const { question, caseSlug, anchor } = parseProposeArgs(process.argv.slice(3));
    if (question === undefined || question.trim().length === 0) {
      throw new Error('usage: npm run protocol -- propose "raw question?" [case-slug] [--anchor <file.pdf>]');
    }
    await propose(question.trim(), caseSlug ?? slugify(question), nowIso, anchor);
    return;
  }
  if (mode === "accept") {
    const pathArg = process.argv[3];
    if (pathArg === undefined) throw new Error("usage: npm run protocol -- accept <draft.json>");
    accept(pathArg, nowIso);
    return;
  }
  throw new Error('usage: npm run protocol -- <propose|accept> …');
}

if (process.argv[1] !== undefined && /prepare\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}

export { slugify };
