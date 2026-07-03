# Plano de implementacao - demo `teste_arrays/Principal.bas`

Fonte analisada: `D:\DEV\Projects\data7\Modules\teste_arrays\src\Principal.bas`.

Payload de referencia: diagnosticos atuais do linter para o mesmo arquivo, incluindo falsos positivos em `CType(pItem, Form).Margins.` e falhas de parser em `MustInherit Class` / `NotInheritable Class`.

## Objetivo

Levar parser, linter, IntelliSense, formatter e build/preview a tratar corretamente os casos do demo sem depender de regex sobre fonte Data7 para semantica. O resultado esperado e:

- parser resiliente para membros incompletos, blocos incompletos e comentarios;
- diagnosticos explicitos e estaveis para erros reais do demo;
- quick fixes apenas quando forem deterministas e seguros;
- providers sem atuacao dentro de comentarios;
- supersets nao nativos transpilados/removidos antes do compilador Data7.

## Status da implementacao

Implementado nesta entrega:

- parser/linter para `incomplete-member-access` e diagnostico estrutural canonico `unterminated-block`;
- regras `typed-const-unsupported`, `invalid-shared-member`, `redundant-public-modifier`, `unused-declaration`, `loose-value-statement`, `abstract-instantiation`, `sealed-inheritance`, `mustoverride-not-implemented` e `invalid-class-modifier-combination`;
- quick fixes unitarios para `redundant-public-modifier`, `unused-declaration` e chamada sem parenteses com argumentos;
- suporte a `MustInherit`, `NotInheritable` e `MustOverride` no parser/simbolos/linter, com remocao no serializer final;
- completion apos ponto vazio para receiver de lambda e casts `CType(expr, Tipo).` / `Tipo(expr).`;
- dead-code ignora corpos de lambdas ao analisar o fluxo do metodo externo;
- referencias de metodo passadas para parametros delegate sao validadas por assinatura, inclusive contra delegates materializados como `TFindDel_Integer`;
- providers principais ignorando comentarios/strings, incluindo completion, hover, definition, semantic tokens, references e rename; remocao do autoclose de `'`, snippet de classe com `Sub New`/`Sub Free`, formatter reconhecendo os novos modificadores;
- exemplos canonicos e documentacao atualizados.

Ainda recomendado como evolucao separada:

- substituir o formatter por uma estrategia hibrida lexer/AST completa, alem da atualizacao de modificadores entregue aqui;
- aprofundar `unused-declaration` para analise de projeto inteiro com parametros, metodos privados e membros globais.

## Rodada de ajustes pontuais - exemplo reduzido atualizado

Status: concluido.

- [x] Suprimir `unknown-member` quando o parser ja emitiu `incomplete-member-access` para membro vazio, evitando diagnostico duplicado como `Membro ""`.
- [x] Corrigir recuperacao de parser apos ponto final sem `_`: `CType(pItem, Form).Margins.` deve gerar erro local e nao consumir comentario/proxima linha como expressao.
- [x] Corrigir recuperacao de metodos sem `End Sub`/`End Function` dentro de `Class`, impedindo que um metodo incompleto engula o `Sub Free()` seguinte e gere falso `missing-mybase-free`.
- [x] Corrigir quick fix de `call-parentheses-mismatch` para envolver os argumentos da chamada raiz (`Print(...)`) sem inserir `()` em membros internos como `Caption`.
- [x] Validar autocomplete apos `Form(pItem).` dentro de chamada/initializer, alem do caso isolado em comentario.
- [x] Revalidar `Using` sem `End Using` com diagnostico `unterminated-block`.
- [x] Revalidar `MustOverride` no build/serializer para garantir remocao junto com `MustInherit`/`NotInheritable`.
- [x] Manter `Overrides Nome()` sem `Sub`/`Function`/`Property` como declaracao inválida. A forma abreviada nao e suportada pela linguagem; o parser emite `invalid-declaration` em vez de transformar em metodo opaco.
- [x] Validar `Overrides Sub/Function/Property` contra a classe base. O linter agora emite `invalid-declaration` quando nao existe membro compativel herdado ou quando o membro herdado nao e `Overridable` nem `MustOverride`.
- [x] Emitir `loose-value-statement` para cadeias de valor standalone sobre receivers `TObject`/`Variant` ou nao resolvidos, como `pItem.Margins.Bottom`, sem mascarar `unknown-member` em receivers concretos como `CType(pItem, Form).Cap`.
- [x] Revalidar o arquivo reduzido real: os falsos positivos `unknown-member` com membro vazio, `expected-token` no comentario e `missing-mybase-free` nao aparecem mais; permanecem apenas os erros/warnings intencionais do exemplo.
- [x] Corrigir falso positivo de `dead-code` dentro de lambdas de `ForEach`, `Find` e `Reduce`. O retorno ou chamada dentro da lambda nao encerra nem invalida o fluxo do metodo externo.
- [x] Corrigir falso `type-mismatch` em `Find(HelperNumero.FindMaiorQue4)`: quando o parametro esperado e delegate, a referencia de metodo e comparada pela assinatura do delegate, nao pelo tipo de retorno `Boolean`.
- [x] Validar chamadas de campos tipados como delegate, como `OnExecute(...)`, incluindo quantidade e tipos dos argumentos.
- [x] Validar atribuicao de lambda a campo delegate com quantidade exata de parametros e tipos compativeis com a assinatura do delegate.
- [x] Registrar variaveis declaradas por `Using ... As New ...` no escopo local para linter, hover e completion.
- [x] Ajustar hover, completion e semantic tokens para campos tipados como delegate, exibindo a assinatura callable do delegate.
- [x] Corrigir hover em prefixo de namespace qualificado para mostrar o namespace sob o cursor, nao o membro final da cadeia.
- [x] Emitir `unknown-symbol` para invocacao nao qualificada que nao resolve no escopo atual.

