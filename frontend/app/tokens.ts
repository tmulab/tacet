// Design tokens — the LITERAL contract from "TACET (standalone).html" (Claude
// Design). Per Akita Regra 14: hex values, sizes and copy are copied verbatim;
// never "improved" or normalized. The whole palette of the prototype lives here
// so a screen references a token, never a stray hex.

export const c = {
  bg: "#e4ded3",
  ink: "#1c1a17",
  green: "#2E5A4B",
  greenShadow: "#244A3D",
  focus: "#2E5A4B33",
  // surfaces
  card: "#f6f3ec",
  input: "#fffdf8",
  panel: "#efebe1",
  panel2: "#ece6da",
  panel3: "#f1ede4",
  // borders
  border: "#d4ccbd",
  borderInput: "#cfc6b6",
  rule: "#ccc4b5",
  borderSoft: "#e2dccf",
  // muted text, light → dark
  m1: "#57534c",
  m2: "#6b665d",
  m3: "#7a746a",
  m4: "#8a8275",
  m5: "#9a9282",
  m6: "#a39a8a",
  // the three signals
  core: "#1D9E75",
  coreText: "#0F6E56",
  crux: "#BA7517",
  cruxText: "#854F0B",
  chair: "#993C1D",
  unsupported: "#b8b0a0",
} as const;

// Font families resolve to the next/font CSS variables set on <html> in layout.tsx.
export const font = {
  sans: "var(--font-sans), system-ui, sans-serif",
  mono: "var(--font-mono), monospace",
  serif: "var(--font-serif), serif",
} as const;

export type SignalKey = "core" | "crux" | "empty";
export const signals: Record<SignalKey, { glyph: string; color: string; text: string; name: string }> = {
  core: { glyph: "●", color: c.core, text: c.coreText, name: "núcleo robusto" },
  crux: { glyph: "▲", color: c.crux, text: c.cruxText, name: "crux vivo" },
  empty: { glyph: "○", color: c.chair, text: c.chair, name: "cadeira vazia" },
};

// The four worked cases. Door copy is literal from the design's case data.
export interface CaseDoor {
  readonly id: string;
  readonly badge: string;
  readonly badgeColor: string;
  readonly star: boolean;
  readonly doorTitle: string;
  readonly doorSub: string;
}
export const CASES: readonly CaseDoor[] = [
  {
    id: "freud", badge: "fora do envelope", badgeColor: "#2E5A4B", star: true,
    doorTitle: "a psicanálise é compatível com o marxismo?",
    doorSub: "fora do envelope — a tradição que decidiria não foi colhida",
  },
  {
    id: "covid", badge: "debate curado", badgeColor: "#0F6E56", star: false,
    doorTitle: "qual hipótese sobre a origem do SARS-CoV-2 a evidência sustenta?",
    doorSub: "debate curado — duas cláusulas, uma régua da OMS/SAGO",
  },
  {
    id: "lhc", badge: "resposta confiante", badgeColor: "#3C3489", star: false,
    doorTitle: "o LHC pode criar um buraco negro que ameace a Terra?",
    doorSub: "resposta confiante — o deep research diria “não” e pararia",
  },
  {
    id: "eggs", badge: "mundano-contestado", badgeColor: "#854F0B", star: false,
    doorTitle: "ovos fazem mal ao coração?",
    doorSub: "mundano-contestado — o efeito é heterogêneo, não nulo",
  },
];

// The step bar across the inner screens (the live method, in order).
export const STEPS: readonly { readonly key: string; readonly label: string }[] = [
  { key: "passo-0", label: "passo 0" },
  { key: "colheita", label: "colheita" },
  { key: "leitores", label: "dois leitores" },
  { key: "mapa", label: "mapa" },
  { key: "narrativa", label: "narrativa" },
];
