# 06 — Exemplos práticos end-to-end

> Três cenários realistas que mostram o MCP do Data7 trabalhando "no fluxo". Cada cenário descreve o **prompt** que você dá ao agente, a **sequência de tools/prompts** que ele invoca e o **resultado esperado**.

## Cenário A — IA escreve `mod_payments` do zero

**Prompt humano**: "Crie um módulo `mod_payments` com uma classe `TPayment` que herda de `TRecord` e tem os campos `Valor` (Double), `Data` (TDateTime) e `Status` (que é um enum com Pendente/Pago/Cancelado). Inclua também uma `TPaymentList` tipada."

**Sequência de tools**:

1. `data7://idioms` — IA carrega convenções idiomáticas + limitações para entender que `Status` não deve ser `Integer` mas sim BaseEnum.
2. `data7_module_skeleton` com `{ moduleName: "mod_payments", namespaceName: "mod_payments", className: "TPayment", baseClass: "TRecord" }` — gera o esqueleto do arquivo principal.
3. `data7_baseenum_pattern` com `{ enumName: "PaymentStatus", values: "Pendente,Pago,Cancelado" }` — gera a classe enum.
4. `data7_typed_recordlist` com `{ elementTypeName: "TPayment" }` — gera `TPaymentList` + 3 delegates.
5. `data7_lint_project` com os 3 arquivos (`mod_payments.bas` montado, `mod_payment_status.bas`, `mod_payment_list.bas`) — verifica que tudo está limpo antes de devolver para o humano.

**Resultado**: o humano recebe 3 arquivos `.bas` prontos, todos passando no linter. Tempo: ~10 segundos. Tokens consumidos: ~3 k (vs ~60 k+ que seriam carregados se a IA usasse `AGENTS.md`).

## Cenário B — IA refatora classe legada para usar BaseEnum

**Prompt humano**: "Esse `CardAdm` está usando `Integer` cru. Refatore para o padrão BaseEnum."

```basic
' arquivo enviado pelo usuário
Class CardAdm
   Public Const Stone As Integer = 0
   Public Const Cielo As Integer = 1
   Public Const Rede As Integer = 2
End Class
```

**Sequência de tools**:

1. `data7_lint_bas` com o código original — IA confirma que o código atual compila mas não segue o padrão (não emite diagnóstico específico, só usa para entender o contexto).
2. `data7://language/convencoes-idiomaticas` — IA carrega a convenção BaseEnum para fundamentar a refatoração.
3. `data7_baseenum_pattern` com `{ enumName: "CardAdm", values: "Stone,Cielo,Rede" }` — gera o substituto.
4. `data7_lint_bas` no resultado — confirma que a versão nova passa (sem `missing-import` exceto pelo próprio BaseEnum vir de um módulo do workspace).
5. `data7_suggest_import` com `{ typeName: "BaseEnum" }` — confirma qual módulo importar.

**Resultado**:

```basic
Imports mod_base_enum

Class CardAdm
   Inherits BaseEnum

   Private Shared _Initialized As Boolean

   Private Shared Sub Initialize()
      If _Initialized Then Exit Sub
      BaseEnum._AddEnumItem("CardAdm", New CardAdm(0, "Stone"))
      BaseEnum._AddEnumItem("CardAdm", New CardAdm(1, "Cielo"))
      BaseEnum._AddEnumItem("CardAdm", New CardAdm(2, "Rede"))
      _Initialized = True
   End Sub

   ' Shared Function Stone, Cielo, Rede ...
   ' Load(Integer), Load(String), Load(CardAdm), GetOptions()
End Class
```

A IA também alerta o humano: "Isso muda a forma de comparar — antes `If x = CardAdm.Stone` (`Integer`), agora `If x = CardAdm.Stone()` ou `Select x.AsInteger`. Quer que eu busque os call sites?"

## Cenário C — IA corrige `missing-import` em arquivo grande (multi-file)

