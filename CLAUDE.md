# TACET — research engine from The Machine Unconscious (TMU)

> Two undecided readers, one body of evidence, and the map between them.
> Where they converge is the robust core; where they split is the live crux;
> what their evidence never covered is the empty chair.

This is the **competition entry** version: a deliberately small, self-contained
TypeScript/Next service built for the FLF Epistemic Case Study Competition.
It is **throwaway by design** — the production version (Java + middleware +
frontend, inside the `tmu-ecosystem` monorepo) comes after the competition and
is a separate effort. Simplifying here does **not** change that future plan.

---

LEIA SKILL-METODO-AKITA-ESTENDIDO.md antes de continuar

## Arquitetura

- **Stack:** TypeScript + Next.js. Domain core in pure TypeScript (no framework
  dependency); Next only at the edges (routes, I/O, the demo UI later).
- **Repo:** `github.com/tmulab/tacet` — independent repository, NOT part of the
  monorepo, public so a judge can clone and run.
- **Reproducibility target:** fresh clone → running process in ~5 minutes, with a
  zero-GPU **replay mode** over curated fixtures (no model call needed to demo).
- **Object-oriented in everything "intelligent"** (Reader, Bench, ReliabilityProfile,
  CoverageAudit, the convergence/divergence logic). Functional only at the edges
  (Next routes, glue, I/O).

### Estrutura de diretórios

```
src/
  domain/      Pure domain objects: Claim, Reader, Bench, ReliabilityProfile,
               CoverageAudit, ConvergenceMap. No I/O, no framework, no model calls.
  readers/     Reader implementations. StubReader (deterministic) first;
               LlmReader (prompt-backed) later, behind the Reader interface.
  pipeline/    Orchestration: run two readers over a claim set, build the map.
  ingestion/   Corpus ingestion (PDFs/articles → claims w/ provenance).
               Adapts the design of TMU's VIGILIA. Stubbed first.
  app/         (later) Next routes + demo UI.
tests/         Unit + integration. TDD-first: tests before implementation.
fixtures/      Curated claim sets for the two worked cases (replay mode).
docs/          ARCHITECTURE.md, GLOSSARY.md, the spec.
```

---

## Convenções

- **TDD-first (Akita Rule 1):** tests before implementation, always. Stub
  dependencies that don't exist yet.
- **strict total:** `tsconfig` strict, `exactOptionalPropertyTypes`, no `any`.
- **Naming mirrors the production version.** The classes here (`Reader`,
  `ReliabilityProfile`, `CoverageAudit`, `Bench`, `ConvergenceMap`) use the same
  names and boundaries the Java version will use, so this throwaway prototype is
  the executable spec of the permanent one. Code dies; design migrates.
- File size ≤ ~200 lines; session output ~800–1200 lines (Akita scale limits).

---

## Spec Epistêmica

### Modos de operação

- **replay** — runs over curated fixtures, no model call, deterministic,
  zero-GPU. This is the judge's default path.
- **live** — calls a real model behind the Reader interface (added later).

### O método (o que o sistema FAZ)

1. **Ingest** evidence into claims with provenance.
2. **Two undecided readers** read the SAME evidence. Each starts position-agnostic
   (no side assigned). They are NOT advocates. Held undecided by guard prompts.
3. **Convergence/divergence map:**
   - converge → robust core (evidence moved two honest doubts to the same place)
   - diverge → live crux (evidence genuinely underdetermines)
4. **Coverage audit (the empty chair):** which pertinent perspective has NO corpus
   in the evidence the readers actually read. Observed-vs-expected coverage.
   This is NOT "a missing debater" — readers are undecided, not position-bound.
   It is a measured hole in the evidence base.
5. **Reliability profile** per claim — a PROFILE of four juxtaposed axes, never a
   single fused score:
   - traceability (anchored to a source? binary)
   - independent corroboration (how many non-correlated sources? provenance graph)
   - internal contestation (does the base contradict it?)
   - agreement-from-doubt (did the two readers converge/diverge? — same signal as
     the map; reused by design, not by oversight)
     Each axis that cannot be computed reliably reports **"not measured"** rather
     than guessing (graceful degradation). Claim-level abstention = profile weak
     across all measured axes.

### Restrições semânticas (inegociáveis)

- A reader **certifies coherence, never truth.** It judges conceptual coherence,
  traceability, attribution, temporal consistency — never whether a claim is TRUE.
  Every output states this limit.
- A reader reasons **over coverage, not fame.** "The evidence for X, as documented
  in the literature" — never "Dr. So-and-so says." Never impersonates a person.
- **Time is metadata, not a decision rule.** Dates inform the reliability profile
  and a final temporal layer on the map; they do NOT make a reader conclude
  "newer wins." The judgment stays undecided; time annotates the result. (Temporal
  layer = output layer, descriptive, AFTER judgment — never inside it.)

### Erros epistêmicos do agente (vícios a evitar)

- Concordância automática ("perfeito!", "ótimo!") antes de pensar.
- Inflar escopo: entregar X + Y + Z quando pediram X.
- Recomendação travestida de pergunta (uma opção só, justificada longamente).
- Esquecer decisões cravadas após compactação de contexto.

---

## Decisões Cravadas

1. **Nome:** TACET, ancorado como "research engine from TMU" na 1ª menção.
2. **Endereço:** tacet.tmulab.org (demo); repo github.com/tmulab/tacet.
3. **Stack:** TypeScript/Next. Domínio puro OO; Next só na borda.
4. **Empacotamento:** app independente, repo próprio em github.com/tmulab,
   desde o 1º commit. NÃO entra no monorepo. Versão real (Java, no tmu-ecosystem)
   vem depois do concurso; simplificar agora não altera o plano futuro.
