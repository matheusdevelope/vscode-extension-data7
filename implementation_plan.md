# Correções do Linter — Principal.bas (mod_identificar_falhas_linter)

O arquivo `Principal.bas` contém 7 categorias de problemas que servem como exemplos de sintaxe para o linter detectar. Abaixo está a análise completa de cada categoria e o plano de correções.

---

## Análise dos Problemas

### Categoria 1 — Falta de tipo de retorno em `Property` e `Function`

**Linhas:** 22, 29, 34

```bas
' 1 - erro: falta tipo
Property PropertyDeExemplo     ' deveria ser: Property PropertyDeExemplo As <tipo>
' 1.1 - erro: falta tipo
Function FunctionDeExemplo()   ' deveria ser: Function FunctionDeExemplo() As <tipo>
' 1.2 - erro: falta tipo (Shared Function)
Shared Function SharedFunctionDeExemplo()
```

**Status atual:** O linter **NÃO detecta** isso. `control-flow-rule.ts` só verifica a presença de `node.returnType` para decidir se é uma função — nunca emite erro quando `returnType` está ausente em `Function`/`Property`.

---

### Categoria 2 — Função com retorno declarado mas sem `Return`/atribuição

**Linha:** 39

```bas
Function FunctionAsIntegerDeExemplo(...) As Integer
    print("...")
    print(pSubTitle)
End Function   ' nunca define o valor de retorno
```

**Status atual:** ✅ **JÁ IMPLEMENTADO** via `ASTFlowAnalyzer` → código `missing-return-value`. Sem mudança necessária.

---

### Categoria 3 — Encadeamento direto na instanciação (`New T().Membro`)

**Linhas:** 50, 51, 52

```bas
Dim _valorFn  As String = New Exemplo().FunctionDeExemplo()
Dim _valorPrp As String = New Exemplo().PropertyDeExemplo
New Exemplo().SubDeExemplo()
```

**Status atual:** O código `ChainedGlobalFunctionAssignment` existe, mas cobre o padrão diferente (atribuição do nome de função própria consumindo resultado de chamada global). O padrão `New T().Membro` em atribuição (`VariableDeclaration` / `Assignment`) não está coberto por nenhuma regra específica.

> [!IMPORTANT]
> Este é o ponto mais complexo. Precisamos verificar se `ObjectCreationExpression` aparece como raiz de um `MemberAccess` ou `MethodInvocation` em contexto de atribuição/declaração.

---

### Categoria 4 — Property sem parâmetros acessada com `()` ou `[]`

**Linhas:** 57, 58

```bas
Dim _valorDaPropParenteses As String = _exemplo.PropertyDeExemplo()
Dim _valorDaPropColchetes  As String = _exemplo.PropertyDeExemplo[]
```

**Status atual:** O linter já detecta acesso com `()` a uma property sem parâmetros através de `resolveParameterlessFinalCall` (que dispara `CallParenthesesMismatch`). O acesso com `[]` provavelmente depende de como o parser trata isso. **Requer investigação do AST gerado para `[]`.**

---

### Categoria 5 — Membro de classe usado no escopo global sem objeto

**Linhas:** 62, 63, 64

```bas
Dim _tentandoAcessarPropDiretoNoEscopoGlobal String = PropertyDeExemplo
Dim _tentandoAcessarFnDireto                String = FunctionAsIntegerDeExemplo
Dim _tentandoAcessarFn2Direto               String = FunctionAsIntegerDeExemplo()
```

**Status atual:** Há um problema de tipo nessa linha (falta `As` antes de `String`), então talvez o parser nem gere nós válidos. Para o identificador `PropertyDeExemplo` solto sem objeto, o `checkIdentifier` em `members-rule.ts` já dispara `UnknownSymbol` porque ele só existe no escopo da classe — **mas somente quando o parser gera um `Identifier` node** para esse token.

> [!WARNING]
> A linha tem sintaxe inválida (falta `As`). O arquivo `.bas` precisa ter a declaração corrigida para que o linter possa agir corretamente.

---

### Categoria 6 — Acesso estático de membro não-`Shared` via tipo

**Linhas:** 67, 68

```bas
Exemplo.SubDeExemplo()
print(Exemplo.FunctionAsIntegerDeExemplo())
```

**Status atual:** ✅ **JÁ IMPLEMENTADO** via `InstanceMemberAccessOnType` em `members-rule.ts` (linhas 149–164 e 301–322). O código já emite erro quando `isStaticAccess && !resolved.isShared`.

---

### Categoria 7 — Instanciação sem parâmetros quando o construtor exige / chamadas com aridade errada

**Linhas:** 71, 73, 75

