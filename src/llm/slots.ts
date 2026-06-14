/**
 * slots.ts — distinct-company slot allocation, built on the cascade core.
 *
 * TACET's readers exist to be INDEPENDENT (CLAUDE.md decision #6): their
 * agreement is corroboration only because it is not reducible to one model's
 * bias. A blind cascade would break that — if two reader slots fell back onto
 * the same model, that model would "agree with itself" and fake a convergence.
 *
 * So allocation here is company-aware. The consumer picks N mutually-distinct
 * PRIMARY slots (A, B, C…) and an ordered POOL of leftover models. For one
 * (system, user):
 *   1. Each primary is tried (with the cascade's 429 retry/backoff). A surviving
 *      primary reserves its company.
 *   2. Every failed slot is rescued from the pool — but only by a model whose
 *      company is not already held by a live slot. Both slots may be rescued, as
 *      long as they land on DISTINCT companies (the chosen semantics).
 *   3. A slot with no eligible success stays null — the run degrades to fewer
 *      readers (contestation reports not-measured), never a fabricated agreement.
 */

import { companyOf, tryModel } from "./cascade.js";
import type { CascadeOptions, ModelSpec, ModelTransport } from "./cascade.js";

export interface SlotFill {
  readonly slotIndex: number;
  readonly model: string;
  readonly content: string;
  /** false = the slot's own primary; true = rescued from the pool. */
  readonly fromPool: boolean;
}

/** Throw if any two specs share a company — the slots' independence is a
 * contract, so a collision is a configuration error, never silently allowed. */
export function assertDistinctCompanies(specs: readonly ModelSpec[]): void {
  const seen = new Map<string, string>(); // company -> first id seen
  for (const s of specs) {
    const c = companyOf(s);
    const prev = seen.get(c);
    if (prev !== undefined) {
      throw new Error(`slots: '${s.id}' and '${prev}' share company '${c}' — slots must be mutually distinct`);
    }
    seen.set(c, s.id);
  }
}

export class DistinctReaders {
  constructor(
    private readonly slots: readonly ModelSpec[],
    private readonly pool: readonly ModelSpec[],
    private readonly transport: ModelTransport,
    private readonly opts: CascadeOptions = {},
  ) {
    if (slots.length === 0) throw new Error("DistinctReaders: needs at least one slot");
    assertDistinctCompanies(slots);
  }

  /** Fill every slot for one (system, user). Each assigned model has a company
   * distinct from every other assigned model. */
  async allocate(system: string, user: string): Promise<readonly (SlotFill | null)[]> {
    const used = new Set<string>(); // companies currently assigned to a slot
    const deadPool = new Set<string>(); // pool ids that already failed this call
    const results: (SlotFill | null)[] = this.slots.map(() => null);

    // Pass 1 — primaries. A surviving primary reserves its company.
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot === undefined) continue;
      const r = await tryModel(slot, this.transport, system, user, this.opts);
      if (r.ok) {
        results[i] = { slotIndex: i, model: slot.id, content: r.content, fromPool: false };
        used.add(companyOf(slot));
      }
    }

    // Pass 2 — rescue failed slots from the pool, never colliding companies.
    for (let i = 0; i < this.slots.length; i++) {
      if (results[i] !== null) continue;
      for (const cand of this.pool) {
        if (deadPool.has(cand.id)) continue;
        const c = companyOf(cand);
        if (used.has(c)) continue; // would collide with a live slot
        const r = await tryModel(cand, this.transport, system, user, this.opts);
        if (r.ok) {
          results[i] = { slotIndex: i, model: cand.id, content: r.content, fromPool: true };
          used.add(c);
          break;
        }
        deadPool.add(cand.id); // don't re-call a failed pool model for a later slot
      }
    }
    return results;
  }
}