## Prioridade 0 - Base sintatica e recuperacao do parser

Status: concluido para o demo.

- [x] Adicionar um diagnostico estrutural dedicado para fechamento ausente de bloco, por exemplo `unterminated-block`, mapeando `Namespace/End Namespace`, `Class/End Class`, `Structure/End Structure`, `Sub/End Sub`, `Function/End Function`, `Property/End Property`, `Get/End Get`, `Set/End Set`, `Select/End Select`, `If/End If`, `For/Next`, `While/End While`, `Do/Loop`, `With/End With`, `Try/End Try` e `Using/End Using`.
- [x] Garantir que a excecao de bloco sem fechamento se aplique somente a `If ... Then` inline e a lambda-method sugar. Metodos normais declarados com `Sub`/`Function`, mesmo dentro de lambdas ou callbacks, devem exigir fechamento.
- [x] Revisar os parsers de corpo em `packages/data7-core/src/project/parser/statement-parsers.ts`, `declaration-parsers/method-parser.ts`, `class-parser.ts` e o parser do sugar `using` para detectar EOF ou fechamento divergente sem consumir o restante do arquivo como parte do bloco errado.
- [x] Corrigir a recuperacao apos member access incompleto com ponto final, como `CType(pItem, Form).Margins.`, `pItem.` e `_minhaDimDentroDeModTeste.`. O parser deve produzir no maximo um erro local `incomplete-member-access` e nao transformar o comentario ou a proxima instrucao em nome de membro.
- [x] Validar que comentario iniciado por `'` encerra a leitura sem gerar tokens semanticos, completion ou hover. O caso atual em que o parser cita texto do comentario no `expected-token` indica recuperacao ruim apos o ponto final.

Arquivos provaveis:

- `packages/data7-core/src/project/parser/lexer.ts`
- `packages/data7-core/src/project/parser/expression-parser.ts`
- `packages/data7-core/src/project/parser/parser.ts`
- `packages/data7-core/src/project/parser/statement-parsers.ts`
- `packages/data7-core/src/project/sugars/plugins/using/parser.ts`
- `packages/data7-core/src/diagnostics/structural-diagnostics.ts`
- `packages/data7-core/src/diagnostics/diagnostic-codes.ts`

Testes minimos:

- parser com cada bloco sem fechamento esperado;
- parser com `CType(pItem, Form).Margins.` seguido de comentario e depois `Print`;
- `Using _teste As New Teste()` sem `End Using`;
- lambda-method valida sem fechamento explicito somente quando a sintaxe realmente for lambda-method;
- comentarios com pontos nao geram member access nem completion context.

## Prioridade 1 - Regras semanticas de declaracao e membros

Status: concluido para o demo; ha evolucao pendente para `unused-declaration` em projeto inteiro.

