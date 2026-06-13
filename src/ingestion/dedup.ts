/**
 * Version-family dedup for ingested records. Extracted from crossref.ts (which
 * was over the ~200-line soft limit) and mirroring VIGILIA's dedup.ts.
 *
 * Two records are the SAME WORK — and collapse to one — when EITHER:
 *   (old rule) their normalized title + first author match; OR
 *   (new rule) their DOI-base + first author match, where the DOI-base is the
 *              DOI with a NUMERIC version suffix removed (".2", ".5", ".v1").
 *
 * The new rule catches versions that were RENAMED between revisions (real case:
 * F1000 10.12688/f1000research.72956 .3 and .5, same author, divergent titles),
 * which the title rule alone misses. Counting both would fabricate independent
 * corroboration (Phase 5) — the exact failure the axis exists to prevent.
 *
 * Conservative by construction: in doubt, do NOT fuse.
 *  - A non-numeric suffix (".../...061en") is NOT a version → not stripped, so a
 *    work and its translation survive as two distinct entries (product decision).
 *  - A long trailing number (".../7679.4814" vs ".4813") is an article id, not a
 *    version → not stripped, so the DOI-bases stay distinct and they do not merge.
 *
 * Keeps the most recent version (highest year, then highest version number, then
 * DOI string for determinism). Pure; no I/O.
 */

export interface VersionKey {
  readonly doi: string;
  readonly title: string;
  readonly authorFamily: string;
  readonly recency: number; // year (or 0)
}

export function dedupByVersion<T>(items: readonly T[], key: (item: T) => VersionKey): readonly T[] {
  const parent = items.map((_, i) => i);
  const find = (x: number): number => {
    let r = x;
    for (;;) {
      const p = parent[r];
      if (p === undefined || p === r) return r;
      r = p;
    }
  };
  const union = (a: number, b: number): void => {
    parent[find(a)] = find(b);
  };

  // Merge any two items that share a match key (title-based or DOI-base-based).
  const keyOwner = new Map<string, number>();
  items.forEach((item, i) => {
    for (const k of matchKeys(key(item))) {
      const owner = keyOwner.get(k);
      if (owner === undefined) keyOwner.set(k, i);
      else union(i, owner);
    }
  });

  // Per group, keep the most recent; preserve first-appearance order overall.
  const bestByRoot = new Map<number, number>();
  items.forEach((item, i) => {
    const root = find(i);
    const current = bestByRoot.get(root);
    if (current === undefined || isMoreRecent(key(item), key(items[current] as T))) {
      bestByRoot.set(root, i);
    }
  });

  return [...bestByRoot.values()].sort((a, b) => a - b).map((i) => items[i] as T);
}

/** The keys by which two records are judged the same work. */
function matchKeys(vk: VersionKey): readonly string[] {
  const keys: string[] = [];
  const author = vk.authorFamily.trim().toLowerCase();
  const title = normalizeTitle(vk.title);
  // Old rule: title + author (works even with no author, like before).
  if (title.length > 0) keys.push(`t:${title}|${author}`);
  // New rule: DOI-base + author, ONLY when a numeric version suffix was removed
  // and a first author exists (cravada: "mesmo primeiro autor").
  const base = stripVersionSuffix(vk.doi);
  if (author.length > 0 && base !== vk.doi) keys.push(`b:${base}|${author}`);
  return keys;
}

function isMoreRecent(a: VersionKey, b: VersionKey): boolean {
  if (a.recency !== b.recency) return a.recency > b.recency;
  const va = parseVersion(a.doi);
  const vb = parseVersion(b.doi);
  if (va !== vb) return va > vb;
  return a.doi > b.doi;
}

/** A version suffix: "." then either "v" + digits, or 1–2 bare digits. The
 * 1–2-digit bound is the conservative bit — revision counts are small, whereas a
 * 3+-digit trailing number is an article identifier (e.g. SciELO ".4814"), not a
 * version. So ".3"/".5"/".v1" strip; ".4814" does not. */
const VERSION_SUFFIX = /\.(?:v\d+|\d{1,2})$/i;

/** DOI with its numeric version suffix removed (the DOI-base). Unchanged when
 * the trailing token is not a version (non-numeric like "en", or a long id). */
export function stripVersionSuffix(doi: string): string {
  return doi.replace(VERSION_SUFFIX, "");
}

/** Version number for ordering within a matched family (any digit count here —
 * it only ranks records already grouped as versions). 0 if none. */
export function parseVersion(doi: string): number {
  const match = /\.v?(\d+)$/.exec(doi);
  return match ? Number(match[1] ?? "0") : 0;
}

/** Title normalized for fuzzy equality: lowercase, no diacritics/punctuation,
 * single spaces. (Same idea as VIGILIA's normalizeTitle, no crypto.) */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") // strip diacritics (combining marks)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
