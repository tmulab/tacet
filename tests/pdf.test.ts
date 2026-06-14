import { describe, it, expect } from "vitest";
import { extractPdfText, sha256 } from "../src/protocol/pdf.js";

/**
 * Real-data validation of the local PDF extractor (unpdf). We generate minimal
 * valid PDFs in-memory — one WITH a text layer, one WITHOUT (a scanned/image-only
 * stand-in) — and assert: text is extracted; a no-text PDF fails CLEAN (needs
 * OCR), never silently empty; sha256 pins the bytes. No network, offline.
 */

/** Assemble a minimal valid PDF from object bodies (index+1 = object number). */
function pdf(objects: readonly string[]): Uint8Array {
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  const n = objects.length + 1;
  body += `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<</Size ${n}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

const STREAM = "BT /F1 18 Tf 20 100 Td (Hello TACET anchor text) Tj ET";

const WITH_TEXT = pdf([
  "<</Type/Catalog/Pages 2 0 R>>",
  "<</Type/Pages/Kids[3 0 R]/Count 1>>",
  "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
  `<</Length ${STREAM.length}>>\nstream\n${STREAM}\nendstream`,
  "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
]);

const NO_TEXT = pdf([
  "<</Type/Catalog/Pages 2 0 R>>",
  "<</Type/Pages/Kids[3 0 R]/Count 1>>",
  "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>", // a page with no content stream
]);

describe("extractPdfText", () => {
  it("extracts the text layer of a real PDF", async () => {
    const text = await extractPdfText(WITH_TEXT);
    expect(text).toContain("Hello TACET anchor text");
  });

  it("FAILS CLEAN on a PDF with no text layer (needs OCR), never silently empty", async () => {
    await expect(extractPdfText(NO_TEXT)).rejects.toThrow(/OCR/i);
  });
});

describe("sha256", () => {
  it("is stable and distinguishes different bytes", () => {
    expect(sha256(WITH_TEXT)).toBe(sha256(WITH_TEXT));
    expect(sha256(WITH_TEXT)).not.toBe(sha256(NO_TEXT));
    expect(sha256(WITH_TEXT)).toMatch(/^[0-9a-f]{64}$/);
  });
});