- [x] Implementar `unused-declaration` como warning para declaracoes locais/campos privados/constantes cobertos pelo demo. O quick fix remove a declaracao somente por acao explicita do usuario e nunca entra no autofix on save, fix active file ou fix workspace.
- [ ] Evoluir `unused-declaration` para parametros, metodos privados, membros globais e analise de projeto inteiro considerando namespaces importados e `Principal.bas` global.
- [x] Implementar `typed-const-unsupported` como erro para `Const nome As Tipo = valor`. O Data7 compiler aceita, mas gera bug; a forma canonica deve ser `Const nome = valor`.
- [x] Implementar `invalid-shared-member` como erro para `Shared` em campos, propriedades, delegates, classes ou estruturas. Pela regra do demo, somente `Sub` e `Function` aceitam `Shared`.
- [x] Implementar `redundant-public-modifier` como warning com quick fix para remover `Public` explicito, pois `Public` e o default da linguagem.
- [x] Reforcar `loose-value-statement`: acesso standalone a campo/propriedade/constante, como `Form(pItem).Margins.Bottom`, deve ser erro quando nao houver atribuicao, uso como argumento, consumo em expressao ou chamada de metodo. Chamada de metodo standalone continua permitida, inclusive quando retorna valor, porque pode ter efeitos colaterais.
- [x] Reusar o diagnostico existente `call-parentheses-mismatch` para warning de chamada sem parenteses em invocacoes aceitas pelo compilador mas desaconselhadas, como `Print "texto"`. O quick fix deve envolver os argumentos: `Print("texto")`.

Arquivos provaveis:

- `packages/data7-core/src/diagnostics/rules/members-rule.ts`
- `packages/data7-core/src/diagnostics/rules/types-rule.ts`
- novo `packages/data7-core/src/diagnostics/rules/declarations-rule.ts` ou extensao coesa de regra existente
- `packages/data7-core/src/diagnostics/ast-collectors.ts`
- `packages/data7-vscode/src/providers/quick-fixes/*`
- `docs/linguagem-basic/13-diagnostic-codes.md`

Testes minimos:

- exemplos positivos/negativos em `docs/example/diagnostics/<code>/`;
- regressao para quick fix de `Print "..."` virando `Print("...")`;
- quick fix de `Public Sub` preservando indentacao e comentarios;
- remocao de declaracao nao usada somente em Code Action unitaria.

## Prioridade 2 - Heranca abstrata/selada como superset da extensao

Status: concluido.

- [x] Aceitar `MustInherit Class Nome` e `NotInheritable Class Nome` no parser como modificadores de classe. Hoje `MustInherit` / `NotInheritable` viram simbolos soltos e provocam cascata de `unknown-symbol`.
- [x] Adicionar metadados ao `SymbolInfo` para `isMustInherit` e `isNotInheritable`, mantendo `inheritsFrom`.
- [x] Implementar `abstract-instantiation` para erro ao instanciar `New Teste4()` quando `Teste4` for `MustInherit`.
- [x] Implementar `sealed-inheritance` para erro ao declarar `Inherits Teste5` quando `Teste5` for `NotInheritable`.
- [x] Implementar `mustoverride-not-implemented` para classes concretas que herdam de uma base com membros `MustOverride Overridable` sem sobrescrever todos os contratos.
- [x] Implementar `invalid-class-modifier-combination` para bloquear `MustInherit NotInheritable Class`.
- [x] Remover `MustInherit`, `NotInheritable` e `MustOverride` no serializer/transpiler final, mantendo-os no AST para lint, completion, hover e preview intermediaria. O compilador Data7 nao deve receber esses modificadores.

Arquivos provaveis:

- `packages/data7-core/src/project/parser/parser.ts` (`MODIFIER_KEYWORDS`)
- `packages/data7-core/src/project/parser/declaration-parsers/class-parser.ts`
- `packages/data7-core/src/project/ast/ast.ts`
- `packages/data7-core/src/analysis/symbol-indexer.ts`
- `packages/data7-core/src/analysis/type-resolver.ts`
- `packages/data7-core/src/project/parser/serializer.ts`
- `packages/data7-core/src/diagnostics/rules/types-rule.ts` ou nova regra de heranca

Testes minimos:

- parse e roundtrip com `MustInherit Class` e `NotInheritable Class`;
- build/preview nao contendo esses modificadores;
- erro de instanciacao abstrata;
- erro de herdar classe selada;
- obrigatoriedade de override em classe concreta e ausencia de erro em classe tambem `MustInherit`.

## Prioridade 3 - IntelliSense, contexto de lambda e casts

Status: concluido.

- [x] Corrigir completion com Ctrl+Space imediatamente apos ponto vazio em receivers resolviveis dentro de lambda, por exemplo `pItem.`, `CType(pItem, Form).` e `Form(pItem).`.
- [x] Garantir que lambda parameters entrem no escopo local com tipo correto e tenham precedencia sobre simbolos globais.
- [x] Melhorar `D7AstContext.getMemberAccessContext()` para preservar receiver e tipo mesmo quando o membro ainda esta vazio.
- [x] Unificar resolucao de cast entre `CType(expr, Tipo)` e `Tipo(expr)` para completion, hover, definition e diagnosticos.
- [x] Impedir todos os providers de operar dentro de comentarios e strings: completion, hover, definition, semantic tokens, references e rename.
- [x] Adicionar snippet de `Class` contendo `Sub New()` com `MyBase.New()` e `Sub Free()` com `MyBase.Free()`.

