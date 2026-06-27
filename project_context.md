# Contexto e Arquitetura do Projeto: vscode-extension-data7

O parser/linter aceita propriedades indexadas com multiplos argumentos em colchetes, como `Grid.Cells[0, 1]`. Essa forma e resolvida pela aridade e tipos da propriedade indexada, equivalente ao acesso com parenteses, e nao deve emitir erro sintatico ou `unknown-member`. Argumentos complexos tambem sao aceitos, como `Grid.Cells[1, (Grid.Row + 1_)]`; nesse caso, se `_` foi usado como marcador de continuacao sem uma quebra de linha efetiva, o linter emite `line-continuation-without-break` e o Quick Fix remove apenas o marcador. Metodos e funcoes nao aceitam colchetes; alem de properties indexadas, apenas arrays e matrizes nativas podem usar `[]`.

O resolvedor de tipos considera variaveis declaradas no escopo superior como globais de projeto, com prioridade para `Principal.bas`; isso cobre usos legados como `_usuario.CodEmpresa` e `_modeloOperacaoConciliacao.CodCadastroOperadora` em outros arquivos. A escolha de overloads usa aridade e compatibilidade dos tipos dos argumentos, evitando selecionar o primeiro overload por quantidade de parametros quando os tipos diferem.

> **Contrato vigente de modularização:** consulte [`docs/sugar-architecture.md`](./docs/sugar-architecture.md) e [`AGENTS.md`](./AGENTS.md). O transpiler é apenas fachada/orquestração; cada sugar deve ser isolado em `src/project/sugars/plugins/<id>/`, com parser, transformação, diagnósticos, tipos e utilitários próprios. `SugarEngine` é a única autoridade de ativação, e sintaxe de sugar desabilitado deve ser preservada sem perda.

Este documento consolida o contexto de negócio, regras conceituais, objetivos, arquitetura de software e definições técnicas da extensão VS Code para a linguagem/plataforma do ERP Data7. Ele serve como a **única fonte de verdade conceitual e arquitetural** da extensão para guiar desenvolvimentos futuros.

> **Especificação da linguagem-alvo**: a referência sistemática do Data7 Basic — sintaxe, tipos, classes, generics, açúcares, limitações, diagnostic codes — vive em [`docs/linguagem-basic/`](./docs/linguagem-basic/README.md). Esse documento (`project_context.md`) cobre arquitetura **da extensão**; aquela pasta cobre a linguagem para a qual transpilamos.

---

Os Quick Fixes de `return-unrecommended` usam a linha atual do documento: um `Return` fora de condicional vira apenas atribuicao ao alvo do metodo/propriedade, enquanto retornos em condicionais tambem recebem o `Exit` correspondente. Dentro de `Catch`, Function/Property preservam `Return`; quando o retorno por atribuicao e usado ali, `return-assignment-in-catch` emite warning e oferece troca para `Return`. O Quick Fix de `missing-mybase-free` insere `MyBase.Free()` imediatamente antes de `End Sub`, preservando todas as liberacoes de recursos anteriores. O Quick Fix de `missing-then` insere a palavra-chave no fim da expressão, antes dos espaços de alinhamento e do comentário inline, e deduplica diagnósticos equivalentes durante correções em massa.

Os recursos opcionais da extensão são agrupados em `data7.features`: `language.generics` e `language.sugars` controlam as extensões de linguagem; `diagnostics.enabled` controla o linter e `diagnostics.lintWorkspaceOnStartup` controla somente a varredura inicial (os comandos manuais permanecem disponíveis quando o linter está ativo); `workspace` controla detecção de `.7proj` e instalação automática do MCP; `save` controla auto-fix e auto-format; `build.autoFixBeforeBuild` habilita opcionalmente o auto-fix incremental antes de build, execução e abertura no Developer Studio; `preview.enabled` controla a prévia transpilada. O auto-fix pré-build fica desligado por padrão para preservar a responsividade de projetos grandes; o comando explícito de correção continua percorrendo o workspace inteiro. Desativar generics impede monomorfização, diagnósticos e símbolos sintéticos, mas a sintaxe continua sendo parseada para preservar o código durante a serialização.

O parser estrutural preserva arrays nativos de tamanho fixo do PaxCompiler/Data7 Basic em declarações de campo e variáveis locais, como `Private _containers(10) As Container` e `Dim _matrix(10, 5) As Integer`. Essa sintaxe é tratada como recurso nativo da linguagem-alvo, separada do sugar de listas `[]`, e o serializer reemite as dimensões antes do `As`.

O pipeline de build mantÃ©m snapshots persistentes em `.data7/build-cache/` e pula o empacotamento quando as entradas (`src/`, `data7_modules/`, `data7.json`, opÃ§Ãµes de transpile/logger) e o `.7Proj` de saÃ­da continuam idÃªnticos. Em rebuilds incrementais, o `Builder` reutiliza resultados de transpile por arquivo quando o conteÃºdo e a assinatura pÃºblica global nÃ£o mudaram. A execuÃ§Ã£o via F5 usa uma saÃ­da dedicada em `.data7/run/*.run.7Proj` para que a variante com logger nÃ£o sobrescreva o `.7Proj` standard aberto pelo Developer Studio.

O contrato novo de otimizacao vive em `data7.json#build.optimization`: `minify.enabled`, `minify.stripComments`, `minify.removeUnused`, `uglify.enabled` e `sourceMap`. `removeUnused` e subopcao de minify; `uglify` e um passe agressivo de renomeacao global preparado para transformar declaracoes de usuario, preservando APIs nativas/System Library e futuras diretivas explicitas de keep. `opcoes.minify` e `opcoes.stripComments` permanecem como compatibilidade legada. As opcoes de otimizacao fazem parte da chave do snapshot de build para evitar reuso de saidas geradas em outro modo.

O passe inicial de `minify.removeUnused` vive em `src/project/optimizer/minify/remove-unused.ts`. Ele roda somente quando `build.optimization.minify.removeUnused` esta ativo, analisa o lote global de modulos transpilados via AST, usa `Principal.bas`/`Main` e referencias de codigo como raiz, preserva containers necessarios, respeita diretivas `@data7:keep`/`@data7:keep-name`/`@data7:entrypoint`/`@data7:external-api` no comentario imediatamente anterior e abandona a poda quando qualquer modulo nao puder ser parseado com seguranca. A remocao de comentarios do minify usa scanner consciente de strings para preservar SQL, PowerShell e literais com aspas escapadas.

Quando o VS Code nao preserva `Diagnostic.data`, o Quick Fix de `return-unrecommended` recupera o alvo e o contexto condicional pela estrutura do documento; ele nao depende de texto localizado da mensagem.

## 1. Objetivos do Projeto

As correções automáticas de sintaxe/estilo reutilizam o mesmo contrato de `source.fixAll.data7` no save, no comando `data7.fixAllWorkspace` e, quando `data7.features.build.autoFixBeforeBuild` está ativo, no pipeline de build/execução. O caminho pré-build mantém fingerprints por workspace e só reavalia arquivos `.bas` alterados desde a última passagem; ele não é habilitado por padrão. O comando `data7.fixAllWorkspace` resolve dinamicamente a primeira correção rápida (Quick Fix) aplicável a cada diagnóstico do projeto (ignorando ações de supressão) e sempre percorre o projeto completo.

O linter live acompanha arquivos físicos locais com esquema `file` que estejam abertos no editor: na ativação ele reanalisa os `.bas` já abertos, em alterações/saves atualiza o arquivo correspondente, e ao fechar ou excluir o arquivo remove seus diagnósticos live da aba Problemas. A análise do workspace inteiro é carregada pelo comando `data7.runLinter` e também no startup quando `data7.features.diagnostics.lintWorkspaceOnStartup` está habilitado; seus diagnósticos de arquivos fechados permanecem no painel Problems até nova análise, limpeza explícita ou alteração/remoção do arquivo. Ao concluir, o comando manual exibe uma notificação informativa com o resumo dos diagnósticos e botões para executar correções em massa ou reiniciar a análise.

O `DependencyService` mantém `data7.json#dependencies` e `data7_modules/` sincronizados com o grafo atual do projeto. Saves, criação, deleção e rename de arquivos `.bas` agendam uma reavaliação debounced: se um namespace antes suprido por `src/` desaparece ou muda, a dependência global equivalente passa a ser declarada e copiada; se uma dependência deixa de ser referenciada, ela é removida da lista e da pasta gerada. Esse refresh reindexa apenas `data7_modules/` e atualiza diagnósticos abertos, sem rebuild completo.

A deteccao de dependencias deve consumir a AST do parser para `Imports`, tipos qualificados e acessos `Namespace.Membro`; strings, comentarios, `OpaqueStatement` e nomes declarados no proprio arquivo nao podem promover modulos em `data7.json`. Modulo nao segue convencao `mod_*`: o identificador e o namespace exato, e um namespace so vira modulo de repositorio quando estiver marcado com o comentario `'@Module` imediatamente antes do `Namespace`.