5. **Design espelhado:** nomes e fronteiras dos objetos = os da versão real.
6. **Modelo conceitual:** dois leitores INDECISOS (não advogados de posição).
   Substitui o modelo antigo de "simulacros que encarnam posições opostas".
7. **Três sinais:** convergência=núcleo robusto; divergência=crux; cadeira
   vazia=lacuna de cobertura na base de evidências.
8. **Perfil de confiabilidade:** 4 eixos JUSTAPOSTOS (nunca fundidos num escalar),
   com degradação graciosa (eixo não-medido se declara, não chuta).
9. **Tempo:** metadado na saída (camada descritiva sobre o mapa), nunca critério
   dentro do julgamento. Curva temporal/Weibull = trabalho futuro.
10. **Dois casos:** COVID (âncora, modelo da dúvida) + anticolonial (cadeira vazia
    como cobertura). Pipeline fala sozinho; sem linguagem de bandeira.
11. **Stub primeiro:** StubReader determinístico para o TDD; LlmReader (prompt)
    depois, atrás da interface Reader.
12. **Ordem desta sessão:** esqueleto + documentação primeiro (depois Claude Code
    preenche). Construção aqui em /home/claude; migra para GitHub/VPS depois.
13. **Método:** Akita v5 — TDD-first, strict total, Verificação Trilateral.
    Dia 11 adaptado (serviço sem auth/CRUD): "roda de clone limpo e produz a
    saída esperada sobre fixtures".
14. **Prioridade-mãe:** TEMPO DE TESTE acima de tudo.
15. **Backend dos readers (live):** SOMENTE OpenRouter gratuito. Z.AI removido
    (era reader A=glm-4.6 e o summarize). Par de readers de EMPRESAS DISTINTAS
    (independência inegociável, decisão #6): A=`nvidia/nemotron-3-nano-30b-a3b:free`
    (NVIDIA), B=`openai/gpt-oss-120b:free` (OpenAI); fallback=`google/gemma-4-26b-a4b-it:free`
    (Google, 3ª empresa). Summarize=`openai/gpt-oss-20b:free`. Ordem da fila
    rankeada por `bench/free-model-bench.mjs` sobre o prompt REAL do reader, com
    gabarito = lean concordado pelos dois readers de produção. O fixture v0.1
    congelado permanece atribuído a glm/minimax (proveniência histórica, NÃO
    reescrever). `max_tokens` do read = 2048 (nemotron-nano volta vazio com pouco).
16. **Cascata de modelos:** lib pura/portável em `src/llm/` — `cascade.ts`
    (`Cascade`: ordem→retry/backoff 429→pula morto→`validate()`) e `slots.ts`
    (`DistinctReaders`: slots por empresa distinta). Binding TACET em
    `src/llm/openrouter.ts` (`FREE_MODELS`, `openRouterTransport`,
    `resolveReaderSlots`). `summarize`=`Cascade`; `read`=`DistinctReaders([A,B],
    pool)`. Usuário seleciona A/B/C via `READER_A_/B_/FALLBACK_MODEL` (distintos
    por empresa, validado em runtime); o resto de FREE_MODELS vira cauda do pool.
    Semântica cravada (substitui "no máx. 1 reserva"): se ambos os primários
    falham, AMBOS os slots podem ser resgatados, desde que de empresas DISTINTAS;
    senão degrada pra um-leitor (contestação não-medida), nunca converge falso.

---

## Dados DIAMOND (nunca versionar / nunca tocar sem aprovação)

- Nenhuma credencial, chave de API, ou .env real. Só `.env.example`.
- Nenhum dado de produção do tmu-ecosystem. Nenhum corpus bruto de terceiros.
- Nenhum histórico .git do monorepo. Repo começa limpo.
- Fixtures = conjunto curado de claims (~20–30), derivado de fontes públicas,
  com ponteiros de proveniência (como chegar à fonte), não o conteúdo bruto.

---

## Erros técnicos documentados

- **tsx/esbuild trava no Windows ("The service was stopped" / hang sem saída).**
  Sintoma: `npm run demo:replay` fica pendurado; ao matar, esbuild loga
  "service was stopped". Causa: o binário nativo do esbuild fica num estado ruim
  após reinstalação parcial (ex.: `.bin/` regenerado mas esbuild não). Fix:
  `npm rebuild esbuild`. Verificação alternativa sem tsx: `tsc --outDir <tmp>
  --noEmit false` e rodar o `.js` emitido com `node` (imports já usam extensão
  `.js`, então o ESM do node resolve direto).

- **TLS MITM no Windows (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) em qualquer `fetch`.**
  Sintoma: proxy/antivírus intercepta o TLS; `fetchLLM` (summarize/read/protocol/
  llm:check) quebra; replay/offline não é afetado. **Fix (confirmado 2026-06-14,
  node v22.17):** rodar com `node --use-system-ca dist/<script>.js …` — o Node
  passa a confiar no cert store do Windows, que já tem o root CA do interceptador
  (flag disponível em node ≥22.15). Resolve TLS **e** o hang do tsx/esbuild de uma
  vez (roda o `dist/` compilado direto, sem tsx). É o caminho live padrão nesta
  máquina. NÃO usar `NODE_TLS_REJECT_UNAUTHORIZED=0` (inseguro) a não ser pra
  diagnóstico rápido. Alternativa sem a flag: `NODE_EXTRA_CA_CERTS=<ca.pem>`.
