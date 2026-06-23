# Guia operacional para agentes — vscode-extension-data7

Este arquivo resume as regras vigentes em `.cursor/rules/`. Em conflito, siga esta ordem: **segurança → arquitetura → domínio Data7 → VS Code → estrutura → TypeScript → testes → performance → padrões de código**. `git_workflow.mdc` é procedimental e sempre se aplica. Consulte também `project_context.md` e `docs/sugar-architecture.md` antes de mudanças arquiteturais.

## Decisão de delegação e subagentes

Quando o ambiente permitir e a política da sessão não proibir, dê preferência ao uso dos subagentes disponíveis.

- Se o prompt exigir explicitamente subagentes, delegação, leitura ou escrita paralela, use-os.
- Para tarefas complexas — múltiplos módulos independentes, refatoração ampla, auditoria seguida de implementação, investigação com testes, ou alteração que cruza camadas — delegue leitura/auditoria e implementação em paralelo sempre que isso reduzir risco ou tempo.
- Para tarefas médias, use um subagente quando uma revisão independente, mapeamento de impacto ou validação paralela aumentar a segurança da mudança.
- Para tarefas triviais, locais e não ambíguas (por exemplo, uma edição documental curta ou uma resposta factual), trabalhe diretamente; não crie subagentes apenas por formalidade.
- Delimite arquivos e responsabilidades para evitar conflito entre agentes. O agente principal integra, revisa o diff e executa a validação final.

## Arquitetura e responsabilidades

- Preserve a direção de dependências imposta por `eslint.config.mjs` e `governance.mdc`. `infra`, `utils` e `system-library` são folhas; `analysis` não importa UI; diagnostics não importa providers/services/project; providers não se importam mutuamente; MCP não importa `vscode` diretamente.
- O kernel de linguagem (`project/parser`, `ast`, `generics`, `sugars`) é puro, determinístico e isolado da API do VS Code. Providers adaptam AST/índice para UI; services orquestram I/O e comandos; MCP reutiliza parser, linter e indexador existentes por shim.
- Orquestradores são finos: `transpiler.ts`, `transpiler-orchestrator.ts`, `parser.ts`, `diagnostics.ts`, builders, providers e services não recebem regras semânticas novas. Extraia visitantes, analisadores, helpers e serializadores coesos.
- Use AST/contexto/índice para análise semântica. Regex sobre fonte Data7 só é permitido para trivia e diretivas de comentário/supressão, nunca para tipos, escopos, expressões ou fluxo.
- Reutilize implementações compartilhadas para XML, dependências, namespaces, trust, caminhos e módulos. Só `xml-helpers.ts` manipula `.7proj`; só `repository-service.ts` escreve no repositório privado.

## Açúcares sintáticos: isolamento obrigatório

- Cada sugar vive em `src/project/sugars/plugins/<id>/` e é dono de parser hook (quando necessário), transformação, diagnósticos, tipos, helpers, módulos utilitários e testes.
- `SugarRegistry` armazena metadados, prioridade e dependências. `SugarEngine` é a única autoridade de `enabled`, `enabledSugarIds` e `disabledSugarIds`. Transpiler e registry coordenam; não recebem implementação de sugar.
- Não acrescente uma regra identificável a um transformador agregado: extraia-a para o plugin próprio e conecte-a pelo orquestrador.
- Sintaxe de sugar desabilitado é **lossless**: deve permanecer verbatim/opaque ou gerar erro explícito. Nunca pode ser parcialmente consumida, reescrita ou descartada.
- Para cada sugar novo ou alterado, teste expansão, precedência/dependências, `disabledSugarIds`, `enabled: false`, comentários, strings e EOL.

## TypeScript, qualidade e documentação

- Mantenha `strict` e `noUncheckedIndexedAccess`; não os enfraqueça. Trate acessos indexados/capturas regex como possivelmente `undefined`; não introduza `any` quando `unknown`, união ou narrowing bastarem.
- Prefira `readonly`, tipos explícitos nas APIs públicas, exports nomeados, `import type`, uniões discriminadas e constantes canônicas para IDs, configurações e diagnósticos.
- Arquivos e funções devem ser focados, legíveis e nomeados pelo domínio. Não deixe código comentado, export inutilizado, catch vazio ou TODO sem dono/condição de remoção. Comentários técnicos em inglês; UI pode permanecer em português.
- Exceções e compatibilidade legada devem ser locais, nomeadas, justificadas, cobertas por teste e ter condição de remoção.
- Toda implementação/refatoração atualiza `CHANGELOG.md`, `project_context.md`, `README.md` e, quando aplicável, exemplos canônicos em `docs/example/`. Mantenha este arquivo sincronizado com `.cursor/rules/`.

## Domínio, VS Code, segurança e performance

- Trate `.bas`, `.7proj`, configurações e módulos externos como entrada não confiável. Valide shapes, normalize caminhos e mantenha escrita dentro da raiz autorizada.
- Operações de executor, repositório ou caminho controlado pelo usuário exigem Workspace Trust. Use argumentos explícitos em processos filhos, nunca shell interpolado; não exponha segredos, paths sensíveis ou saída bruta em notificações.
- Providers devem respeitar cancelamento, evitar reparse/reindex completo por tecla e usar cache/índice. Operações longas usam `withProgress`, cancelamento e I/O assíncrono.
- Registre comandos e providers uma única vez na ativação. Use `context.subscriptions` para disposables, `workspace.fs`/`Uri` para I/O do workspace e o logger compartilhado em vez de `console.log`.
- Diagnósticos possuem código estável e payload tipado; novos códigos usam `kebab-case`, supressão por comentário, exemplos e testes positivo/negativo. Quick fixes não rederivam semântica pela mensagem.

## Testes, validação e Git

- Use apenas `node:test` e `node:assert/strict`; testes espelham `src/`, isolam estado e usam o mock de VS Code quando necessário. Todo bug corrigido recebe regressão.
- Durante a iteração execute os checks relevantes. Antes de concluir mudança longa ou multiarquivo, rode `npm run verify`; para parser, linter, providers, builder, indexador e system library, rode ao menos `npm run test`.
- Se algum check não puder rodar, declare isso explicitamente. Não conclua com falha conhecida sem informar o usuário.
- Não crie branch, commit, push ou PR sem solicitação explícita. Trabalhe na branch atual por padrão.