Na mesma coleta AST, acessos abreviados de `With` representados como `.Membro` nao produzem referencia de modulo: o alvo vazio gerado pelo parser e descartado antes de alimentar `module-not-found`.

Classes e namespaces da System Library tambem devem encerrar a validacao de modulo implicito: `TFile.Exists(...)`, `TPath.GetTempPath(...)` e `File.ExtractName(...)` sao chamadas estaticas nativas, nao dependencias de repositorio. `System.IOUtils.TFile`, `System.IOUtils.TPath` e o alias qualificado `IO.File.ZipFile` estao modelados como simbolos de sistema para manter hover, autocomplete e linter no mesmo caminho de resolucao.

Os diagnostics devem reconhecer imports transitivos de modulos utilizados, promocoes numericas sem perda e APIs globais legadas registradas na System Library, como `dateUtils.toStringFormat(...)`.

Quick Fixes devem normalizar o codigo do diagnostico recebido do VS Code antes do despacho, pois ele pode ser uma string ou um objeto com a propriedade `value`. Adicionalmente, devem prever fallbacks robustos por payload tipado, AST ou tokens do documento caso o payload `data` seja omitido pelo VS Code.

O objetivo principal desta extensão é fornecer suporte completo de desenvolvimento (Language Server Features) no VS Code para desenvolvedores do ERP Data7, editando arquivos de script `.bas` (Data7 Basic) e manipulando arquivos de projeto `.7proj` (formatados em XML).

A extensão provê recursos avançados de:

- Indexação e busca de símbolos no Workspace.
- Autocompetação de código inteligente (IntelliSense) com auto-importação.
- Validação estática de regras de importação e escopos (Advanced Diagnostics/Linter).
- A resolução de símbolos do linter deve consultar o `WorkspaceSymbolIndexer` com o `contextFileUri` atual para respeitar `Imports` ativos antes de concluir que um identificador está ausente ou que um `Imports` não foi usado.
- Instanciações `New Tipo` sem `()` são aceitas pelo parser para compatibilidade, mas o linter as rebaixa para o warning `object-creation-parentheses-missing`, com Quick Fix para inserir os parênteses vazios.
- Navegação de código (Hover previews, Go to Definition, Signature Help).
- Formatação de código.
- Compilação e empacotamento (`Builder`) e descompilação (`Decompiler`) de projetos ERP.

A árvore de fontes e o arquivo `.7proj` seguem um fluxo manual: use os comandos de decompor e compilar/rebuildar quando quiser propagar alterações. Não há sincronização automática, evitando concorrência entre gravações.

---

## 2. Definições Técnicas e Conceituais

### 2.1. Arquivos `.bas` e `.7proj`

- **`.bas`**: Arquivos de script contendo a codificação em Data7 Basic. Podem declarar namespaces, classes, estruturas, métodos, variáveis locais, atributos globais e declarações `Declare Sub` / `Declare Function` de DLLs (preservadas verbatim como `OpaqueStatement`).
- **`.7proj`**: Arquivo XML de projeto estruturado que contém metadados, formulários e todos os scripts `.bas` agregados do projeto do ERP.

Os módulos core são sincronizados para `data7_modules/` junto com o projeto. O logging desse runtime é centralizado em `mod_logger`; `TEnum` deriva de `TTObject` para uso seguro em listas, e a serialização de valores trata `TDateTime`, `TTObject` e objetos nativos pelo seu tipo concreto. O módulo legado `mod_console` não faz parte desse conjunto.

### 2.7. Açúcares sintáticos transpilados

A linguagem nativa do ERP é limitada (`For` clássico apenas, sem string interpolation, sem condicional inline). A extensão adiciona **açúcares opcionais expandidos pelo `Builder` antes da serialização do `.7proj`**. O `.bas` em `src/` permanece com o açúcar; só o XML final recebe a forma nativa.

A arquitetura distingue dois tipos de transformação em `src/project/transpiler.ts`:

- **`InlineTransform`**: rewriters intra-linha (token-level) que rodam ANTES do registry. Use para açúcares que aparecem em qualquer coluna (ex.: string interpolation).
- **`SugarRule`**: rules linha-por-linha que produzem expansões multi-linha. Use para açúcares "header" como `For Each ... In ... Next`.
- O parser estrutural normaliza as duas formas equivalentes de ramificação condicional: `ElseIf <cond> Then` e `Else If <cond> Then`.
- O serializer preserva statements estruturados em condicionais inline, incluindo `Throw New Exception(...)`; a inferência de concatenação consulta os tipos declarados na AST e no catálogo de símbolos antes de aplicar conversões.

**Açúcares Complexos e Namespaces Utilitários**:
Todo açúcar complexo que necessita de utilitários comuns a mais de uma materialização deve colocá-los em um namespace específico (ex: `core_sugars_list` contendo `CoreSugarBaseList`). Quando a implementação concreta já existe em um módulo compartilhado, o sugar a importa diretamente.

- O sugar materializa a lógica final/classe específica no local declarado (ex: a classe `Color` gerada pelo sugar `Enun Color` herda de `TEnum`, importado de `mod_tenum`). A forma `Enum Color` é enum nativa do compilador e deve ser preservada.
- O transpiler injeta automaticamente o respectivo `Imports <namespace>` no topo do arquivo que utiliza o sugar.
- A base utilitária e as dependências entre sugars (ex: `enum` dependendo de `list`) são registradas no `SugarRegistry` (`src/project/sugar-registry.ts`).
- Durante o build, as dependências são resolvidas transitivamente e os módulos utilitários virtuais correspondentes são gerados, indexados (para passar no linter estrito) e injetados na compilação final sob o XML do `.7proj`.
- Para evitar erros de linter e navegação no editor, esses módulos virtuais também são pré-indexados automaticamente pelo `WorkspaceSymbolIndexer` em runtime.

Açúcares atualmente suportados:

#### `For Each <var>[ As <Tipo>] In <expr> ... Next` (enumerable)

- Para qualificar como iterável, o tipo de `<expr>` deve expor `Count As Integer` + um acessor inteiro (precedência `Items` > `Item` > `Strings` > `Objects`).
- A expansão emite `For __idxN = 0 To <src>.Count - 1` + um `Dim` sintético do elemento, materializando `__srcN` se `<expr>` for complexa.
- Detector pure em `src/analysis/enumerable-detector.ts`, consumido pelo transpilador E pelo linter.

#### `For Each <var>[ As Integer] In <start>..<end>` (range)

- Açúcar para `For <var> = <start> To <end>`. Resolução puramente sintática (não consulta tipos).
- Registry-ordered ANTES do generic For Each para evitar que `0..N` seja interpretado como tipo enumerável.
- O `As Integer` explícito é aceito para documentação, mas o `For` nativo não tem binding tipado.

#### `$"Hello {name}, idade {age}"` (string interpolation)

- Expandido para `"Hello " & (name) & ", idade " & (age)` usando `&` (operador Basic canônico).
- Chaves escapadas via `{{` / `}}`. Strings regulares `"..."` e comentários `'...` são preservados verbatim.
- Diagnóstico `invalid-interpolation` (warning) quando malformado: `unterminated-string`, `unterminated-brace`, ou `empty-expression`.
- Parser puro em `src/utils/interpolation.ts` — única fonte de verdade compartilhada por `transpiler.ts` (build) e `diagnostics.ts` (linter live).

#### `cond ? a : b` (ternary em RHS de assignment)

- Expandido para o bloco multi-linha `If cond Then / target = a / Else / target = b / End If` — o Data7 não tem função condicional inline (`IIf`/`Choose`/`Switch` ausentes na System Library), então a forma idiomática nativa é o bloco. Confirmado nos exemplos oficiais de `docs/Documentação Data7/Global/TJSONObject/TJSONObject.Has.html`.
- **Apenas no RHS de assignment** é suportado: `Dim x [As T] = c ? a : b`, `x = c ? a : b`, `obj.prop = c ? a : b`. Qualquer outro contexto (`Print c ? a : b`, `Return c ? a : b`, dentro de chamada de método) emite `ternary-context-unsupported` (warning) e a linha permanece intacta — esses casos requerem refator manual porque a expansão multi-linha mudaria a estrutura visível do código.
- O `Dim`, quando presente, é emitido **separadamente** do bloco `If/Then/Else` para que ambas as branches consigam atribuir ao mesmo target. Comentários inline trailing são reatachados ao `If` header.
- Parser puro em `src/utils/ternary.ts` (`findTopLevelTernary`) — respeita strings `"..."`, interpoladas `$"..."`, comentários `'...` e profundidade de parênteses; encontra a `?`/`:` outermost correta mesmo em ternários aninhados.