**Prompt humano**: "Esse arquivo está dando 5 erros `missing-import`. Corrija."

```basic
' arquivo enviado pelo usuário (sem Imports algum)
Namespace mod_dashboard
   Class TDashboard
      Sub Render()
         Dim http As New THTTP
         Dim json As New TJSONObject
         Dim list As StringList
         Dim form As TForm
         Dim cmd As Command
         ' ...
      End Sub
   End Class
End Namespace
```

**Sequência de tools**:

1. `data7_lint_bas` com o código — IA recebe 5 diagnósticos `missing-import` com payload `{ namespace: "...", typeName: "..." }` para cada um. (Note: `THTTP` é Global, não precisa de Imports, então só vem `unknown` ou nada para ele.)
2. Para cada `missing-import`, IA chama `data7_suggest_import` (na maioria dos casos o payload já tem o namespace, mas a tool valida; serve também quando há múltiplas alternativas).
3. IA junta as `Imports` deduplicadas, escreve no topo do arquivo, e chama `data7_lint_bas` de novo para confirmar.

**Resultado**:

```basic
Imports Collections
Imports Forms
Imports SQL

Namespace mod_dashboard
   Class TDashboard
      Sub Render()
         Dim http As New THTTP             ' THTTP é Global, não precisa de Imports
         Dim json As New TJSONObject        ' TJSONObject é Global, idem
         Dim list As StringList             ' Collections.StringList → Imports Collections
         Dim form As TForm                  ' Forms.TForm → Imports Forms
         Dim cmd As Command                 ' SQL.Command → Imports SQL
         ' ...
      End Sub
   End Class
End Namespace
```

A IA explica ao usuário que `THTTP` e `TJSONObject` são tipos **globais** (do `Globals/` da System Library) e por isso não precisam de `Imports` — informação que ela colheu do Resource `data7://language/system-library`.

## Cenário D — IA monta uma tela de listagem de clientes do zero

**Prompt humano**: "Crie uma tela que lista clientes num grid, com um botão Atualizar."

**Sequência de tools**:

1. `data7://language/construindo-telas` — a IA carrega o idioma de telas (layout `Align`, hierarquia de pais, ciclo `Show`/`Free`).
2. `data7_list_controls { "filter": "Grid" }` — confirma que `Grid` existe e é instanciável (`isBase: false`).
3. `data7_describe_symbol { "qualifiedName": "Forms.Grid" }` — recebe os membros (`Cells`, `ColCount`, `RowCount`, `FixedRows`) + o `formUsageHint` com instanciação e eventos.
4. `data7_form_skeleton { "className": "TFormClientes", "namespaceName": "mod_clientes", "title": "Clientes", "layout": "list" }` — gera o esqueleto da tela de listagem (toolbar com botão "Atualizar" + Grid `alClient` + `_carregar()` que preenche o cabeçalho).
5. `data7_lint_bas` no resultado — confirma que está limpo antes de devolver.

**Resultado**: o humano recebe uma classe `TFormClientes` pronta, com o grid e o botão fiado, e só precisa preencher `_carregar()` com os dados reais (ex.: de um `SQL.Command`). Tudo passa no linter. Contexto consumido: ~2 k tokens.

A IA lembra o usuário do padrão de células: `me._grid.Cells(coluna, linha) = valor`, com a primeira linha (`FixedRows = 1`) servindo de cabeçalho — informação que veio de `data7://examples/forms/05-grid-com-dados`.

## Padrão geral

Note como em todos os cenários o agente:

1. **Consulta** um Resource para enquadrar o contexto (`docs/linguagem-basic/`, `docs/idioms`).
2. **Gera** código novo via prompt template OU **busca** símbolos existentes via Tool.
3. **Valida** com `data7_lint_bas` / `data7_lint_project` antes de devolver.

Esse ciclo `consultar → gerar → validar` é o que torna o MCP qualitativamente superior ao `AGENTS.md`: o agente trabalha **com feedback executável** em vez de só com texto.
