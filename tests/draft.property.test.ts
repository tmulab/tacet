import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseDraft } from "../src/protocol/draft.js";
import type { ProposeInput } from "../src/protocol/draft.js";

/**
 * Property tests for the step-0 proposer's resilience, and the ANTI-CIRCULAR
 * invariant expressed as a TYPE GUARD.
 *
 * Anti-circular as a type guard: the proposer's input cannot carry a corpus — it
 * is structurally unable to read the answer in order to write the ruler. If
 * someone adds a `corpus` field to ProposeInput, the @ts-expect-error below goes
 * UNUSED and `npm run typecheck` fails. This is the invariant enforced by the
 * compiler, not by a runtime assertion.
 */
// @ts-expect-error ProposeInput has no `corpus` — the proposer cannot see the corpus
const _antiCircular: ProposeInput = { question: "q", corpus: [] };
void _antiCircular;

describe("parseDraft — degrades, never throws (property)", () => {
  it("never throws on an arbitrary object or null", () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(null), fc.object()), (json) => {
        expect(() => parseDraft(json as Record<string, unknown> | null)).not.toThrow();
      }),
    );
  });

  it("with both SAGO clauses present, the optional fields degrade to empty arrays/object (never undefined)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 40 }), fc.string({ minLength: 1, maxLength: 40 }), (a, b) => {
        const d = parseDraft({ bestSustained: a, concession: b });
        if (d !== null) {
          // null only when a/b trim to empty — otherwise a well-formed shell
          expect(Array.isArray(d.inclusion)).toBe(true);
          expect(Array.isArray(d.exclusion)).toBe(true);
          expect(Array.isArray(d.seedPapers)).toBe(true);
          expect(typeof d.descriptors).toBe("object");
        }
      }),
    );
  });

  it("returns null (never throws) whenever a SAGO clause is missing", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.anything()), (extra) => {
        const json = { ...extra, bestSustained: "x", concession: "" }; // concession empty → null
        expect(parseDraft(json)).toBeNull();
      }),
    );
  });
});
