<!--
status: Accepted
author: matheusdevelope
created: 2026-07-31
updated: 2026-07-31
supersedes: -
superseded-by: -
-->

# LSP-001 — Language Server para o motor de análise Data7

## 1. Resumo executivo

Extrair o motor de análise (parse → índice → lint → providers de linguagem) para um processo
separado via **Language Server Protocol**, no pacote `@data7/lsp`, consumido pela extensão
através de `vscode-languageclient`. O objetivo é tirar o trabalho pesado do extension host
(modelo `tsserver`), eliminando travamentos da IDE e habilitando _pull diagnostics_ e sync
incremental de documento.

Este RFC justifica as três dependências de runtime novas e define as fronteiras de import
antes da implementação (requisito de `project_stack.mdc`).

## 2. Motivação

A Fase 1 do plano em `REFACTOR-ANALYSIS-ENGINE.md` corrigiu invalidação e agendamento **dentro**
do extension host. A Fase 2 introduziu `AnalysisHost` como fronteira headless. Mesmo assim, o
lint e a resolução de tipos ainda competem com a UI pelo mesmo event loop.

Mover a análise para um processo LSP:

- Isola CPU/memória do host da extensão.
- Permite cancelamento e fatias de trabalho sem afetar digitação.
- Abre caminho para _pull diagnostics_ (LSP 3.17), que resolve staleness estruturalmente.
- Reutiliza o mesmo `@data7/core` já usado por CLI e MCP.

## 3. Dependências justificadas

| Pacote | Onde | Papel |
| --- | --- | --- |
| `vscode-languageserver` | `@data7/lsp` | Implementação do servidor (stdio) |
| `vscode-languageserver-textdocument` | `@data7/lsp` | Buffer com sync incremental |
| `vscode-languageclient` | `vscode-extension-data7` | Cliente no extension host |

Nenhuma outra dependência de runtime é introduzida. O bundling segue o padrão do MCP
(`esbuild` → arquivo único `server.bundled.js`).

## 4. Arquitetura

```
packages/data7-lsp/          # processo Node (stdio)
  src/server.ts              # initialize, capabilities, wiring
  src/host.ts                # AnalysisHost sobre a API do LSP
  src/documents.ts           # sync TextDocument → AnalysisProgram
  src/diagnostics/           # publishDiagnostics (+ pull depois)
  src/handlers/              # requests por feature (Fase 4+)

packages/data7-vscode/
  src/services/language-server-service.ts   # LanguageClient
```

O servidor **só** importa `@data7/core` e as libs LSP. Não importa `providers/`, `services/`
nem `vscode` da extensão.

Configuração chega em `initializationOptions.settings` (`Data7Configuration`) **antes** de
qualquer indexação — o mesmo cuidado já aplicado em MCP/CLI.

## 5. Rollout

Flag `features.diagnostics.useLanguageServer` (default `false`):

1. **Fase 3 (este RFC):** servidor sobe, sync de documentos, `publishDiagnostics` básico.
2. **Fase 4:** migração gradual dos providers de leitura, com toggle A/B.
3. **Fase 5:** pull diagnostics e lint de workspace pelo protocolo.
4. Default `true` só após métricas de §10 do plano estabilizarem.

Com a flag desligada, a extensão mantém exatamente o caminho atual (`DiagnosticService` +
providers locais).

## 6. Fronteiras de import (governance)

- `@data7/lsp` pode depender de `@data7/core` e das libs LSP; não pode importar
  `packages/data7-vscode`.
- `packages/data7-vscode` pode depender de `vscode-languageclient` e lançar o bundle do LSP;
  não deve importar o código-fonte do servidor (só o binário empacotado).
- Providers migrados deixam de ser registrados no cliente quando a feature correspondente
  estiver ativa no servidor (Fase 4).

## 7. Riscos e rollback

| Risco | Mitigação |
| --- | --- |
| Divergência de diagnósticos host vs servidor | Flag off = caminho legado; mesmos testes de exemplos |
| Startup lento do processo | Indexação em background; progresso via log |
| Bundling incompleto | Mesmo pipeline do MCP; smoke test no CI |

Rollback: `features.diagnostics.useLanguageServer: false`.
