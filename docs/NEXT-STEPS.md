# Próximos passos (para o Claude Code)

Estado: esqueleto + contratos documentados + testes TDD em RED (implementações pendentes).

## Ordem de implementação (TDD-first, Akita)
1. **buildConvergenceMap** (`src/domain/convergence.ts`) — fazer os 6 testes de
   `tests/convergence.test.ts` passarem (RED→GREEN). Não mexer nos testes.
2. **shouldAbstain** — escrever testes primeiro, depois implementar.
3. **auditCoverage** (`src/domain/coverage.ts`) — testes primeiro (empty chair,
   baseline citado, descritivo-não-conclusivo), depois implementar.
4. **ReliabilityProfile builder** — montar os 4 eixos a partir de claims +
   convergence map + grafo de proveniência; degradação graciosa por eixo.
5. **StubReader** (`src/readers/`) — leitor determinístico a partir de fixture.
6. **Pipeline** (`src/pipeline/run-replay.ts`) — orquestra ingest→2 readers→
   map→audit→profile sobre `fixtures/`. Alvo: clone limpo → roda em ~5 min.
7. **Fixtures** — conjunto curado ~20–30 claims do caso COVID, com proveniência.
8. **LlmReader** — só depois do replay verde. Prompt atrás da interface Reader.
9. **Camada temporal** (saída descritiva sobre o mapa) + **Next UI** (borda).

## Invariáveis (do CLAUDE.md — não renegociar)
- TDD-first; strict total; OO no miolo, funcional na borda.
- Leitores INDECISOS; certificam coerência, nunca verdade.
- Perfil = 4 eixos justapostos, nunca fundidos; degradação graciosa.
- Tempo = metadado na saída, nunca critério no julgamento.
- Nada de credencial/dado de produção/corpus bruto no repo.