Arquivos provaveis:

- `packages/data7-core/src/analysis/d7-ast-context.ts` ou equivalente exportado por `@data7/core`
- `packages/data7-core/src/analysis/type-resolver.ts`
- `packages/data7-vscode/src/providers/completion-provider.ts`
- `packages/data7-vscode/src/providers/hover-provider.ts`
- `packages/data7-vscode/src/providers/definition-provider.ts`
- `packages/data7-vscode/src/providers/semantic-tokens-provider.ts`
- `packages/data7-vscode/language-configuration.json`

Testes minimos:

- completion apos `pItem.` dentro da lambda retorna somente membros de `TObject`;
- completion apos `CType(pItem, Form).` e `Form(pItem).` retorna membros de `Form`;
- typing com prefixo, como `.Ca`, preserva filtragem atual;
- comentarios com ponto nao disparam completion automatico;
- snippet `Class` insere construtor e `Free`.

## Prioridade 4 - Comentarios e configuracao de linguagem

Status: concluido.

- [x] Remover `'` de `autoClosingPairs` e `surroundingPairs` em `packages/data7-vscode/language-configuration.json`. Comentario Data7 e somente uma aspa simples ate o fim da linha, nao par de aspas.
- [x] Adicionar helper compartilhado `isPositionInCommentOrString(document, position)` usando `tokenizeLine`, para evitar condicoes duplicadas nos providers.
- [x] Cobrir quick suggestions em comentarios: a configuracao ja define `editor.quickSuggestions.comments = false`, mas provider manual ainda deve retornar `undefined` quando acionado por Ctrl+Space.

Testes minimos:

- digitacao de `'` nao cria `''`;
- Ctrl+Space em comentario retorna `undefined` ou lista vazia;
- hover/definition em simbolos escritos dentro de comentario retorna `undefined`.

## Prioridade 5 - Formatter orientado por lexer/AST

Status: concluido para o demo completo. O arquivo real `D:\DEV\Projects\data7\Modules\teste_arrays\src\antes_de_formatar.bas` e a referencia visual de formatacao esperada; a saida atual do formatter foi validada contra ele com `diffs=0`. O caso real `D:\DEV\Projects\data7\Modules\teste_arrays\src\mod_testes_array_primitivo.bas` tambem foi validado para o `ForEach` da linha 38: `ForEach( Sub...)` agora e normalizado para bloco canonico sem derrubar a indentacao do metodo externo.

- [ ] Substituir a logica atual baseada em regex rigida por uma estrategia hibrida: lexer para preservar comentarios/strings, parser/AST para blocos reconhecidos e fallback line-based somente para linhas opacas.
- [x] Usar a mesma lista canonica de modificadores do parser para declarar aberturas de bloco (`MustInherit`, `NotInheritable`, `MustOverride`, `Shadows`, `Shared`, `Overrides`, `Overridable`, `ReadOnly`, `Public`, `Private`, `Protected`).
- [x] Respeitar `_` como continuacao fisica: nao quebrar indentacao como nova instrucao e nao formatar a linha continuada como bloco independente.
- [ ] Preservar lambda-methods e arrow/lambda sugars sem exigir `End Function` quando a sintaxe for a variante permitida.
- [x] Manter formatacao deterministica mesmo com parser parcial: erros locais nao devem reindentar todo o restante do arquivo de modo cascata.
- [x] Adicionar uma fase lexical que calcule contexto de expressao por linha: profundidade de parenteses `()`, colchetes `[]`, generics `<T>` quando parte de chamada, continuation `_`, linha terminada em `.` e argumentos separados por virgula.
- [x] Indentar chamadas multiline mantendo o corpo entre `Metodo(` e `)` um nivel acima da chamada, com fechamento `)` alinhado ao inicio da chamada quando ele estiver sozinho.
- [x] Indentar arrays literais multiline, como `Dim produtos[] As Produto = [` com itens internos um nivel acima e `]` alinhado ao inicio da declaracao.
- [x] Reconhecer lambdas VB-like em contexto de expressao (`Function(...) As T` / `Sub(...)`) como blocos reais mesmo sem nome, com `End Function`/`End Sub` alinhado a abertura da lambda e o corpo um nivel acima.
- [x] Normalizar lambdas de bloco coladas no argumento de chamada (`Metodo(Sub(...)` ou `Metodo(            Sub(...)`) para a forma canonica `Metodo(` + `Sub(...)` + corpo + `End Sub` + `)`.
- [x] Preservar comentarios e diretivas dentro de lambdas/chamadas na indentacao do contexto atual, por exemplo `' data7:disable-next-line ...` dentro de `Function(...)`.
- [x] Preservar cadeias funcionais multiline (`produtos. _`, `Filter(...). _`, `Map<String>(...)`) e nao mover segmentos encadeados para coluna zero.
- [x] Separar regra de "formatar" de regra de "corrigir sintaxe": se uma cadeia sem `_` for invalida semanticamente, o formatter ainda deve evitar cascata de desindentacao e deixar o diagnostico estrutural para o linter.
- [x] Evitar que palavras-chave dentro de strings/comentarios ou em lambdas inline curtas alterem a pilha de indentacao.

