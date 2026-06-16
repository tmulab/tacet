// The four worked cases — LITERAL mock data from the Claude-Design prototype
// (Regra 14: copy/numbers verbatim). The prototype itself labels these numbers
// "ilustrativos até o motor rodar"; Phase 3 wires the real frozen fixtures
// (covid → sago-origin-v0.2) through the domain core. Until then, every screen
// shows the `· ilustrativo` marker.

import { c } from "./tokens";

export type Signal = "core" | "crux" | "unsupported";
export type LeanKey = "sustenta" | "contradiz" | "insuficiente";

export interface ClaimRow {
  readonly signal: Signal;
  readonly text: string;
  readonly leanA: LeanKey;
  readonly leanB: LeanKey;
  readonly reading: string;
}
export interface CoverageReturnRow {
  readonly label: string;
  readonly state: "ok" | "zero" | "unmeasured";
  readonly val: string;
}
export interface EmptyChairRow {
  readonly kind: "zero" | "unmeasured";
  readonly label: string;
  readonly detail: string;
  readonly val: string;
}
export interface NarrativeLine {
  readonly text: string;
  readonly anchor: "core" | "crux" | "empty";
  readonly label: string;
}
export interface CaseData {
  readonly id: string;
  readonly badge: string;
  readonly badgeColor: string;
  readonly star: boolean;
  readonly doorTitle: string;
  readonly doorSub: string;
  readonly question: string;
  readonly hypA: string;
  readonly hypB: string;
  readonly coverage: readonly { readonly dim: string; readonly vals: string; readonly unmeasured?: boolean }[];
  readonly harvest: { readonly scanned: string; readonly abstract: string; readonly claims: string };
  readonly coverageReturn: readonly CoverageReturnRow[];
  readonly readerA: string;
  readonly readerB: string;
  readonly claims: readonly ClaimRow[];
  readonly map: { readonly core: number; readonly crux: number; readonly uns: number };
  readonly emptyChair: readonly EmptyChairRow[];
  readonly insight: string;
  readonly narrative: {
    readonly tacetAnchor: string;
    readonly drAnchor: string;
    readonly tacetLines: readonly NarrativeLine[];
    readonly drText1: string;
    readonly drHighlight: string;
    readonly drText2: string;
    readonly drConclusion: string;
  };
  // ── Phase 3 real-data extensions (absent on the illustrative mock) ──
  /** true → projected from a frozen fixture, not the design mock. */
  readonly isReal?: boolean;
  /** the deterministic narrative prose (TACET column) for real cases. */
  readonly narrativeProse?: string;
  /** how many claims were unsupported (shown as a summary, not 36 cards). */
  readonly unsupportedCount?: number;
  /** whether a deep-research uplift comparison exists for this case. */
  readonly hasUplift?: boolean;
  /** the TACET-vs-deep-research uplift measurement (eggs, lhc). */
  readonly uplift?: Uplift;
}

/** Projected from a `tacet/uplift-comparison` fixture — the four rubric axes. */
export interface Uplift {
  readonly baselineModel: string;
  readonly asymmetry: string;
  readonly verifiability: { readonly tacetFraction: number; readonly baselineFraction: number; readonly tacetN: string; readonly baselineN: string };
  readonly uncertainty: { readonly tacetAbstentions: number; readonly baselineHedges: number; readonly baselineVerdicts: number };
  readonly hiddenDependency: { readonly count: number; readonly names: readonly string[] };
  readonly dimensions: readonly { readonly key: string; readonly title: string; readonly criterion: string }[];
}

