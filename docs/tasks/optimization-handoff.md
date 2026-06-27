# Handoff: build optimization pipeline

Este arquivo resume o planejamento e o estado atual da implementacao de `minify`, `minify.removeUnused`, `uglify` agressivo e source maps. Use junto com `docs/tasks/optimization-pipeline.md`, que funciona como checklist incremental.

## Objetivo

Adicionar ao build Data7 um pipeline chaveavel de otimizacao sem perder a capacidade de gerar o projeto original/debug para abrir na IDE nativa.

O pipeline alvo:

```text
source .bas
 -> sugars/generics
 -> AST normalizada
 -> minify.removeUnused
 -> uglify global agressivo
 -> serialize com source map
 -> minify textual/final preservando source map
 -> .7Proj
```

## Decisoes conceituais

- `removeUnused` e subopcao de `minify`.
- `uglify` deve ser agressivo desde o inicio.
- Tudo que for declaracao de usuario pode ser renomeado no `uglify`.
- APIs nativas do compilador/Data7 e simbolos da System Library nao podem ser renomeados.
- Source map e requisito estrutural para debug do recurso, nao etapa opcional posterior.
- Build original/debug deve continuar disponivel.
- Builds otimizados devem ter saida separada para nao sobrescrever a variante usada no Developer Studio.

## Configuracao alvo

```json
{
  "build": {
    "optimization": {
      "sourceMap": true,
      "minify": {
        "enabled": false,
        "stripComments": true,
        "removeUnused": false
      },
      "uglify": {
        "enabled": false
      }
    }
  }
}
```

Compatibilidade legada mantida:

```json
{
  "opcoes": {
    "minify": false,
    "stripComments": false
  }
}
```

## Estado implementado

- `docs/tasks/optimization-pipeline.md` criado como tracker.
- `src/project/optimizer/optimization-options.ts` criado com contrato tipado de `build.optimization`.
- Compatibilidade com `opcoes.minify` e `opcoes.stripComments`.
- `BuildProjectOptions` aceita `optimizationOptions` e `optimizationOverride`.
- `BuildSnapshotOptions` inclui `optimizationOptions` e `optimizationOverride`.
- `src/project/optimizer/minify/minifier.ts` recebeu o minify textual antigo que estava no `Builder`.
- `Builder` delega minify textual para `optimizer/minify`.
- `src/project/source-map/` tem contratos base de source map e builder inicial de segmentos.
- `src/project/optimizer/minify/remove-unused.ts` implementa o primeiro passe de `minify.removeUnused`.
- `Builder` chama `removeUnusedDeclarations` somente quando `build.optimization.minify.removeUnused` esta ativo.
- `DependencyScanner.stripComments` e `optimizer/minify` preservam apostrofos e aspas escapadas dentro de strings.
- `Builder` nao aplica `minify.stripComments` quando `minify.enabled` esta desligado; `opcoes.stripComments` legado continua funcionando quando nao ha bloco novo de minify.
- README, CHANGELOG, `project_context.md` e exemplos canonicos foram atualizados.

## Estado do removeUnused

O passe atual e propositalmente AST/global e com fallback seguro:

- Entrada: lote de modulos ja transpilados.
- Raizes: `Principal.bas`, metodo `Main` e referencias encontradas em codigo top-level.
- Marca containers necessarios: namespace e classe dona de declaracao viva.
- Marca construtores `Sub New` de classes vivas.
- Preserva declaracoes marcadas por `@data7:keep`, `@data7:keep-name`, `@data7:entrypoint` ou `@data7:external-api` na linha de comentario imediatamente anterior.
- Remove classes, metodos, propriedades, campos, delegates, variaveis top-level e enums nao alcancados.
- Se qualquer modulo do lote tiver erro de parse, retorna os codigos originais sem podar.
- Linhas opacas sao tokenizadas para coletar identificadores como referencias, reduzindo risco de remocao indevida.

Limitacoes conhecidas do removeUnused atual:

- Ainda nao entende contratos externos, eventos por nome, reflexao ou chamada por string.
- Ainda nao consulta System Library para diferenciar com precisao chamadas nativas versus usuario.
- Ainda nao emite relatorio/mapa de simbolos removidos.

## Proximas etapas recomendadas

1. Adicionar comandos separados:
   - `Data7: Compilar Original`
   - `Data7: Compilar Otimizado`
   - `Data7: Executar Original`
   - `Data7: Executar Otimizado`
   - opcional: `Data7: Abrir no DevStudio Original/Otimizado`

2. Gerar saidas separadas:
   - original: `<Projeto>.7Proj`
   - run/debug: `.data7/run/<Projeto>.run.7Proj`
   - otimizado: `.data7/build/<Projeto>.optimized.7Proj`

3. Implementar source map real:
   - `.data7/build/<Projeto>.optimized.7Proj.map.json`
   - segmentos gerado -> original
   - mapa de simbolos original -> gerado
   - composicao com lineMap do transpiler/sugars/generics
   - preservacao depois do minify final

4. Implementar classificador nativo:
   - keywords
   - tipos primitivos
   - namespaces/classes/membros da System Library
   - simbolos do compilador Data7

5. Implementar `uglify` agressivo:
   - alocador global de nomes
   - namespaces de usuario
   - classes/structures/enums/delegates
   - metodos/funcoes/subs
   - propriedades/campos
   - variaveis globais/top-level
   - parametros e variaveis locais
   - reescrita de imports e referencias cruzadas
   - emissao de `*.uglify-map.json`

6. Melhorar `removeUnused`:
   - preservar entrypoints externos
   - registrar simbolos removidos no source map/relatorio
   - adicionar mais fixtures com heranca, eventos, generics e dependencias.

## Validacoes executadas na ultima sessao

- `npm run compile`: passou.
  - Avisos conhecidos: pasta `docs/Documentacao Data7` nao encontrada pelo script de artigos; warning de case-sensitive import em prompt MCP `tenum-pattern`.
- `node --test out/test/project/optimizer/minifier.test.js out/test/project/optimizer/optimization-options.test.js out/test/project/optimizer/remove-unused.test.js`: passou.
- `node --test out/test/project/builder.test.js out/test/analysis/dependency-scanner.test.js`: passou.
- `git diff --check`: passou.
- `npm run format:check`: falhou apenas em arquivo fora do escopo no momento: `src/services/workspace-fix-service.ts`.

## Arquivos principais alterados/criados

- `docs/tasks/optimization-pipeline.md`
- `docs/tasks/optimization-handoff.md`
- `src/project/optimizer/optimization-options.ts`
- `src/project/optimizer/minify/minifier.ts`
- `src/project/optimizer/minify/remove-unused.ts`
- `src/project/source-map/data7-source-map.ts`
- `src/project/source-map/source-map-builder.ts`
- `src/project/builder.ts`
- `src/project/build-cache.ts`
- `src/project/build-snapshot.ts`
- `src/project/project-metadata.ts`
- `src/test/project/optimizer/optimization-options.test.ts`
- `src/test/project/optimizer/remove-unused.test.ts`
- `src/test/project/builder.test.ts`