#### `??` / `??=` / `||=` / `&&=` (logical assignment + null coalescing)

- `Dim x = a ?? b` expande para `Dim x / If a = NULL Then x = b Else x = a / End If`. LHS complexa é materializada em `__srcN`. Diagnostic: `null-coalesce-context-unsupported` quando o `??` aparece fora de assignment RHS.
- `x ??= y` / `x ||= y` / `x &&= y` expandem para `If <cond> Then x = y / End If` com o teste apropriado (`x = NULL`, `Not x`, `x`).

#### `?.` (optional chaining)

- `Dim x = obj?.Prop` → `Dim x / If obj <> NULL Then x = obj.Prop / End If`. Surfaces suportadas: assignment RHS e chamada-statement (`obj?.Free()`).
- Diagnostics: `optional-chain-context-unsupported`, `optional-chain-too-deep` (cap em 3 tokens).
- Parser em `src/utils/optional-chain.ts`.

#### `Numeric separator` (`1_000_000`)

- InlineTransform que remove `_` entre dígitos em literais numéricos (Integer e Double). Preserva identificadores `__src0` e strings `"a_b"`.

#### `New T() With { .X = v, .Y = w }` (object initializer)

- `Dim p = New T() With { .X = 1 }` → `Dim p = New T() / With p / .X = 1 / End With`. Splitting de inicializador respeita strings + parens.

#### `Using x As New T(args) / ... / End Using` (multi-line)

- Expandido para `Dim x = New T(args) / Try / body / Finally / x.Free() / End Try`. Multi-line rule consome até o `End Using`.
- Diagnostic: `using-non-disposable` quando o tipo não expõe `Free`/`Dispose` na cadeia.

#### `Dim x As New T` (auto-new sem `()`)

- Açúcar para `Dim x As T = New T()`. Funciona com tipos monomorfizados pelo generics-pass (`Dim list As New TList<Product>` vira `Dim list As TList_Product = New TList_Product()`).
- Diagnostic: `auto-new-non-default-ctor`.

#### `Class T<T>` + `Delegate <T>` + `Sub Foo<T>` (generics — dois pipelines)

- **Pipeline default (textual)**: pre-pass em `src/project/generics-pass.ts` que detecta declarações `Class TList<T>`, `Delegate Function Pred<T>(...)`, free functions `Sub Foo<T>` no nível do namespace, e usos `T<X>` (incluindo invocações `obj.Foo<Product>(item)`) no código. Remove os templates do output e injeta uma cópia concreta por instanciação (`TList_Product`, `TList_Integer`). A substituição de `T` no corpo usa `src/utils/bas-tokenizer.ts` (lexical-aware), então variáveis locais chamadas `T`, comentários e literais são preservados.
- **Pipeline AST opcional**: ativado por `data7.experimental.useAstGenerics`, dirigido por `src/project/generics-driver.ts`: `parser → GenericsMonomorphizer → serializer`. Os componentes vivem em `src/project/parser/` (lexer + parser + serializer) e `src/project/generics-monomorphizer/` (AST nodes + clone + registry + monomorphizer + warnings). O driver mapeia `MonomorphizationWarning` para `GenericsPassWarning` para que o output do linter e do builder fique idêntico.
- **Contexto global de templates**: o Builder, o preview, o linter e o `WorkspaceSymbolIndexer` coletam templates genéricos declarados em todo o workspace, não apenas no arquivo atual. Um uso `TTList<Produto>` em `teste.bas` pode solicitar que o arquivo que declara `TTList<T>` materialize `TTList_Produto`; o arquivo consumidor apenas reescreve a referência para o nome plano.
- **Templates externos são conhecidos, não donos da materialização local**: ao transpilar um arquivo consumidor, templates vindos de outro arquivo são usados para validar aridade e reescrever `Foo<Bar>` para `Foo_Bar`, mas não geram classes/delegates naquele arquivo. A materialização concreta acontece somente no arquivo que declara o template real.
- **Pedidos abertos são ignorados**: usos que ainda dependem de parâmetro genérico aberto (`TTList<T>`, `Map<K>`) não entram na fila global de materialização. Isso evita classes inválidas como `TTList_T` ou wrappers para parâmetros que ainda serão resolvidos por outra instanciação.
- Suporta generics aninhados (`TList<TList<Integer>>` → `TList_TList_Integer`).
- **Metaprogramação em templates genéricos**: o parser preserva diretivas `<# IF ... THEN #>`, `<# ELSE #>` e `<# END IF #>` como statements opacos, e o monomorfizador AST as avalia depois da substituição dos argumentos concretos. A expressão suportada inicialmente é `TypeSystem.InheritsFrom(T, "Base")`, com `NOT` opcional. Exemplo:

```basic
<# IF NOT TypeSystem.InheritsFrom(T, "TTObject") THEN #>
Class TTItem_<T>
   Inherits TTObject
   Value As <T>
End Class
<# END IF #>
```

- **Uso de wrappers condicionado em build-time**: templates podem usar metaprogramação para gerar caminhos diferentes para objetos e primitivos. Para `T` descendente de `TTObject`, `Wrap`/`Unwrap` podem operar diretamente sobre o objeto; para tipos primitivos ou `Variant`, o template pode materializar `TTItem_<T>`. Essa decisão é tomada no build/preview, removendo verificações runtime repetidas como `TValue(...).IsObject`.
- **Semântica de constraints**: parâmetros sem constraint explícita permanecem abertos (`<T>` resolve como `T`, não como `TObject`). Apenas `T As Foo` define a restrição usada pelo linter, hover e resolução de herança.
- **Serialização canônica de saída**: a materialização remove `Public` redundante de campos e properties, preserva os demais modificadores e mantém a sintaxe nativa `TypeOf obj Is Tipo` / `TypeOf(obj) Is Tipo` após substituição genérica.
- O linter live (`src/diagnostics/diagnostics.ts`) chama `analyzeGenericsPass` com templates externos do workspace para emitir os 6 warnings de generics no editor sem rodar o Builder: `unknown-template`, `generic-arity-mismatch`, `duplicate-template`, `class-generic-method-unsupported`, `flat-name-collision`, `instantiation-limit-exceeded`.
- IntelliSense design-time: `WorkspaceSymbolIndexer.updateFileContent` detecta templates e usos genéricos no arquivo atual e no contexto do workspace, injeta cópias monomórficas planas (`TList_Product`) no índice de símbolos quando necessário e marca esses símbolos como sintéticos para não conflitar com declarações reais. O `TypeResolver` normaliza `TList<Product>` → `TList_Product` e também consegue resolver membros diretamente do template externo quando a cópia sintética ainda não existe no cache local; hover, completion e signature-help mostram `Add(pValue As Product)` corretamente.
- Preview: `D7PreviewContentProvider` reindexa o arquivo renderizado e os documentos `.bas` abertos antes de transpilar. O `PreviewService` dispara atualização para os previews abertos quando qualquer fonte `.bas` muda, garantindo que novos usos genéricos em outro namespace materializem imediatamente no preview do template, sem reload da janela.
- Detalhes do pipeline: [docs/linguagem-basic/07-generics.md](docs/linguagem-basic/07-generics.md).

#### `Dim { Nome, Idade } = pessoa` / `Dim [a, b] = lista` (destructuring)

- Object: cada binding vira um `Dim` independente. Suporta rename (`{ Nome As n }`) e default (`{ Nome As n = "x" }`).
- Array: cada binding vira `Dim x = lista.Item(i)` indexado pela posição. Rest binding (`[first, ...rest]`) emite um loop For que coleta a cauda em uma `StringList` nova.
- Parser puro em `src/utils/destructure-parser.ts`.

#### `Enun X / V = "..." / End Enun` (multi-line)

- Expandido para a classe específica do Enum que herda de `TEnum` (do namespace `mod_tenum`). A base herda de `TTObject`, preservando identidade, cópia e descarte para uso seguro em `TTList`, e a classe gerada expõe Initialize lazy, Shared Function por valor, Load por String e GetOptions.
- `Enun` é a palavra-chave do sugar; `Public Enum Options ... End Enum` e `Enum Options ... End Enum` são sintaxe nativa e passam intactos para o compilador.
- O linter ignora a verificação do método `Sub Free()` para classes que herdam de `TEnum`.

#### `Return If cond Then a Else b`

- Expandido para `If cond Then Return a / Return b`. Early return inline em uma linha.

#### `|>` (pipe operator)

- InlineTransform: `data |> Trim |> UCase` vira `UCase(Trim(data))`. Operação só no RHS de assignments para evitar reescrever `Dim` corretamente.

#### `sql$"SELECT * FROM {tabela}"` (tagged templates)

