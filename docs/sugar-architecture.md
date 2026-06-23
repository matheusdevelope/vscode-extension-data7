# Arquitetura de sugars

Este documento define o contrato de implementação dos açúcares sintáticos da extensão. Ele complementa o `project_context.md` e é obrigatório para código novo ou refatorações em `src/project/`.

## Estrutura

`src/project/transpiler.ts` é somente a fachada pública. `src/project/transpiler-orchestrator.ts` coordena preprocessamento, parser, AST, generics e a execução ordenada dos plugins.

Cada sugar deve ter uma pasta própria em `src/project/sugars/plugins/<id>/`. Essa pasta é responsável por:

- parser hook, quando a sintaxe precisar estender a AST;
- transformação/serialização da feature;
- diagnósticos e payloads específicos;
- tipos, helpers e módulos utilitários exclusivos;
- testes de expansão, precedência, dependências e configuração.

`SugarRegistry` contém metadados, prioridade, dependências e utilitários. `SugarEngine` seleciona os IDs habilitados e constrói apenas os hooks necessários. Registry, engine e orquestrador não são destinos para implementação de regras de um sugar.

## Configuração e preservação

`enabled`, `enabledSugarIds` e `disabledSugarIds` são autoridade do `SugarEngine`. Um sugar desabilitado não pode consumir tokens, reescrever parcialmente uma linha ou perder texto. A sintaxe deve ser preservada como código opaco/verbatim, ou receber erro explícito quando não puder ser representada.

Todo novo sugar, ou alteração de um existente, deve testar:

1. expansão normal;
2. precedência e dependências;
3. `disabledSugarIds: [id]`;
4. `enabled: false`;
5. preservação de comentários, strings e finais de linha.

## Núcleo modular

- `parser.ts` é a fachada do parser; `expression-parser.ts` contém a gramática Pratt e `statement-parsers.ts` o controle de fluxo.
- `diagnostics.ts` orquestra passes; coletores, fluxo, diagnósticos estruturais, generics e helpers permanecem em módulos próprios.
- Transformadores compartilhados só podem conter traversal e composição. Ao identificar uma regra com ID de sugar próprio, extraia-a para `plugins/<id>/`.

Antes de concluir, execute `npm run test`, `npm run lint` e `npm run format:check`.
