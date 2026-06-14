/**
 * Local PDF text extraction for the anchored step-0 path (prep-only). Uses unpdf
 * (a node-friendly pdf.js wrapper) — a LOCAL library, no external network service.
 * Reached only by `npm run protocol -- propose … --anchor <pdf>`; never by replay
 * or the domain logic.
 *
 * A scanned/image-only PDF has no text layer: extraction returns (near) nothing.
 * We DETECT that and fail with a clear message rather than feeding the model an
 * empty anchor — OCR is out of scope, but pretending there was text is worse.
 */

import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";

/** sha256 of the raw bytes — pins WHICH file (and which exact text) was read, for
 * the protocol's sourceAnchor provenance. */
export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Below this many non-whitespace chars we treat the PDF as having no real text
 * layer (scanned/image-only) and refuse rather than guess. */
const MIN_TEXT_CHARS = 20;

/**
 * Extract and normalize the text of a PDF. Throws a clear, actionable error when
 * the PDF carries no extractable text layer (needs OCR first). Never fabricates.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // pdf.js DETACHES the buffer it is handed (transfers it), which would zero out
  // the caller's array — and any sha256(bytes) taken afterwards. Hand it a copy.
  const doc = await getDocumentProxy(bytes.slice());
  const { text } = await extractText(doc, { mergePages: true });
  const raw = Array.isArray(text) ? text.join("\n") : text;
  const clean = raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
    throw new Error("PDF sem camada de texto — precisa de OCR antes (nenhum texto extraível).");
  }
  return clean;
}
