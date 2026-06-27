# Data7 build optimization pipeline tasks

Este arquivo acompanha a implementação de `minify`, `uglify` agressivo e source maps do build Data7.

## Decisões fechadas

- `removeUnused` e `mergeNamespaces` sao subopcoes de `minify`.
- `uglify` deve ser agressivo desde o início: tudo que é declaração de usuário pode ser renomeado.
- APIs nativas do compilador/Data7 e símbolos da System Library não podem ser renomeados.
- Source map é requisito do pipeline, não recurso posterior.
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
- [x] Implementar `minify.removeUnused` por grafo global AST.
- [x] Implementar `minify.mergeNamespaces` para mesclar namespaces duplicados por modulo.
- [x] Implementar diretivas `@data7:keep`, `@data7:keep-name`, `@data7:entrypoint`.
- [x] Corrigir `stripComments` para preservar apostrofos e aspas escapadas dentro de strings.
- [ ] Implementar classificador de API nativa/System Library.
- [ ] Implementar alocador global de nomes para uglify agressivo.
- [ ] Reescrever referências globais de namespaces/classes/membros/tipos/imports.
- [ ] Reescrever variáveis locais/parâmetros com escopo correto.
- [ ] Emitir `.data7/build/*.map.json` e `*.uglify-map.json`.
- [ ] Cobrir flags isoladas e combinadas em testes.
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
        "removeUnused": false,
        "mergeNamespaces": false
      },
      "uglify": {
        "enabled": false
      }
    }
  }
}
```
