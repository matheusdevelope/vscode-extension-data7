# Data7 build optimization pipeline tasks

Este arquivo acompanha a implementação de `minify`, `prune` por declaração, `uglify` agressivo e source maps do build Data7.

## Decisões fechadas

- Remoção semântica vive em `build.optimization.prune` (não em `minify`).
- Cada unidade de poda é chaveável em `prune.remove.*` (namespaces, classes, methods, …).
- `minify` é só textual (`stripComments`, `collapseWhitespace`); default de `collapseWhitespace` é `false`.
- `uglify` deve ser agressivo: declarações de usuário podem ser renomeadas; System Library / `@data7:keep-name` não.
- Source map é requisito do pipeline, não recurso posterior.
- Ordem fixa: `prune → minify → uglify`.
- O build original/debug deve continuar disponível para abrir e debugar na IDE nativa.

## Backlog

- [x] Criar task tracker versionado.
- [x] Criar contrato tipado de opções `build.optimization`.
- [x] Manter compatibilidade com `opcoes.minify` e `opcoes.stripComments`.
- [x] Incluir opções de otimização no snapshot/cache de build.
- [x] Criar contratos base de source map Data7.
- [ ] Adicionar comandos separados para build/run/open original e otimizado.
- [ ] Gerar saídas separadas para variantes original, run e otimizada.
- [ ] Criar source map Data7 com segmentos e mapa de símbolos.
- [ ] Compor source map de transpile/sugars/generics com otimizações.
- [x] Migrar minify atual para `src/project/optimizer/minify`.
- [x] Implementar `prune` por fechamento a partir de Principal (namespaces).
- [x] Implementar `prune` por declaração com flags `remove.*`.
- [x] Isolar `minify.collapseWhitespace` (default off).
- [x] Stub `uglifyBuildModules` no Builder.
- [x] Implementar diretivas `@data7:keep`, `@data7:keep-name`, `@data7:entrypoint`.
- [x] Corrigir `stripComments` para preservar apostrofos e aspas escapadas dentro de strings.
- [ ] Implementar classificador de API nativa/System Library.
- [ ] Implementar alocador global de nomes para uglify agressivo.
- [ ] Reescrever referências globais de namespaces/classes/membros/tipos/imports.
- [ ] Reescrever variáveis locais/parâmetros com escopo correto.
- [x] Isolar motor de reachability em `analysis/declaration-reachability` e expor `unused-code` no linter (`unreachable-declaration` fica para fluxo morto).
- [x] Prune efetivo no Builder via o mesmo motor (`pruneBuildModules` → `analyzeDeclarationReachability`), com parse parcial e teste de paridade com `unused-code`.
- [ ] Aplicar prune visual/feedback contínuo no editor além do warning (opcional UI).
- [x] Flag `localVariables` (DCE intra-procedimento de `Dim`/`Const` locais sem uso e sem efeito colateral).
- [ ] Emitir `.data7/build/*.map.json` e `*.uglify-map.json`.
- [x] Cobrir flags isoladas e combinadas em testes do optimizer.
- [x] Atualizar README, CHANGELOG, project_context e exemplos canônicos.

## Configuração alvo

```json
{
  "build": {
    "optimization": {
      "sourceMap": true,
      "minify": {
        "enabled": false,
        "stripComments": true,
        "collapseWhitespace": false
      },
      "prune": {
        "enabled": false,
        "report": false,
        "strategy": "principal-closure",
        "alwaysInclude": [],
        "remove": {
          "namespaces": true,
          "classes": true,
          "structures": true,
          "enums": true,
          "delegates": true,
          "methods": true,
          "declareMethods": true,
          "fields": true,
          "properties": true,
          "consts": true,
          "variables": true,
          "unusedImports": true,
          "localVariables": true
        }
      },
      "uglify": {
        "enabled": false
      }
    }
  }
}
```