- InlineTransform: `tag$"texto {expr}"` vira `tag.Build("texto ", (expr), "")`. Estende a interpolação para gerar uma chamada de método em vez de concatenação.

#### `Type X = Y` (type alias)

- Apagado pelo Builder; o linter o trata como o tipo aliasado.

#### Invariante de round-trip

Como o passo de transpilação é destrutivo, `build → decompile → build` continua válido **apenas para fontes nativas**. Arquivos sugarados, ao serem build → decompilados, retornam em forma nativa expandida — comportamento intencional documentado em `data7_domain.mdc`.

### 2.2. Módulos e Namespaces

- Um arquivo `.bas` é agrupado sob uma declaração `Namespace nome_do_namespace`.
- Módulos compartilhados são marcados com a tag `@Module` nos comentários e são importados no repositório exclusivo. Eles não contêm a tag `@Module-Imported`.
- Classes de domínio em módulos compartilhados que podem participar de coleções devem herdar de `TTObject` e implementar construtor de cópia, `Assign`, `Clone`, `ToString` e `Dispose`; a lista passa a ser responsável por disparar seu ciclo de descarte.

### 2.3. Principal.bas

- Arquivo de entrada principal de cada projeto. Declarações e tipos definidos na unidade principal (`Principal.bas`) são injetados no contexto global da aplicação e são visíveis em todos os arquivos sem a necessidade de comandos `Imports`.

### 2.4. Repositório Privado de Módulos Compartilhados

- Pasta de armazenamento exclusiva e isolada da extensão (normalmente sob a área de `globalStoragePath` da extensão ou fallback `~/.data7_extension/repository`).
- Guarda os arquivos `.bas` copiados/descompilados de módulos compartilhados que são referenciados em múltiplos projetos.
- O `RepositoryService` gerencia a importação de módulos externos para dentro desta pasta particular. Toda escrita passa por `safeJoinInside` (`src/utils/path-safety.ts`) para impedir path-traversal a partir de nomes de módulo controlados por XML.

### 2.6. Pasta `data7_modules/`

- Subpasta opcional dentro do workspace do projeto (irmã de `src/`) onde a extensão copia as cópias locais dos módulos compartilhados que foram declarados como dependência em `data7.json#dependencies`.
- Sincronizada automaticamente por `DependencyScanner.syncDependencies` (lendo do repositório privado) e empacotada pelo `Builder` dentro de uma `<Pasta>` virtual com o mesmo nome no `.7Proj` resultante.
- Adicionada ao `.gitignore` do projeto por `ProjectService.protectProjectFolder` — não deve ser versionada.

### 2.5. Biblioteca Nativa do Sistema (`System Library`)

- Conjunto de classes, funções e namespaces nativos do próprio ERP (ex: `Forms.Form`, `Drawing.TCanvas`, `SQL.Connection`, `Collections.StringList`, `Data7.Report`).
- Estruturada fisicamente na pasta `src/system-library/` dividida por pastas de namespaces correspondentes.
- Classes globais nativas como `THTTP`, `TJSONObject` e `TJSONArray` pertencem à raiz global (`Globals/`) e não exigem comandos de `Imports`.
- A pasta `src/system-library/types.ts` define a lista estrita de containerNames permitidos (`SystemContainer`) para mitigar erros tipográficos na biblioteca. Quando uma nova classe/alias é adicionada, primeiro estenda essa união e só depois adicione o símbolo.
- O módulo `src/system-library/symbol-helpers.ts` fornece os helpers `buildClassSymbols`, `buildNamespaceSymbols`, as constantes `SYSTEM_RANGE`/`SYSTEM_URI` e a `UNSUP_NOTE`. Arquivos novos do system-library devem usar esses helpers em vez de repetir o boilerplate de `range`, `fileUri`, `isShared`, `isPrivate`, etc.
- Itens marcados `Suportado=Não` nas planilhas de levantamento da pasta `docs/Documentação Data7/` viram `isUnsupported: true` na entrada `SystemSymbolInfo`. O linter emite o diagnóstico `unsupported-member` quando esses membros forem referenciados em `.bas` (ver § 4.4). O override de membros herdados marcados `Não` (ex.: `Caption`/`Color`/`OnGesture` em `Data7.Report`) é feito declarando o mesmo nome no container filho com `isUnsupported: true` — o mesmo padrão usado em `Forms/Grid.ts`.

#### Fontes de levantamento (`docs/Documentação Data7/`)

- Cada subpasta corresponde a um namespace e pode conter **HTML** (documentação textual extraída do article-base do ERP) e/ou um arquivo `instrução.txt` (também aceito como `instrução.cpp` por legado).
- O `instrução.txt` lista, em formato CSV, todo o autocomplete oficial de uma classe ou namespace no formato `Categoria,Nome,Tipo / Assinatura[,Valor],Suportado`. Quando presente, é a fonte canônica para popular a definição em `src/system-library/`.
- O teste `src/test/system-library/instrucao-coverage.test.ts` confronta cada linha da planilha com `SYSTEM_SYMBOLS` em CI: membros marcados `Sim` devem ser resolvíveis pelo container alvo ou pela cadeia de herança; membros exclusivamente marcados `Não` devem ter alguma definição com `isUnsupported: true`.

---

## 3. Paradigmas de Desenvolvimento e Princípios de Código

