import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Lean } from "../src/domain/types.js";

/**
 * Sync guard: the embedded replay data in TACET.html must equal the frozen
 * fixture. The visual page (TACET.html) and the terminal demo (demo:replay) read
 * the SAME numbers; if the fixture is regenerated and the HTML is not rebuilt
 * (`npm run build:html`), this test goes red. Offline, reads files from disk.
 */

interface AxisValue<T> {
  readonly kind: "measured" | "not-measured";
  readonly value?: T;
}
interface Profile {
  readonly claimId: string;
  readonly traceability: AxisValue<boolean>;
  readonly independentCorroboration: AxisValue<number>;
  readonly internalContestation: AxisValue<boolean>;
  readonly agreementFromDoubt: AxisValue<string>;
}
interface Fixture {
  readonly readers: Record<string, Record<string, { lean: Lean; model: string }>>;
  readonly derived: { readonly reliabilityProfiles: readonly Profile[] };
}
interface HtmlCase {
  readonly axes: { trace: unknown; corrob: unknown; contest: unknown; agree: unknown };
  readonly readers: ReadonlyArray<{ occupant: string; lean: string; fallback?: boolean }>;
}

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/replay/sago-origin-v0.1.json", import.meta.url)), "utf8"),
) as Fixture;
const html = readFileSync(fileURLToPath(new URL("../TACET.html", import.meta.url)), "utf8");

/** Extract and evaluate the single-quoted _cases() object literal embedded in
 * the page (it is pure JS — literal tones, no `this`). */
function embeddedCases(): Record<string, HtmlCase> {
  const marker = "_cases() { return ";
  const start = html.indexOf(marker) + marker.length;
  const end = html.indexOf("; }  _accent() { return this.props", start);
  const literal = html.slice(start, end);
  return new Function(`return (${literal})`)() as Record<string, HtmlCase>;
}

const val = <T>(a: AxisValue<T>): T | null => (a.kind === "measured" ? (a.value as T) : null);
const profOf = (id: string): Profile => {
  const p = fixture.derived.reliabilityProfiles.find((x) => x.claimId === id);
  if (!p) throw new Error(`no profile for ${id}`);
  return p;
};

// The three claims the HTML freezes, one per outcome (must match build-html.mjs).
const MAP: Record<string, string> = {
  "doc-1": "10.12688/f1000research.72956.3", // genuine crux
  "doc-2": "10.14202/vetworld.2021.190-199", // robust core
  "doc-3": "10.14293/s2199-1006.1.sor-.pp4vz1s.v1", // empty chair (fallback swap)
};

describe("TACET.html embedded replay data == frozen fixture", () => {
  const cases = embeddedCases();

  for (const [docKey, claimId] of Object.entries(MAP)) {
    it(`${docKey} (${claimId}) leans, models and axes match the fixture`, () => {
      const c = cases[docKey];
      if (!c) throw new Error(`missing case ${docKey} in TACET.html`);
      const a = fixture.readers["reader-a"]?.[claimId];
      const b = fixture.readers["reader-b"]?.[claimId];
      expect(a).toBeDefined();
      expect(b).toBeDefined();

      // both leans + producing models, exactly as the fixture saved them
      expect(c.readers[0]?.occupant).toBe(a?.model);
      expect(c.readers[0]?.lean).toBe(a?.lean);
      expect(c.readers[1]?.occupant).toBe(b?.model);
      expect(c.readers[1]?.lean).toBe(b?.lean);

      // four axes, exactly (null where the fixture says not-measured)
      const p = profOf(claimId);
      expect(c.axes.trace).toBe(val(p.traceability));
      expect(c.axes.corrob).toBe(val(p.independentCorroboration));
      expect(c.axes.contest).toBe(val(p.internalContestation));
      expect(c.axes.agree).toBe(val(p.agreementFromDoubt));
    });
  }

  it("the empty-chair case shows the fallback (reserve) swap", () => {
    const empty = cases["doc-3"];
    const usedGemma = empty?.readers.some((r) => /gemma/i.test(r.occupant) && r.fallback === true);
    expect(usedGemma).toBe(true);
  });

  it("the epigraph carries the real SAGO anchor + attribution + license", () => {
    expect(html).toContain("natural zoonotic spillover");
    expect(html).toContain("World Health Organization · SAGO");
    expect(html).toContain("CC BY-NC-SA 3.0 IGO");
  });

  it("no generic placeholders remain", () => {
    for (const ph of ["model-a", "model-b", "model-r", "Position&nbsp;P", "v.toFixed"]) {
      expect(html.includes(ph)).toBe(false);
    }
  });
});