Arquivos provaveis:

- `packages/data7-vscode/src/providers/formatter-provider.ts`
- `packages/data7-core/src/project/parser/lexer.ts`
- possivel helper novo em `packages/data7-core/src/project/formatter/`
- fixture de regressao baseada em `D:\DEV\Projects\data7\Modules\teste_arrays\src\antes_de_formatar.bas` ou copia canonica minimizada em `packages/data7-vscode/src/test/providers/fixtures/formatter/`

Testes minimos:

- blocos com modificadores de classe/metodo;
- lambdas e lambda-methods;
- chamadas e expressoes com `_`;
- chamadas multilinha com lambdas como argumento (`Find(Function...)`, `Reduce(Function..., 0)` e `ForEach(Sub...)`);
- cadeias funcionais multiline com `.` e `._`;
- arrays literais multiline com objetos `New Produto(...)`;
- arquivo contendo erro local de member access incompleto;
- comentarios e strings com palavras-chave.

## Prioridade 6 - Documentacao, exemplos e governanca

Status: concluido para esta entrega.

- [x] Atualizar `data7_basic_syntax_guide.md` com a separacao entre linguagem nativa, regras endurecidas pela extensao e supersets nao nativos.
- [x] Atualizar `docs/linguagem-basic/*` correspondentes, principalmente classes, sintaxe, delegates, acucares atuais, limitacoes conhecidas e diagnostic codes.
- [x] Atualizar `CHANGELOG.md`, `project_context.md` e exemplos canonicos em `docs/example/` conforme cada implementacao for concluida.
- [x] Adicionar o arquivo demo reduzido como fixture de regressao, sem depender do caminho externo `D:\DEV\Projects\data7\Modules\teste_arrays`.
- [x] Rodar `npm run test` para parser/linter/providers afetados e `npm run verify` antes de concluir a implementacao completa.

## Sequencia recomendada

1. P0 primeiro: sem parser resiliente os diagnosticos e providers sofrem cascata.
2. P3 em paralelo apos P0 minimo: completion depende do member access vazio e do contexto de lambda.
3. P1 depois da base sintatica: regras semanticas ficam mais confiaveis com AST correta.
4. P2 antes de build/preview final: modificadores abstrato/selado precisam existir no AST e desaparecer no serializer.
5. P4 junto com P3: comentarios afetam todos os providers.
6. P5 por ultimo: formatter deve consumir a linguagem ja estabilizada.
7. P6 continuamente a cada diagnostico/sugar entregue.

## Criterios de aceite do demo

- O payload nao deve conter `unknown-symbol` para `Class`, `Teste4` ou `Teste5` causados por `MustInherit`/`NotInheritable`.
- `CType(pItem, Form).Margins.` deve gerar erro local de membro incompleto, sem atribuir o comentario seguinte ao membro.
- `pItem.`, `_minhaDimDentroDeModTeste.` e `CType(pItem, Form).Cap` devem gerar diagnosticos locais coerentes.
- `Using` sem `End Using` deve gerar erro de fechamento ausente.
- `Print "..."` deve gerar warning com quick fix para `Print(...)`.
- Acessos standalone a propriedades/campos devem ser erro; chamada de metodo standalone deve continuar aceita.
- `Const minhaConstInteger As Integer = 1234` deve ser erro.
- `Shared _propSharedNaoValida As Integer` deve ser erro.
- `Public Sub ...` deve gerar warning removivel.
- Declaracoes nao usadas devem gerar warning visual e quick fix explicito, sem autofix automatico.
- Comentarios nao devem acionar completion/hover/definition/semantic processing.
- Build/preview final nao deve emitir `MustInherit` nem `NotInheritable` para o compilador Data7.