A extensão segue estritamente o paradigma de **Orientação a Objetos (OOP)** e adere aos princípios **SOLID** e **DRY** (Don't Repeat Yourself):

- **Single Responsibility (SRP)**: Cada classe tem uma responsabilidade focada e bem definida (ex: `DiagnosticsLinter` para validação, `SymbolParser` para análise de sintaxe de símbolos, `CodeFormatter` para formatação de código).
- **DRY**: Funções utilitárias redundantes de comentários, caminhos ou conversões foram consolidadas como métodos estáticos ou de instância em classes auxiliares especializadas (ex: `DependencyScanner.stripComments`).
- **TypeScript Strict Safety**: Utilização de tipos estritos, uniões e interfaces para validação de fluxos e prevenção de erros em tempo de compilação. O `tsconfig.json` ativa tanto `strict: true` quanto `noUncheckedIndexedAccess: true` — todo acesso indexado (`arr[i]`, `record[k]`, capture group `match[N]`) é tipado `T | undefined` e exige guarda (`??` default, early-return, ou destructuring + `assert.ok` em testes). Convenções detalhadas vivem em `typescript.mdc`.
- **AST-First Analysis (AST-First)**: Todo o processamento de linguagem, validação estática de código (como diagnósticos/linter) e análise de generics devem ser baseados exclusivamente no parser e na AST central da linguagem (`CompilationUnit`/`LanguageProcessor` e subclasses de `ASTWalker`), em vez de análise baseada em regex sobre texto bruto. Análise via regex é estritamente proibida para inferir estruturas gramaticais, variáveis, tipos ou fluxo de controle. Diretivas de comentário (ex: `' data7:disable-line`) são a única exceção permitida para escaneamento de texto bruto.

---

## 4. Regras de Negócio e Lógica dos Componentes

### 4.1. Resolução de Escopo e Linter (Advanced Diagnostics)

O linter realiza validação semântica em duas etapas:

1. **Regra de Visibilidade**:
   - Resolução local: Contexto do Método -> Classe -> Namespace Ativo.
   - Resolução global: Tipos primitivos (`String`, `Integer`, etc.), classes globais (`THTTP`, `TObject`, `TJSONObject`, `TJSONArray`) e declarações presentes na unidade `Principal.bas`.
   - Se o tipo referenciado não pertencer ao escopo local ou global, ele **deve** pertencer a um módulo cujo namespace foi explicitamente importado através de um comando `Imports NomeDoNamespace` no cabeçalho do arquivo, ou ser invocado via notação qualificada direta (`ModuloNamespace.TipoClasse`).
   - Caso contrário, o linter reportará um erro `missing-import` de falta de importação.
2. **Auto-Importação no Autocomplete**:
   - Ao acionar autocomplete (Ctrl + Espaço) sobre um tipo ausente do arquivo, o provedor exibe os namespaces correspondentes. Ao selecionar um item, a extensão insere automaticamente o comando `Imports Namespace` no topo do arquivo `.bas`.
3. **Ações Rápidas (Quick Fixes)**:
   - Se o linter reportar um erro `missing-import`, a extensão sugere correções rápidas (Code Actions) para incluir a declaração `Imports` necessária.
   - O linter anexa um payload estruturado (`MissingImportPayload`) em `Diagnostic.data` com o namespace a importar; o `code-actions.ts` lê o payload em vez de fazer regex sobre a mensagem localizada.

### 4.4. Códigos canônicos de diagnóstico (`src/diagnostics/diagnostic-codes.ts`)

Reservados em `kebab-case` e usados como valor de `Diagnostic.code`. Adições novas devem ser documentadas aqui antes de qualquer uso no código. Cada código tem um payload tipado opcional (`MissingImportPayload`, `UnusedImportPayload`, `ModuleNotFoundPayload`, `ModuleNotDeclaredPayload`, `UnknownMemberPayload`) anexado a `Diagnostic.data` para que o `D7BasicCodeActionProvider` aplique correções sem reparsear a mensagem.

**Regras Fundamentais para Diagnósticos e Quickfixes:**

1. **Supressão via Comentário**: Todo diagnóstico gerado pela extensão deve fornecer uma opção para desabilitar o aviso/erro por meio de comentários, tanto localmente na linha afetada (`' data7:disable-line <code>`) quanto de forma global para todo o arquivo (`' data7:disable <code>`).
2. **Correção em Massa (Bulk Quickfixes)**: Qualquer diagnóstico que declare uma correção rápida (Quickfix) do tipo texto ou comando deve possuir também uma opção correspondente para ser aplicada em massa em todas as ocorrências daquele mesmo problema no arquivo ativo (ex: "Importar todas as dependências em falta neste arquivo", "Remover todos os imports duplicados/não utilizados neste arquivo").
3. **Inferência Ativa de Soluções**: Ao desenhar ou implementar um novo código de diagnóstico, o agente responsável deve tentar inferir uma correção algorítmica/sintática e consultar o usuário sobre sua inclusão na forma de um novo Quickfix.

- `missing-import` — um tipo referenciado pertence a um namespace ausente da seção `Imports` do arquivo.
- `unused-import` — uma diretiva `Imports` declarada no cabeçalho não é referenciada pelo restante do arquivo.
- `duplicate-import` — a mesma diretiva `Imports` foi declarada mais de uma vez no cabeçalho.
- `module-not-found` — um namespace referenciado por `Imports` ou nome qualificado não existe nem no workspace, nem no repositório privado, nem na System Library.
- `module-not-declared` — um módulo existe no repositório privado mas não foi adicionado a `data7.json#dependencies`.
- `unknown-member` — um acesso `obj.X` ou `Me.X` referencia um membro inexistente no tipo resolvido. O payload pode incluir até 3 sugestões "Você quis dizer…?" calculadas por Levenshtein.
- `private-member-access` — um acesso `obj.X` referencia um membro `Private` declarado fora da classe atual.
- `event-signature-mismatch` — um handler atribuído a `obj.OnXxx` tem aridade incompatível com a do delegate declarado pela propriedade (ex.: `TNotifyEvent` espera 1 parâmetro).
- `unsupported-member` — o membro acessado em `obj.X` ou `Me.X` está declarado na System Library, mas marcado com `isUnsupported=true` porque o compilador Data7 não traduz aquele membro do autocomplete original (TMS/DevExpress). Emite _Warning_ (não _Error_) para que o usuário possa avaliar a substituição sem bloquear o build local.
- `not-enumerable` — o operando à direita de `In` em `For Each <var>[ As <Tipo>] In <expr>` resolve para um tipo que não expõe a propriedade `Count` mais um acessor inteiro. O `Builder` deixaria a linha intacta no `.7proj` (gerando erro em runtime do executor), por isso emitimos _Warning_ no editor com o payload `NotEnumerablePayload` (`{ code, typeName }`).
- `unknown-suppression-code` — uma diretiva `' data7:disable-line <code>` ou `disable-next-line <code>` referencia um código que não existe em `DiagnosticCodes` (typo ou código removido). Emite _Warning_ com payload `UnknownSuppressionCodePayload` (`{ code, suppressedCode }`) — a diretiva permanece no arquivo, mas o usuário descobre que está silenciando nada.
- `invalid-interpolation` — uma string interpolada `$"..."` está malformada (`unterminated-string` / `unterminated-brace` / `empty-expression`). O parser para na primeira falha, preserva o resto da linha, e emite _Warning_ com payload `InvalidInterpolationPayload` (`{ code, reason }`). O Builder seguirá a mesma análise via `src/utils/interpolation.ts` — diagnóstico no editor e falha no build são sempre coerentes.
- `ternary-context-unsupported` — um ternário `cond ? a : b` foi usado fora do RHS de um assignment (em `Print`, `Return`, argumento de chamada, etc.). O transpilador só consegue expandir o ternário para o bloco multi-linha `If/Then/Else/End If` quando o target da atribuição é claro; outros contextos exigiriam restruturação do código circundante. Emite _Warning_ com payload `TernaryContextUnsupportedPayload` (`{ code, context }`).
- `unknown-template` — um uso genérico `Foo<Bar>` referencia um nome `Foo` que não corresponde a nenhum template `Class T<T>` / `Delegate <T>` / `Sub Foo<T>` declarado no projeto. Emite _Warning_ — o build vai falhar no compilador nativo porque a sintaxe `<...>` nunca é removida.
- `generic-arity-mismatch` — `Foo<A, B>` foi escrito mas o template `Foo<T>` declara aridade diferente. Emite _Warning_.
- `duplicate-template` — o mesmo nome de template (`Class TList<T>`) foi declarado mais de uma vez no projeto; a monomorfização escolhe arbitrariamente uma das versões. Emite _Warning_.
- `class-generic-method-unsupported` — um método genérico (`Sub Foo<T>(...)`) foi declarado _dentro_ de uma classe. O pipeline textual não reescreve esse caso com segurança (falta análise de escopo) e a engine AST ainda não cobre. A declaração é mantida verbatim e o Builder falha quando o método for chamado. Workaround: extrair para função livre no namespace. Emite _Warning_.
- `flat-name-collision` — dois templates diferentes produziriam o mesmo flat name após monomorfização (ex.: `Sub Foo<T>` + `Sub Foo_Integer` declarado manualmente). Emite _Warning_.
- `instantiation-limit-exceeded` — o pipeline gerou ≥ 10.000 instanciações monomórficas distintas (geralmente um caso de recursão infinita como `TList<TList<TList<...>>>`). A expansão aborta para evitar explosão de memória. Emite _Warning_.
- `duplicate-declaration` — um identificador foi declarado mais de uma vez no mesmo escopo ou conflita com uma declaração em outro escopo público e acessível (membro da classe do mesmo contexto, tipo do namespace, namespaces importados ou globais do sistema). Emite _Error_.
- `instance-member-access-on-type` — tentativa de acessar um membro não estático/shared diretamente no tipo (classe/estrutura). Emite _Error_.
- `sub-used-as-function` — um método `Sub` (ou procedimento sem retorno) foi usado em uma expressão ou atribuição que espera um valor. Emite _Error_.
- `unknown-symbol` — referência a um símbolo (variável, constante, método) inexistente no escopo atual. Emite _Error_.
- `loose-type-statement` — declaração de nome de tipo solto/avulso sozinho em uma linha de código. Emite _Error_.
- `call-parentheses-mismatch` — chamada de método/procedimento violando as regras estritas de parênteses (por exemplo, chamar funções com parâmetros ou subs com >1 parâmetro sem parênteses). Emite _Error_.
- `declaration-parentheses-mismatch` — declaração de método/procedimento sem parâmetros que omite os parênteses. Emite _Warning_.
- `missing-mybase-free` — uma classe não possui o método `Sub Free()` ou o método `Sub Free()` não invoca `MyBase.Free()`. Emite _Warning_.
- `function-read-self` — tentativa de ler o valor de retorno usando o nome da própria função dentro de seu escopo. Emite _Error_.
- `invalid-assignment-target` — atribuição de valor a um destino inválido (como atribuir ao nome de outra função que não seja a função/método ou propriedade ativa no escopo atual). Emite _Error_.
- `missing-return-value` — a função pode retornar ou sair sem que um valor de retorno tenha sido definido em todas as ramificações de controle. Emite _Warning_.
- `dead-code` — código inacessível após um `Return` ou `Exit` garantido, ou dentro de blocos condicionais constantes sempre falsos. Emite _Warning_.
- `inline-if-then` — a sintaxe 'If ... Then' inline não é recomendada. Emite _Warning_ sugerindo a conversão para formato de bloco com 'End If'.

Cada código com Quick Fix associado no `D7BasicCodeActionProvider` também oferece opções genéricas de **supressão de diagnóstico** via comentário para a linha atual (`' data7:disable-line <code>`) ou para todo o arquivo (`' data7:disable <code>`). Além disso, ações rápidas que alteram código suportam **correções em massa (Bulk Quickfixes)** aplicáveis a todas as ocorrências daquele mesmo erro no arquivo (ex: "Importar todas as dependências ausentes no arquivo").

Os Quick Fixes disponíveis são:

- `missing-import` → "Importar X" (e bulk "Importar todos em falta")
- `unused-import` / `duplicate-import` → "Remover Imports X" (e bulk "Remover todos os imports duplicados ou não utilizados")
- `module-not-declared` / `module-not-found` → "Instalar módulo X…" (dispara `data7.installModule`, e bulk "Instalar módulos ausentes")
- `unknown-member` → até 3 ações "Você quis dizer Y?" que substituem o nome no lugar (e bulk correspondente).
- `unsupported-member` → sem Quick Fix direto para substituição semântica (pois depende do contexto), mas oferece bulk para comentar todas as linhas ou suprimir os avisos no arquivo.
- `not-enumerable` → sem Quick Fix (a substituição depende da forma de iteração que o usuário pretende — converter para `For i = 0 To ... - 1` ou mudar o tipo do operando). Apenas o warning é exibido.
- `unknown-suppression-code` → sem Quick Fix. Apenas o warning é exibido.
- `invalid-interpolation` → sem Quick Fix. Apenas o warning é exibido.
- `ternary-context-unsupported` → sem Quick Fix. Apenas o warning é exibido.
- `unknown-template`, `generic-arity-mismatch`, `duplicate-template`, `class-generic-method-unsupported`, `flat-name-collision`, `instantiation-limit-exceeded`, `duplicate-declaration` → sem Quick Fix (correções dependem da estrutura do template/uso; o usuário ajusta manualmente).

### 4.2. Compilação (`Builder`)

- Executa a concatenação e validação do projeto `.bas` empacotando-o no arquivo XML final `.7proj`.
- Remove comentários excedentes, realiza escape de caracteres especiais XML (`&`, `<`, `>`, etc.) e gera GUIDs exclusivos de projeto.
- Antes do strip/minify, aplica `SugarTranspiler.transpile` em cada `.bas` (Principal, módulos de `src/` e dependências em `data7_modules/`), expandindo a sintaxe `For Each ... In ... Next` em `For __idx = 0 To <src>.Count - 1` + um `Dim` sintético do elemento. Tipos inválidos (sem `Count`+indexador) ficam intactos no XML final e geram um `logger.warn` rastreável no OutputChannel `Data7`. O round-trip Builder ↔ Decompiler permanece idempotente para fontes nativas; para fontes sugaradas o `Decompiler` devolve a forma expandida.

### 4.3. Descompilação (`Decompiler`)

- Realiza o inverso do Builder: lê o XML de um arquivo `.7proj` e gera a árvore de arquivos individuais `.bas` na estrutura física do projeto.

---

## 5. Estrutura do Diretório de Código (Src)

> A organização interna do `src/` segue **capability-oriented folders** (Pattern B, mirroring `microsoft/vscode-python`) com uma fatia de **domain folder** para o tooling de projeto (Pattern C, mirroring `microsoft/vscode-pull-request-github`). Cada pasta abaixo representa uma camada no grafo de dependências (do leaf para o topo: `util`/`system-library` → `infra` → `analysis` → `diagnostics`/`project` → `providers`/`services` → `extension`). As fences são enforced em `eslint.config.mjs` (`no-restricted-imports` por folder) e documentadas em `.cursor/rules/governance.mdc` § "Architectural enforcement".

### 5.1. Entry point (`src/extension.ts` + `src/commands.ts`)

- `src/extension.ts`: orquestrador da ativação. `activate()` chama, nesta ordem, `initLogger(context)`, `RepositoryService.initialize(context)`, `registerWorkspaceListeners(context)`, `registerCommands(context)`, `registerLanguageProviders(context)`, e os bootstrap de `DiagnosticService` / `ActivationService`. Não exporta lógica de negócio. Eventos de rename/delete apenas mantêm o índice; não recompilam o `.7proj` automaticamente.
- `src/commands.ts`: declara `registerCommands(context)` — uma única tabela `Array<[CommandId, handler]>` mapeada para `vscode.commands.registerCommand`. Consome `COMMAND_IDS` de `infra/constants` para manter typos fora do escopo do compilador.
- `src/providers/registration.ts`: declara `registerLanguageProviders(context)` — todos os 13 `vscode.languages.register*Provider` em um único arquivo, único lugar do projeto que importa todos os providers ao mesmo tempo (exceção arquitetural explícita em `eslint.config.mjs`).

### 5.2. Infraestrutura compartilhada (`src/infra/`)

Leaf da árvore de dependências. Não importa nada de outras pastas de `src/`.

- `src/infra/logger.ts`: `OutputChannel` único `"Data7"` consumido por toda a extensão. Substitui qualquer `console.*` em código de produção.
- `src/infra/configuration.ts`: Snapshot tipado das chaves `data7.*` declaradas em `package.json#contributes.configuration`. Exporta também `resolveDiagnosticSeverity` (que aplica overrides do usuário) e `isExcluded` (que respeita `data7.exclude`).
- `src/infra/constants.ts`: Constantes canônicas compartilhadas — `CONFIG_NAMESPACE` (`"data7"`), `DIAGNOSTIC_SOURCE` (`"data7"`), `PROJECT_CONFIG_FILENAME` (`"data7.json"`), `LANGUAGE_IDS` (`d7basic`, `data7project`) e `COMMAND_IDS` (todos os 15 IDs `data7.*` contribuídos pelo `package.json`). Importadas como `import { LANGUAGE_IDS, COMMAND_IDS } from "../infra/constants"` em todos os call sites — typos em IDs falham na compilação em vez de virarem dead code.
- `src/infra/extension-paths.ts`: Single source of truth para paths persistentes da extensão. Expõe `getRepoBasPath()` consumido tanto por `services/repository-service` (dono da escrita) quanto por `analysis/module-resolver` (consumidor read-only). `initializeExtensionPaths(context)` é chamado em `extension.ts#activate`. Fallback para `~/.data7_extension/repository` quando rodado fora do extension host (testes).

### 5.3. Análise estática (`src/analysis/`)

Módulos puros (sem registro de provider) consumidos por providers, diagnostics e services.

- `src/analysis/symbol-indexer.ts`: Indexador de arquivos `.bas` em segundo plano para o Workspace e parser de símbolos (`SymbolParser`, `WorkspaceSymbolIndexer`). Expõe `getAllFileSymbols()` para providers de busca workspace-wide (Reference, Rename).
- `src/analysis/dependency-scanner.ts`: Analisador estático de dependências de Imports (`DependencyScanner`). Dono canônico de `stripComments`.
- `src/analysis/type-resolver.ts`: Resolução compartilhada de tipo de variável, classe qualificada e membros herdados (`TypeResolver`). Único módulo onde providers e linter consultam o catálogo de símbolos.
- `src/analysis/module-resolver.ts`: `resolveNamespaceFile(indexer, namespace)` — resolve `Imports MyModule` → caminho do `.bas` que declara o namespace. Procura primeiro no workspace (via indexer), depois no repositório privado (via `infra/extension-paths`). Consumido por `providers/document-link-provider`.

### 5.4. Linter e diagnósticos (`src/diagnostics/`)

- `src/diagnostics/diagnostics.ts`: Motor de validação de escopos e sintaxe (`DiagnosticsLinter`). Emite todos os 9 códigos de diagnóstico, com payloads estruturados para auto-fix.
- `src/diagnostics/diagnostic-codes.ts`: Tabela canônica dos `DiagnosticCode` (9 códigos) e seus 6 payloads tipados (`MissingImportPayload`, `UnusedImportPayload`, `ModuleNotFoundPayload`, `ModuleNotDeclaredPayload`, `UnknownMemberPayload`, `UnsupportedMemberPayload`).

### 5.5. Tooling de projeto (`src/project/`)

- `src/project/builder.ts` e `src/project/decompiler.ts`: Compilador e descompilador de projetos.
- `src/project/project-metadata.ts`: Tipos compartilhados (`ProjectMetadata`, `VirtualFolder`, `ModuleMetadata`) consumidos por `builder` e `decompiler`.

### 5.6. Language Server Providers (`src/providers/` — 13 arquivos)

- `src/providers/completion-provider.ts`: Autocompletação (`D7BasicCompletionProvider`). Reexporta `TypeResolver` apenas para compatibilidade retroativa.
- `src/providers/hover-provider.ts`: Visualização rápida de assinaturas e preview de declarações (`D7BasicHoverProvider`).
- `src/providers/signature-provider.ts`: Dicas de parâmetros de chamadas de métodos (`D7BasicSignatureHelpProvider`).
- `src/providers/definition-provider.ts`: Navegação Go to Definition (`D7BasicDefinitionProvider`).
- `src/providers/document-symbol-provider.ts`: Hierarquia Namespace > Class > Method usada pelo Outline, breadcrumbs e sticky-scroll (`D7BasicDocumentSymbolProvider`).
- `src/providers/workspace-symbol-provider.ts`: Busca de símbolos por workspace para `Ctrl+T` (`D7BasicWorkspaceSymbolProvider`).
- `src/providers/folding-provider.ts`: Folding semântico de `Namespace`/`Class`/`Sub`/`Function`/`If`/`For`/`While`/`Try`/`#Region`/`Imports` (`D7BasicFoldingRangeProvider`).
- `src/providers/reference-provider.ts`: Find All References com varredura whole-word em todo o workspace (`D7BasicReferenceProvider`).
- `src/providers/rename-provider.ts`: Rename Symbol limitado a classes, structures, namespaces, methods, delegates e Declare Sub/Function (`D7BasicRenameProvider`).
- `src/providers/document-link-provider.ts`: Torna `Imports MyModule` clicável (`Ctrl+click`) para abrir o arquivo do módulo (`D7BasicDocumentLinkProvider`). Delega 100% da resolução para `analysis/module-resolver.ts` — não importa `services/`.
- `src/providers/registration.ts`: `registerLanguageProviders(context)` agrupando os 13 `vscode.languages.register*Provider`. Único arquivo da pasta autorizado pelo override `data7/providers-registration-exception` a importar todos os providers ao mesmo tempo.
- `src/providers/formatter.ts`: Embelezamento de código (`D7BasicFormattingProvider`, `CodeFormatter`).
- `src/providers/code-actions.ts`: Quick Fixes para todos os 9 códigos de diagnóstico + Source actions (`source.organizeImports` e `source.fixAll.data7`) (`D7BasicCodeActionProvider`). Importa apenas os tipos canônicos de `src/diagnostics/diagnostic-codes.ts`.
- `src/providers/semantic-tokens-provider.ts`: Coloração semântica (classe/namespace/método/propriedade/evento/variável) baseada nos símbolos resolvidos (`D7BasicSemanticTokensProvider` + `D7BasicSemanticTokensLegend`).

### 5.7. Camada de Serviços (`src/services/`)

- `activation-service.ts` — orquestração de ativação: bootstrap de workspace, status-bar dinâmico (nome do projeto + contagem de deps + erros), detecção/notificação de `.7Proj` ao abrir/visualizar (com rastreamento `promptedFiles` para evitar duplicados), `resolveProjectFilePath`, `openParentFolder`.
- `project-service.ts` — resolução do projeto ativo, abertura/criação de projetos, validação da conexão de banco.
- `build-service.ts` — comandos de build/run/openInDevStudio. Todo `child_process` usa `spawn` com array de argumentos (sem shell-injection).
- `dependency-service.ts` — detecção, sync e instalação de dependências do `data7.json`.
- `repository-service.ts` — gestão do repositório privado de módulos com path-safety e Workspace Trust.
- `diagnostic-service.ts` — registro do `DiagnosticCollection`, debounce de refresh e cache por workspace.
- `docs-service.ts` — integração VS Code: comandos `data7.generateSystemLibraryDocs` (escreve arquivos em pasta escolhida) e `data7.injectSystemLibraryDocs` (insere bloco delimitado em `AGENTS.md` idempotentemente). O motor puro (`DocsGenerator`) vive em `src/system-library/docs-generator.ts` (ver §5.8).

### 5.8. System Library (`src/system-library/`)

- `src/system-library/`: Coleção dos símbolos nativos do ERP Data7 organizados por subpastas (`Forms/`, `Globals/`, `IO/`, `Net/`, `SQL/`, `Drawing/`, `Collections/`, `Environment/`, `System/`, `System.Classes/`, `XML/`, `Primitives/`, `Data7/`) e validados com tipagem rígida.
- `src/system-library/index.ts`: Agregador de `SYSTEM_SYMBOLS` + lookup indexes em O(1) (`lookupSystemByName`, `lookupSystemByContainer`, `lookupSystemClassByName`, `lookupSystemNamespaceOrClassByName`). É o arquivo resolvido por `import { ... } from "../system-library"` em todos os call sites.
- `src/system-library/types.ts`: Define `SystemContainer` — união estrita de todos os containerNames válidos.
- `src/system-library/symbol-helpers.ts`: Helpers compartilhados (`buildClassSymbols`, `buildNamespaceSymbols`, `SYSTEM_RANGE`, `SYSTEM_URI`, `UNSUP_NOTE`) que eliminam o boilerplate dos arquivos `*.ts` que descrevem uma classe inteira a partir das planilhas `instrução.txt`.
- `src/system-library/docs-generator.ts`: `DocsGenerator` — gerador puro (sem `vscode`) de Markdown por namespace da System Library, com hash determinístico de snapshot, cross-links entre tipos e cadeia de herança expandida em cada classe. Consumido por `services/docs-service.ts` (wrapper VS Code) e por `scripts/generate-system-library-docs.js` (CLI/CI). Vive aqui (não em `services/`) porque é uma função pura sobre `SYSTEM_SYMBOLS` — pertence ao domínio da System Library.
- Aliases auxiliares: `Globals/_event-types.ts` (delegates VCL — `TDragDropEvent`, `TCanResizeEvent`, `TMouseWheelEvent`, …) e `SQL/_aliases.ts` (tipos FireDAC — `TFDDataSetEvent`, `TFilterOptions`, `TDataSetNotifyEvent`, …) declaram os tipos referenciados como `type:` em propriedades das classes principais.

### 5.9. Utilitários (`src/utils/`)

Leaf da árvore de dependências. Cada helper é uma função pura sem registro VS Code. Os módulos `symbol-kind.ts` e `format-helpers.ts` importam **type-only** de `src/analysis/symbol-indexer` (`SymbolInfo`/`ParameterInfo`); nenhum outro util importa de pastas internas.

- `src/utils/xml-helpers.ts`: Único módulo que instancia `fast-xml-parser`. Exporta `parseProjectXml`, `escapeXml`, `decodeHtmlEntities` e helpers de narrowing.
- `src/utils/guid.ts`: Wrapper sobre `crypto.randomUUID()` no formato GUID do Data7.
- `src/utils/path-safety.ts`: Validação anti path-traversal (`safeJoinInside`, `isSafeSegment`).
- `src/utils/debounce.ts`: Helpers `debounce` e `debounceKeyed` consumidos pelo `DiagnosticService`.
- `src/utils/regex-helpers.ts`: `escapeForRegex(s)` — escape de literais para `RegExp`, consumido pelos providers de Reference/Rename/DocumentLink.
- `src/utils/symbol-kind.ts`: `mapSystemKindToVsCode(s)` — mapeamento canônico `SymbolInfo.kind` → `vscode.SymbolKind`, reusado por DocumentSymbol e WorkspaceSymbol providers.
- `src/utils/format-helpers.ts`: `formatParameter(p)` / `formatParameterList(params)` — renderização canônica de assinaturas de parâmetro em Data7 Basic, reusada por hover-provider e docs-generator.
- `src/utils/primitive-types.ts`: `PRIMITIVE_TYPES` — set canônico de nomes de tipos primitivos/globais usado pelo linter e pelo audit script.
- `src/utils/code-stripper.ts`: `stripCommentsAndStrings(text)` — apaga comentários **e** conteúdo de strings literais preservando colunas; usado pelo RenameProvider para não rewriter identificadores dentro de `"..."`.
- `src/utils/suppression-comments.ts`: Extração de comentários `' data7:disable-line` consumidos pelo linter para suprimir diagnósticos linha-a-linha.

### 5.10. Testes (`src/test/`)

Suíte de testes automatizados unitários e de integração da extensão (**771 asserções em 106 suites distribuídas por 42 arquivos**, organizados em subpastas funcionais que espelham `src/`).

**Estrutura:**

- `_setup/` — `vscode-mock.ts` (override de `require('vscode')`) e `global-hooks.ts` (`beforeEach` único reseta indexer + mock workspace).
- `_helpers/` — `mock-doc.ts` (`createMockDoc`, `pos`, `refContext`, `foldingContext`, `registerOpenDocument`, `resetMockWorkspace`, `noopToken`), `temp-dir.ts` (`withTempDir` async + sync), `assertions.ts` (`expectDiagnostic`, `expectNoDiagnostic`, `expectEdit`, `expectMembers`), `fixtures.ts` (`loadFixture`).
- `providers/` — 1 arquivo por provider (`completion`, `hover`, `definition`, `signature`, `code-actions`, `formatter`, `document-symbol`, `workspace-symbol`, `folding`, `document-link`, `reference`, `rename`, `semantic-tokens-provider`).
- `services/` — 1 arquivo por service exercitado (`activation-service`, `docs-generator`, `docs-service`, `project-service`).
- `system-library/` — `instrucao-coverage.test.ts` (varre cada `instrução.txt` em `docs/Documentação Data7/`) e `new-containers.test.ts`.
- `utils/` — 1 arquivo por helper (`regex-helpers`, `format-helpers`, `primitive-types`, `code-stripper`, `path-safety`, `symbol-kind`, `suppression-comments`).

**Convenções:**

- Cada arquivo abre com `import './_setup/global-hooks'` para registrar o `beforeEach` global.
- Testes agrupados por `describe()` por feature (`Subject - sub-feature`) e nomeados no formato `verb expected when condition`.
- Padronizado para `import { strict as assert } from 'node:assert'`.
- Mock de `TextDocument` exclusivamente via `createMockDoc` (DRY).
- Tempdirs via `withTempDir(async (dir) => ...)` (cleanup garantido).
- `as any` minimizado para < 20 ocorrências via helpers `pos`, `refContext`, `foldingContext`.

### 5.11. Scripts auxiliares (`scripts/`)

- `audit-system-library.js` — auditoria que falha com exit code ≠ 0 quando encontra: descrições stub, eventos `OnXxx: Variant`, `inheritsFrom` órfão, ou tipos desconhecidos.
- `generate-system-library-docs.js` — wrapper CLI sobre `DocsGenerator` para regerar `docs/system-library/` no repositório (usado pelo CI).
- `generate-examples-index.js` — regera o índice de `docs/example/README.md` a partir dos headers `@example`/`@demonstrates`/`@diagnostics` de cada `.bas`. Modo `--check` falha com exit code 1 quando o README está fora de sincronia (usado pelo CI). Acessível via `npm run docs:examples` (escrita) e `npm run docs:examples:check` (CI).

### 5.12. Documentação versionada (`docs/`)

- `docs/system-library/` — `README.md` + 1 `.md` por namespace, gerados automaticamente. Cada arquivo carrega o mesmo `Snapshot <hash>` no rodapé para detecção de drift.
- `docs/levantamentos/` — CSVs brutos do autocomplete original do Data7 (TMS/DevExpress/VCL) usados como entrada para popular a System Library. Cada arquivo (ex.: `grid.txt`) lista `Categoria,Nome,Tipo,Suportado` e é a fonte de verdade quando precisamos repopular a definição de uma classe. Mantidos versionados para que mudanças no compilador apareçam como diffs revisáveis.
- `docs/Documentação Data7/` — pasta com a documentação HTML original do ERP organizada por namespace/classe (`Collections/StringList`, `Data7/Report`, `Global/THttp`, `Net/TFTP`, `SQL/Command`, `XML/IXMLNode`, …). Algumas subpastas trazem também um `instrução.txt` (CSV canônico de autocomplete + Suportado, descrito em § 2.5) que serve de fonte para popular a System Library e é verificado em CI por `instrucao-coverage.test.ts`.
- `docs/example/` — exemplos canônicos `.bas` (e mini-projetos) usados como referência humana **e** como fixtures de teste. Layout por feature: `sugar/<sugar-name>/` (For Each, etc.), `diagnostics/<código>/` (1 pasta por `DiagnosticCode`), `builder/<cenário>/`. Cada `.bas` abre com um header padronizado (`' @example`, `' @demonstrates`, `' @diagnostics`, e opcionalmente `' @transpiled-to`, `' @requires`) cujo contrato vive em `docs/example/README.md`. Carregados pelos testes via `loadExample("sugar/for-each/01-...bas")` para evitar drift entre documentação e cobertura.
- `docs/rfcs/` — Architecture Decision Records (ADRs). Convenção e ciclo de vida em [`docs/rfcs/README.md`](docs/rfcs/README.md). A primeira RFC (`MCP-001-mcp-server.md`) é a referência arquitetural do servidor MCP descrito em § 6.
- `docs/mcp/` — manual do usuário final para o servidor MCP: instalação (Cursor / Claude Desktop / Continue), uso rápido, referência de Resources / Tools / Prompts, exemplos práticos e troubleshooting. Excluída do `.vsix` como o restante de `docs/`.

### 5.13. Hygiene e CI (raiz)

- `README.md` — descrição completa para usuários do Marketplace.
- `CHANGELOG.md` — versionamento Keep-a-Changelog.
- `LICENSE` — MIT.
- `.vscodeignore` — exclui `src/`, `.cursor/`, `docs/`, `scripts/`, `node_modules/`, mapas TS, etc. do pacote `.vsix`.
- `.github/workflows/ci.yml` — pipeline GitHub Actions: install → compile → test → audit → generate docs em todos os PRs e push para `main`/`master`.

Para rodar todo o pipeline (compile + lint + format + test + audit + verificação de exemplos) localmente, basta:

```bash
npm run verify
```

Para iterar mais rápido durante o desenvolvimento, use os scripts individuais:

```bash
npm run compile        # tsc -p ./
npm run lint           # ESLint (inclui fences arquiteturais)
npm run format:check   # Prettier --check
npm run test           # compile + node --test out/test/**/*.test.js
node scripts/audit-system-library.js
node scripts/generate-system-library-docs.js   # regera docs/system-library/
node scripts/generate-examples-index.js        # regera docs/example/README.md
node scripts/extract-official-articles.js      # regera out/mcp/data/articles.json
npm run mcp:bundle                              # esbuild → out/mcp/server.bundled.js
```

---

## 6. MCP Server (Model Context Protocol)

A extensão embute um **servidor MCP** stdio que expõe a especificação e o catálogo da linguagem Data7 Basic para agentes de IA externos (Cursor, Claude Desktop, Continue). O binário (`out/mcp/server.bundled.js`, ~2.8 MB após `esbuild`) é copiado de forma idempotente para `context.globalStorageUri/mcp/` na ativação da extensão por `src/services/mcp-service.ts`, de modo que clientes MCP externos podem apontar para um caminho estável que sobrevive a updates da extensão.

A superfície atual: **10 famílias de Resources** (`data7://language/<chapter>`, `data7://system-library/<ns>`, `data7://examples/<path>`, `data7://diagnostics/codes`, `data7://idioms`, `data7://real-project/<file>`, `data7://official/<qualifiedName>`, `data7://guide/<slug>`, `data7://meta/snapshot`), **12 Tools** (7 lookup — incl. `data7_list_controls` — + 3 executable + 1 mixed + 1 cross-file lint) e **4 Prompts** (`data7_module_skeleton`, `data7_TEnum_pattern`, `data7_typed_recordlist`, `data7_form_skeleton`). Os tools executáveis reusam `SugarTranspiler` (puro) e `DiagnosticsLinter` (via `src/mcp/runtime/vscode-shim.ts`, cópia adaptada de `src/test/_setup/vscode-mock.ts` que intercepta `require("vscode")` em runtime). Sob `--workspace=<path>`, o servidor seed a `WorkspaceSymbolIndexer.createDetached()` para que o linter veja símbolos cross-file. Os 167 exemplos oficiais do ERP (extraídos de `docs/Documentação Data7/**/*.html` por `scripts/extract-official-articles.js` e materializados em `out/mcp/data/articles.json`) são consultáveis via `data7_get_official_example` e enriquecem `data7_describe_symbol` com signature + descrição + exemplo canônico em uma única chamada — substituindo a necessidade de injetar 60+ k tokens em `AGENTS.md`.

Para o objetivo de **criar telas**, o servidor expõe: o capítulo `data7://language/construindo-telas` (idioma de composição de `Forms`: layout `Align`, hierarquia de pais, eventos, ciclo `Show`/`Free`, controles ricos Grid/TextBox/PageControl, extraído do framework real `mod_card_grouper`), os 7 exemplos canônicos `docs/example/forms/` + o mini-projeto buildável `docs/example/builder/tela-cadastro/` (consultáveis via `data7_search_examples`/`get_canonical_example`), o prompt `data7_form_skeleton` (gera o esqueleto de uma tela funcional, layouts `simple`/`header-content-footer`/`list`), a tool `data7_list_controls` (descobre os controles instanciáveis de `Forms` sem carregar o namespace inteiro) e o campo `formUsageHint` em `data7_describe_symbol` (instanciação + posicionamento por `Align` + eventos `On*` para controles `Forms`). A correção do falso-positivo `unknown-template` no operador `<>` (em `src/analysis/generics-analyzer.ts`) garante que o idioma de disparo de evento `If me.OnXEvent <> NULL Then ...` — onipresente em código de tela — não gere mais diagnósticos espúrios.

A pasta de código vive em `src/mcp/` e segue uma fence arquitetural própria (`data7/mcp-isolation` em `eslint.config.mjs`): não pode importar `providers/`, `services/`, `extension`, `infra/configuration`, nem `vscode` direto. As dependências runtime adicionais (`@modelcontextprotocol/sdk` + `zod` como seu peer) são justificadas pela RFC MCP-001 (atualização sancionada em `project_stack.mdc`).

Detalhes arquiteturais em [`docs/rfcs/MCP-001-mcp-server.md`](docs/rfcs/MCP-001-mcp-server.md); manual do usuário em [`docs/mcp/`](docs/mcp/).