```bas
Dim _teste As New Exemplo()       ' sem args, mas todos construtores exigem pelo menos 1
print(_teste.FunctionAsIntegerDeExemplo())   ' faltam args obrigatórios
print(_teste.FunctionAsIntegerDeExemplo(123)) ' OK: pSubTitle tem valor padrão
```

**Status atual:**

- `AutoNewNonDefaultCtor` existe como código no `diagnostic-codes.ts` mas **não é emitido** por nenhuma regra atual para `Dim x As New T()` sem parênteses — é apenas para `auto-new`.
- A validação de aridade de construtores em `New T(args)` via `checkObjectCreationExpression` **não existe ainda** (só verifica `MustInherit`).

---

## Mudanças Necessárias

### Categoria 1 — Implementar verificação de tipo ausente em `Property`/`Function`

#### [MODIFY] [control-flow-rule.ts](file:///D:/DEV/Projects/data7/vscode-extension-data7/packages/data7-core/src/diagnostics/rules/control-flow-rule.ts)

Em `checkMethodDeclaration`, adicionar verificação: se `node.kind` é `Function` (i.e., o token no código-fonte indica `Function` ou `Property`, não `Sub`) **mas** `node.returnType === undefined`, emitir `DiagnosticCodes.MissingReturnType`.

#### [NEW] Novo código em `diagnostic-codes.ts`

Adicionar `MissingReturnType: "missing-return-type"` ao `DiagnosticCodes`.

> [!IMPORTANT]
> O AST distingue Function de Sub pela presença de `returnType`? Ou pela presença de `isFunction: true`? Precisa verificar o tipo `MethodDeclaration` no AST.

---

### Categoria 3 — Encadeamento em instanciação

#### [MODIFY] [control-flow-rule.ts](file:///D:/DEV/Projects/data7/vscode-extension-data7/packages/data7-core/src/diagnostics/rules/control-flow-rule.ts)

Adicionar verificação em `checkAssignmentFlow` e/ou criar novo `checkVariableDeclarationFlow` para detectar quando o inicializador de uma `VariableDeclaration` ou o valor de um `Assignment` contém uma cadeia `ObjectCreationExpression → MemberAccess/MethodInvocation`.

---

### Categoria 5 — Sintaxe corrigida no `.bas` (falta `As`)

#### [MODIFY] [Principal.bas](file:///D:/DEV/Projects/data7/Modules/mod_identificar_falhas_linter/src/Principal.bas)

Corrigir declarações malformadas nas linhas 62–64 (falta `As`) para que o parser as processe corretamente e o linter possa atuar sobre os identificadores.

---

### Categoria 7 — Validação de construtores e aridade

#### [MODIFY] [types-rule.ts](file:///D:/DEV/Projects/data7/vscode-extension-data7/packages/data7-core/src/diagnostics/rules/types-rule.ts)

Em `checkObjectCreationExpression`, após verificar `MustInherit`, adicionar verificação de aridade: se a classe tem construtores declarados e nenhum deles aceita os argumentos fornecidos (ou nenhum parâmetro quando nenhum argumento é fornecido), emitir `AutoNewNonDefaultCtor` ou um novo código de erro `ConstructorArityMismatch`.

---

## Open Questions

> [!IMPORTANT]
> **Q1 (Categoria 1):** Como o AST representa `Function` sem `As <tipo>`? O token `Function` gera um `MethodDeclaration` com `returnType: undefined`? Ou o parser já infere `Variant`? Precisa verificar `ast.ts` ou o parser para entender se é possível distinguir uma `Function` de um `Sub` sem `returnType`.

> [!IMPORTANT]
> **Q2 (Categoria 3):** Qual o comportamento desejado: erro (impede execução) ou warning (alerta)? A sintaxe `New T().Membro` é tecnicamente válida em algumas linguagens mas indesejável em Data7?

> [!IMPORTANT]
> **Q3 (Categoria 5):** Devo corrigir a sintaxe do arquivo `.bas` de exemplo (adicionar `As`) para que o linter possa verificar os identificadores? Ou o teste pretende mostrar que a sintaxe sem `As` também deve ser tratada de outra forma?

> [!WARNING]
> **Q4 (Categoria 7):** A validação de construtores exige que o indexador saiba quais overloads de `Sub New` estão declarados e quais parâmetros cada um aceita. Isso já está disponível em `SymbolInfo.overloads`? Ou requer extensão do indexador?

---

## Verificação Prevista

```bash
npm run test   # testes unitários de diagnósticos
npm run verify # build + lint + testes
```

Testes de regressão serão adicionados em `packages/data7-core/src/test/diagnostics/diagnostics.test.ts` para cada novo código de diagnóstico.
