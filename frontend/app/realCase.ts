// Phase 3 — project a frozen replay fixture into the screens' view-model. COVID
// is wired to the real, committed sago-origin-v0.2 (+ its deterministic
// narrative prose). No uplift comparison exists for covid → Narrativa is
// TACET-only. The real shape is honest: 8 robust-core, 0 crux ("crux ausente"),
// 36 unsupported, 1 empty chair. Server-only module (the JSON is bundled at
// build, never shipped to the client).

import fixtureJson from "../../fixtures/replay/sago-origin-v0.2.json";
import narrativeJson from "../../fixtures/replay/sago-origin-v0.2.narrative.json";
import { CASE_DATA } from "./cases";
import type { CaseData, ClaimRow, CoverageReturnRow, EmptyChairRow, LeanKey } from "./cases";

interface Fx {
  readonly referenceHypothesis: string;
  readonly relevanceGate?: { readonly status: string; readonly alignedFraction: number };
  readonly claims: readonly { readonly id: string; readonly text: string }[];
  readonly readers: Record<string, Record<string, { readonly lean: string; readonly model: string }>>;
  readonly expectedCoverage?: readonly { readonly dimension: string; readonly value: string }[];
  readonly derived: {
    readonly convergenceMap: { readonly verdicts: readonly { readonly claimId: string; readonly signal: string }[] };
    readonly coverageAudit: {
      readonly findings: readonly { readonly dimension: string; readonly value: string; readonly justification: string; readonly measurability: string; readonly observedSources: number; readonly isEmptyChair: boolean }[];
      readonly emptyChairs: readonly { readonly value: string; readonly justification: string }[];
    };
  };
}

const fx = fixtureJson as unknown as Fx;
const prose = (narrativeJson as unknown as { prose: string }).prose;
const LEAN_MAP: Record<string, LeanKey> = { supports: "sustenta", contradicts: "contradiz", insufficient: "insuficiente" };

function splitHypothesis(h: string): { a: string; b: string } {
  const i = h.search(/\bpor[ée]m\b/i);
  if (i > 0) return { a: h.slice(0, i).trim().replace(/[;,]\s*$/, ""), b: h.slice(i).trim() };
  return { a: h, b: "" };
}

function realCovid(): CaseData {
  const base = CASE_DATA["covid"]!;
  const verdicts = fx.derived.convergenceMap.verdicts;
  const tally = { core: 0, crux: 0, uns: 0 };
  for (const v of verdicts) {
    if (v.signal === "robust-core") tally.core += 1;
    else if (v.signal === "live-crux") tally.crux += 1;
    else tally.uns += 1;
  }

  const byId = new Map(fx.claims.map((c) => [c.id, c]));
  const claims: ClaimRow[] = verdicts
    .filter((v) => v.signal === "robust-core")
    .map((v) => ({
      signal: "core" as const,
      text: byId.get(v.claimId)?.text ?? v.claimId,
      leanA: LEAN_MAP[fx.readers["reader-a"]?.[v.claimId]?.lean ?? ""] ?? "insuficiente",
      leanB: LEAN_MAP[fx.readers["reader-b"]?.[v.claimId]?.lean ?? ""] ?? "insuficiente",
      reading: "os dois leitores independentes (empresas distintas) convergem nesta evidência — núcleo robusto.",
    }));

  const coverage = (fx.expectedCoverage ?? []).map((e) => ({ dim: e.dimension, vals: e.value }));

  const coverageReturn: CoverageReturnRow[] = fx.derived.coverageAudit.findings.map((f) => ({
    label: `${f.dimension}=${f.value}`,
    state: f.isEmptyChair ? "zero" : f.measurability === "measured" ? "ok" : "unmeasured",
    val: f.isEmptyChair ? "0 — esperado, não veio" : f.measurability === "measured" ? `${f.observedSources} observados` : "não-medido",
  }));

  const emptyChair: EmptyChairRow[] = [
    ...fx.derived.coverageAudit.emptyChairs.map((e) => ({ kind: "zero" as const, label: e.value, detail: e.justification.slice(0, 120), val: "0" })),
    ...fx.derived.coverageAudit.findings
      .filter((f) => !f.isEmptyChair && f.measurability !== "measured")
      .map((f) => ({ kind: "unmeasured" as const, label: f.value, detail: f.justification.slice(0, 120), val: "não-medido" })),
  ];

  const hyp = splitHypothesis(fx.referenceHypothesis);
  const g = fx.relevanceGate;
  const aFraction = g ? `${(g.alignedFraction * 100).toFixed(1)}%` : "n/d";
  const modelA = Object.values(fx.readers["reader-a"] ?? {})[0]?.model ?? "?";
  const modelB = Object.values(fx.readers["reader-b"] ?? {})[0]?.model ?? "?";

  return {
    ...base,
    isReal: true,
    hasUplift: false,
    narrativeProse: prose,
    unsupportedCount: tally.uns,
    hypA: hyp.a,
    hypB: hyp.b.length > 0 ? hyp.b : "(a âncora SAGO já é uma cláusula dupla; a concessão está embutida no texto de referência)",
    coverage,
    harvest: { scanned: "—", abstract: String(fx.claims.length), claims: String(fx.claims.length) },
    coverageReturn,
    readerA: `leitor a · ${modelA}`,
    readerB: `leitor b · ${modelB}`,
    claims,
    map: tally,
    emptyChair,
    insight: `gate de relevância: ${g?.status ?? "n/d"} (sobreposição lexical ${aFraction} — a régua é PT, o gate léxico é EN, então ele se abstém em vez de chutar). a cadeira vazia é a literatura não-anglófona: a régua a esperava no passo 0, a base não a trouxe.`,
  };
}

/** Real projection for a door, or null to fall back to the illustrative mock. */
export function realCase(id: string): CaseData | null {
  return id === "covid" ? realCovid() : null;
}