export const CASE_DATA: Record<string, CaseData> = {
  freud: {
    id: "freud", badge: "fora do envelope", badgeColor: "#2E5A4B", star: true,
    doorTitle: "a psicanálise é compatível com o marxismo?",
    doorSub: "fora do envelope — a tradição que decidiria não foi colhida",
    question: "a psicanálise freudiana é compatível com o materialismo histórico marxista?",
    hypA: "as duas tradições operam em níveis distintos — a psicanálise no aparelho psíquico individual, o marxismo nas relações materiais de produção — e a leitura mais sustentada é a de tensão estrutural entre elas.",
    hypB: "a tradição frankfurtiana (Fromm, Marcuse, Adorno) propôs sínteses explícitas, então a incompatibilidade não pode ser afirmada sem ressalva.",
    coverage: [
      { dim: "língua", vals: "pt · de · fr" },
      { dim: "gênero", vals: "livro" },
      { dim: "tradição", vals: "frankfurtiana", unmeasured: true },
    ],
    harvest: { scanned: "412", abstract: "147", claims: "28" },
    coverageReturn: [
      { label: "língua pt", state: "ok", val: "34 registros" },
      { label: "língua de", state: "zero", val: "0 — esperado, não veio" },
      { label: "língua fr", state: "zero", val: "0 — esperado, não veio" },
      { label: "gênero livro", state: "zero", val: "0 — esperado, não veio" },
      { label: "tradição frankfurtiana", state: "unmeasured", val: "não-medida" },
    ],
    readerA: "leitor a · glm-4.6", readerB: "leitor b · minimax-m2.7",
    claims: [
      { signal: "core", text: "Fromm e Marcuse desenvolveram sínteses explícitas entre a teoria pulsional e a crítica da economia política.", leanA: "sustenta", leanB: "sustenta", reading: "os dois leitores convergem, independentemente: a síntese frankfurtiana está documentada. convergência que significa algo." },
      { signal: "crux", text: "a tópica freudiana do inconsciente é redutível à determinação de classe.", leanA: "contradiz", leanB: "insuficiente", reading: "aqui a evidência genuinamente não decide. um leitor lê contra a redução; o outro não encontra base suficiente. o desacordo não foi montado; emergiu." },
      { signal: "unsupported", text: "há consenso clínico contemporâneo sobre a incompatibilidade metodológica entre as duas tradições.", leanA: "insuficiente", leanB: "insuficiente", reading: "a base não traz evidência suficiente para sustentar a afirmação — é o claim mais fraco do corpus, mostrado sem ser escondido." },
    ],
    map: { core: 88, crux: 31, uns: 28 },
    emptyChair: [
      { kind: "zero", label: "lacuna linguística", detail: "de e fr esperados no passo 0 · zero observados", val: "0" },
      { kind: "zero", label: "lacuna de gênero documental", detail: "livro esperado no passo 0 · zero observados", val: "0" },
      { kind: "unmeasured", label: "tradição teórica", detail: "frankfurtiana — a tradição que a pergunta tratava", val: "não-medido" },
    ],
    insight: "o instrumento mediu a ausência da própria tradição de que a pergunta tratava. a cadeira vazia não é um debatedor que faltou — é um buraco na evidência. aqui, ela é o achado.",
    narrative: {
      tacetAnchor: "96%", drAnchor: "61%",
      tacetLines: [
        { text: "a síntese frankfurtiana entre pulsão e crítica da economia política está documentada e convergente.", anchor: "core", label: "núcleo robusto · 88" },
        { text: "se o inconsciente é redutível à classe permanece em disputa: a evidência não decide.", anchor: "crux", label: "crux vivo · 31" },
        { text: "a base não cobriu a literatura em alemão e francês nem os livros da própria tradição frankfurtiana — a origem da disputa está fora do envelope colhido.", anchor: "empty", label: "cadeira vazia" },
      ],
      drText1: "embora psicanálise e marxismo partam de pressupostos distintos sobre o sujeito,",
      drHighlight: "o consenso aponta para uma síntese produtiva",
      drText2: "na qual a teoria crítica reconcilia o desejo individual e a estrutura material.",
      drConclusion: "as duas tradições são, no fim, compatíveis.",
    },
  },
  covid: {
    id: "covid", badge: "debate curado", badgeColor: "#0F6E56", star: false,
    doorTitle: "qual hipótese sobre a origem do SARS-CoV-2 a evidência sustenta?",
    doorSub: "debate curado — duas cláusulas, uma régua da OMS/SAGO",
    question: "qual hipótese sobre a origem do SARS-CoV-2 é mais sustentada pela evidência disponível?",
    hypA: "sob a evidência atual, a origem zoonótica natural por transbordamento é a leitura mais sustentada.",
    hypB: "a hipótese alternativa não pode ser nem descartada nem confirmada, por falta de dados — a questão permanece inconclusiva.",
    coverage: [
      { dim: "língua", vals: "pt · en · zh" },
      { dim: "gênero", vals: "artigo revisado" },
      { dim: "tipo", vals: "pré-print", unmeasured: true },
    ],
    harvest: { scanned: "980", abstract: "410", claims: "64" },
    coverageReturn: [
      { label: "língua en", state: "ok", val: "286 registros" },
      { label: "língua pt", state: "ok", val: "19 registros" },
      { label: "língua zh", state: "zero", val: "0 — esperado, não veio" },
      { label: "tipo pré-print", state: "unmeasured", val: "não-medido" },
    ],
    readerA: "leitor a · glm-4.6", readerB: "leitor b · minimax-m2.7",
    claims: [
      { signal: "core", text: "três parentes virais próximos foram descritos em morcegos em amostragens independentes.", leanA: "sustenta", leanB: "sustenta", reading: "os dois leitores convergem: a evidência filogenética é consistente com a primeira cláusula. núcleo robusto." },
      { signal: "crux", text: "a evidência genômica disponível distingue de forma conclusiva entre as duas hipóteses.", leanA: "contradiz", leanB: "insuficiente", reading: "um leitor lê contra a alegação de conclusividade; o outro a julga insuficiente. a divergência é real — cada um ancora numa cláusula distinta." },
      { signal: "unsupported", text: "registros de mercado estabelecem o ponto exato do transbordamento.", leanA: "insuficiente", leanB: "insuficiente", reading: "a base não traz evidência suficiente para fixar um ponto exato — o claim mais fraco do corpus." },
    ],
    map: { core: 96, crux: 22, uns: 19 },
    emptyChair: [
      { kind: "zero", label: "lacuna linguística", detail: "literatura em zh esperada · zero com abstract rastreável", val: "0" },
      { kind: "unmeasured", label: "pré-prints", detail: "tipo declarado fora do envelope de proveniência", val: "não-medido" },
    ],
    insight: "a régua antecipou a literatura em chinês e ela não veio com proveniência rastreável. a lacuna é contável e foi prevista — não é uma desculpa, é uma medida.",
    narrative: {
      tacetAnchor: "94%", drAnchor: "58%",
      tacetLines: [
        { text: "a evidência filogenética em morcegos sustenta, convergente, a primeira cláusula da hipótese de referência.", anchor: "core", label: "núcleo robusto · 96" },
        { text: "se a genômica decide entre as hipóteses permanece em disputa: a evidência não conclui.", anchor: "crux", label: "crux vivo · 22" },
        { text: "a base não cobriu a literatura em chinês com proveniência rastreável — parte do debate ficou fora do envelope.", anchor: "empty", label: "cadeira vazia" },
      ],
      drText1: "apesar das incertezas remanescentes sobre o intermediário,",
      drHighlight: "o peso da evidência converge para a origem natural",
      drText2: "e as demais hipóteses carecem de suporte empírico equivalente.",
      drConclusion: "a questão está, para fins práticos, resolvida.",
    },
  },
  lhc: {
    id: "lhc", badge: "resposta confiante", badgeColor: "#3C3489", star: false,
    doorTitle: "o LHC pode criar um buraco negro que ameace a Terra?",
    doorSub: "resposta confiante — o deep research diria “não” e pararia",
    question: "o LHC pode criar um buraco negro que ameace a Terra?",
    hypA: "a leitura mais sustentada: micro-buracos-negros hipotéticos evaporariam por radiação Hawking em frações de segundo, sem ameaça.",
    hypB: "a radiação Hawking é teórica e não foi observada diretamente; a confiança vem de argumentos de consistência, não de medição.",
    coverage: [
      { dim: "língua", vals: "en" },
      { dim: "gênero", vals: "artigo revisado" },
      { dim: "observação", vals: "direta de Hawking", unmeasured: true },
    ],
    harvest: { scanned: "320", abstract: "180", claims: "22" },
    coverageReturn: [
      { label: "língua en", state: "ok", val: "180 registros" },
      { label: "argumento de segurança astrofísico", state: "ok", val: "41 registros" },
      { label: "observação direta de Hawking", state: "unmeasured", val: "não-medido" },
    ],
    readerA: "leitor a · glm-4.6", readerB: "leitor b · minimax-m2.7",
    claims: [
      { signal: "core", text: "raios cósmicos de energia muito maior atingem a Terra há bilhões de anos sem incidente.", leanA: "sustenta", leanB: "sustenta", reading: "os dois convergem: o argumento de segurança astrofísico é robusto e independente. núcleo robusto." },
      { signal: "crux", text: "a evaporação de micro-buracos-negros está empiricamente confirmada.", leanA: "contradiz", leanB: "insuficiente", reading: "um leitor lê contra a alegação de confirmação empírica; o outro a julga insuficiente. a confiança popular esconde este crux." },
      { signal: "unsupported", text: "há detecção experimental de radiação Hawking em aceleradores.", leanA: "insuficiente", leanB: "insuficiente", reading: "a base não traz evidência suficiente — a confirmação direta não existe no corpus." },
    ],
    map: { core: 91, crux: 14, uns: 9 },
    emptyChair: [
      { kind: "unmeasured", label: "observação direta de Hawking", detail: "a confirmação empírica que decidiria a segunda cláusula", val: "não-medido" },
    ],
    insight: "o deep research responde “não há perigo” e encerra. o TACET concorda na primeira cláusula — mas mostra que a segunda repousa em radiação nunca observada. a confiança é justificada; a lacuna, real.",
    narrative: {
      tacetAnchor: "93%", drAnchor: "64%",
      tacetLines: [
        { text: "o argumento de segurança por raios cósmicos sustenta, convergente, a ausência de ameaça.", anchor: "core", label: "núcleo robusto · 91" },
        { text: "se a evaporação está empiricamente confirmada permanece em disputa: a evidência não decide.", anchor: "crux", label: "crux vivo · 14" },
        { text: "a base não cobriu observação direta de radiação Hawking — a confirmação empírica ficou fora do envelope.", anchor: "empty", label: "cadeira vazia" },
      ],
      drText1: "os mecanismos físicos envolvidos são bem compreendidos, e",
      drHighlight: "há consenso de que não existe risco algum",
      drText2: "conforme atestam revisões de segurança dos próprios laboratórios.",
      drConclusion: "não há absolutamente nada com que se preocupar.",
    },
  },
  eggs: {
    id: "eggs", badge: "mundano-contestado", badgeColor: "#854F0B", star: false,
    doorTitle: "ovos fazem mal ao coração?",
    doorSub: "mundano-contestado — o efeito é heterogêneo, não nulo",
    question: "ovos fazem mal ao coração?",
    hypA: "a leitura mais sustentada: o consumo moderado de ovos não eleva de forma consistente o risco cardiovascular na população geral.",
    hypB: "subgrupos (por exemplo, diabéticos) mostram associação em alguns estudos — o efeito é heterogêneo, não nulo.",
    coverage: [
      { dim: "língua", vals: "en · pt" },
      { dim: "desenho", vals: "coorte · RCT" },
      { dim: "população", vals: "não-ocidental", unmeasured: true },
    ],
    harvest: { scanned: "1240", abstract: "520", claims: "96" },
    coverageReturn: [
      { label: "desenho coorte", state: "ok", val: "318 registros" },
      { label: "desenho RCT longo prazo", state: "zero", val: "0 — esperado, não veio" },
      { label: "população não-ocidental", state: "unmeasured", val: "não-medido" },
    ],
    readerA: "leitor a · glm-4.6", readerB: "leitor b · minimax-m2.7",
    claims: [
      { signal: "core", text: "meta-análises recentes não encontram associação consistente em população geral.", leanA: "sustenta", leanB: "sustenta", reading: "os dois convergem na primeira cláusula: o sinal médio é nulo na população geral. núcleo robusto." },
      { signal: "crux", text: "o efeito em subgrupos diabéticos é decidido pela evidência atual.", leanA: "contradiz", leanB: "insuficiente", reading: "um leitor lê contra a alegação de que está decidido; o outro a julga insuficiente. o crux mora na heterogeneidade." },
      { signal: "unsupported", text: "há um limiar diário seguro estabelecido para todas as populações.", leanA: "insuficiente", leanB: "insuficiente", reading: "a base não traz evidência suficiente para fixar um limiar universal — o claim mais fraco." },
    ],
    map: { core: 102, crux: 41, uns: 33 },
    emptyChair: [
      { kind: "zero", label: "ensaios randomizados de longo prazo", detail: "desenho RCT longo esperado · zero com abstract", val: "0" },
      { kind: "unmeasured", label: "populações não-ocidentais", detail: "fora das coortes colhidas", val: "não-medido" },
    ],
    insight: "o efeito médio é nulo, mas a disputa real vive nos subgrupos — e os ensaios longos que decidiriam não estão na base. a cadeira vazia aponta exatamente onde a ciência ainda precisa olhar.",
    narrative: {
      tacetAnchor: "95%", drAnchor: "60%",
      tacetLines: [
        { text: "na população geral, o consumo moderado não eleva o risco de forma consistente — convergente.", anchor: "core", label: "núcleo robusto · 102" },
        { text: "se o efeito em subgrupos está decidido permanece em disputa: a evidência não decide.", anchor: "crux", label: "crux vivo · 41" },
        { text: "a base não cobriu ensaios randomizados de longo prazo nem populações não-ocidentais — fora do envelope.", anchor: "empty", label: "cadeira vazia" },
      ],
      drText1: "embora estudos antigos sugerissem cautela,",
      drHighlight: "a evidência atual converge para a segurança do consumo moderado",
      drText2: "sem distinções relevantes entre grupos.",
      drConclusion: "pode comer ovos sem preocupação.",
    },
  },
};

// Home door order (the design's doorOrder).
export const DOORS: readonly CaseData[] = ["covid", "lhc", "eggs", "freud"].map((id) => CASE_DATA[id]!);

// signal + lean visual maps (literal from the prototype's _sig/_lean).
export const SIG: Record<Signal, { glyph: string; name: string; color: string; text: string; tint: string; border: string }> = {
  core: { glyph: "●", name: "núcleo robusto", color: "#1D9E75", text: "#0F6E56", tint: "#EEF4F0", border: "#cbe2d6" },
  crux: { glyph: "▲", name: "crux vivo", color: "#BA7517", text: "#854F0B", tint: "#FBF4E7", border: "#BA7517" },
  unsupported: { glyph: "○", name: "não sustentado", color: "#8a8275", text: "#57534c", tint: c.panel3, border: c.borderInput },
};
export const LEAN: Record<LeanKey, { text: string; color: string }> = {
  sustenta: { text: "↑ sustenta", color: "#0F6E56" },
  contradiz: { text: "↓ contradiz", color: "#993C1D" },
  insuficiente: { text: "◦ insuficiente", color: "#888780" },
};
