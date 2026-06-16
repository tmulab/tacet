// Phase 3 — project frozen replay fixtures (+ narrative prose + optional uplift
// comparison) into the screens' view-model. Wired: covid (no uplift), eggs, lhc.
// Honest to the real shape (live-crux=0 → "crux ausente"; abstention + empty
// chair as the finding). Server-only module; the JSON is bundled at build.

import covidFx from "../../fixtures/replay/sago-origin-v0.2.json";
import covidNar from "../../fixtures/replay/sago-origin-v0.2.narrative.json";
import eggsFx from "../../fixtures/replay/eggs-cv-v0.1.json";
import eggsNar from "../../fixtures/replay/eggs-cv-v0.1.narrative.json";
import lhcFx from "../../fixtures/replay/lhc-origin-v0.1.json";
import lhcNar from "../../fixtures/replay/lhc-origin-v0.1.narrative.json";
import eggsUp from "../../fixtures/comparison/eggs-uplift-v0.1.json";
import lhcUp from "../../fixtures/comparison/lhc-uplift-v0.1.json";
import { CASE_DATA } from "./cases";
import type { CaseData, ClaimRow, CoverageReturnRow, EmptyChairRow, LeanKey, Uplift } from "./cases";

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
interface UpFx {
  readonly baseline: { readonly model: string };
  readonly asymmetry: string;
  readonly measurements: {
    readonly verifiability: { readonly tacet: { readonly registered: { readonly resolved: number; readonly total: number; readonly fraction: number } }; readonly baseline: { readonly registered: { readonly resolved: number; readonly total: number; readonly fraction: number } } };
    readonly uncertainty: { readonly tacet: { readonly total?: number; readonly unsupported: number }; readonly baseline: { readonly hedges: number; readonly verdicts: number } };
    readonly hiddenDependency: { readonly count: number; readonly nameMentions?: readonly string[] };
  };
  readonly rubric: { readonly dimensions: readonly { readonly key: string; readonly title: string; readonly criterion: string }[] };
}

const LEAN_MAP: Record<string, LeanKey> = { supports: "sustenta", contradicts: "contradiz", insufficient: "insuficiente" };

function splitHypothesis(h: string): { a: string; b: string } {
  const i = h.search(/\bpor[ée]m\b/i);
  if (i > 0) return { a: h.slice(0, i).trim().replace(/[;,]\s*$/, ""), b: h.slice(i).trim() };
  return { a: h, b: "" };
}

function projectUplift(u: UpFx): Uplift {
  const m = u.measurements;
  return {
    baselineModel: u.baseline.model,
    asymmetry: u.asymmetry,
    verifiability: {
      tacetFraction: m.verifiability.tacet.registered.fraction,
      baselineFraction: m.verifiability.baseline.registered.fraction,
      tacetN: `${m.verifiability.tacet.registered.resolved}/${m.verifiability.tacet.registered.total}`,
      baselineN: `${m.verifiability.baseline.registered.resolved}/${m.verifiability.baseline.registered.total}`,
    },
    uncertainty: {
      tacetAbstentions: m.uncertainty.tacet.total ?? m.uncertainty.tacet.unsupported,
      baselineHedges: m.uncertainty.baseline.hedges,
      baselineVerdicts: m.uncertainty.baseline.verdicts,
    },
    hiddenDependency: { count: m.hiddenDependency.count, names: m.hiddenDependency.nameMentions ?? [] },
    dimensions: u.rubric.dimensions.map((d) => ({ key: d.key, title: d.title, criterion: d.criterion })),
  };
}

function project(baseId: string, fxJson: unknown, prose: string, upJson: unknown | null): CaseData {
  const base = CASE_DATA[baseId]!;
  const fx = fxJson as Fx;
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
  const gateNote = g ? `gate de relevância: ${g.status} (sobreposição lexical ${(g.alignedFraction * 100).toFixed(1)}%). ` : "";
  const modelA = Object.values(fx.readers["reader-a"] ?? {})[0]?.model ?? "?";
  const modelB = Object.values(fx.readers["reader-b"] ?? {})[0]?.model ?? "?";
  const up = upJson ? projectUplift(upJson as UpFx) : undefined;

  return {
    ...base,
    isReal: true,
    hasUplift: up !== undefined,
    ...(up ? { uplift: up } : {}),
    narrativeProse: prose,
    unsupportedCount: tally.uns,
    hypA: hyp.a,
    hypB: hyp.b.length > 0 ? hyp.b : "(a âncora já carrega a concessão no próprio texto de referência)",
    coverage,
    harvest: { scanned: "—", abstract: String(fx.claims.length), claims: String(fx.claims.length) },
    coverageReturn,
    readerA: `leitor a · ${modelA}`,
    readerB: `leitor b · ${modelB}`,
    claims,
    map: tally,
    emptyChair,
    insight: `${gateNote}o achado é a abstenção honesta: ${tally.core} núcleo robusto, ${tally.uns} não-sustentados, e a cadeira vazia mede o que a régua do passo 0 esperava e a base não trouxe.`,
  };
}

const PROSE = (n: unknown): string => (n as { prose: string }).prose;

const PROJECTORS: Record<string, () => CaseData> = {
  covid: () => project("covid", covidFx, PROSE(covidNar), null),
  eggs: () => project("eggs", eggsFx, PROSE(eggsNar), eggsUp),
  lhc: () => project("lhc", lhcFx, PROSE(lhcNar), lhcUp),
};

/** Real projection for a door, or null to fall back to the illustrative mock. */
export function realCase(id: string): CaseData | null {
  return PROJECTORS[id]?.() ?? null;
}
