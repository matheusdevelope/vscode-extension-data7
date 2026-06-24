# 11 — Limitações conhecidas

> Inventário das limitações da linguagem Data7 Basic — o que **não** existe (e por quê), separando "limitação intrínseca do runtime" de "ainda não implementado".

## Limitações intrínsecas do runtime

Estas são restrições do compilador/runtime do ERP Data7. **Nenhum açúcar do transpiler vai contorná-las** sem suporte explícito do runtime.

### 1. Sem closures com captura

Lambdas inline com captura léxica (estilo TypeScript/C#) **não existem**:

```basic
' TypeScript:
const limit = 100;
list.filter(item => item.valor > limit);  // 'limit' capturado

' Data7: IMPOSSÍVEL escrever assim. Use Delegate nomeado com 'extra As Variant'.
```

**Workaround idiomático**: padrão `extra As Variant` em todas as APIs de ordem superior (vide [06-delegates.md](./06-delegates.md)).

### 2. Sem `async`/`await` / `Promise` / `Task`

Não há concorrência baseada em continuações. As únicas primitivas de paralelismo:

- `BeginThread(...)` / `EndThread` (System) — threads OS-level, sem coordenação alto-nível.
- Não há `Promise<T>`, `Task<T>`, `await`, `async`.

### 3. Sem iteradores (`yield`)

Sem coroutines. `For Each` consome um operando que expõe `Count` + indexer inteiro — não há `IEnumerable<T>.GetEnumerator()`.

### 4. Sem operator overloading

Operadores `+`, `-`, `*`, `=`, `<` etc. são **fixos** para tipos primitivos e `String`. Classes não podem redefinir comportamento.

### 5. Sem reflection runtime plena

Há `obj.ClassName()`, `obj.ClassNameIs("X")`, `obj.InheritsFrom(T)` — mas:

- Não há enumeração runtime de campos/propriedades.
- Não há criação dinâmica de tipos.
- Não há acesso a metadados de atributos/decorators.

### 6. Sem `Symbol` / `WeakRef`

Conceitos JS/TS que dependem de garbage collector + identidade. Data7 usa reference counting via `TInterfacedObject` ou liberação manual via `Free`.

### 7. Sem varargs runtime / spread em chamada

```basic
' TypeScript:
function foo(...args: number[]) { ... }
foo(1, 2, 3);   // aridade dinâmica

' Data7: aridade da chamada é FIXA em compile-time. Não há equivalente.
```

Workaround: aceitar `TList<Variant>` ou `StringList` como parâmetro único:

```basic
Sub Log(prefix As String, args As StringList)
   For Each a As String In args
      Print prefix & a
   Next
End Sub
```

### 8. Sem rest params reais

Mesma raiz da limitação #7. A função decora uma coleção como parâmetro, não usa varargs runtime.

### 9. Sem discriminated unions / sum types

Tipos como `type Result<T, E> = Ok<T> | Err<E>` não têm representação nominal em runtime. Use enum-like (TEnum pattern) + campo `Variant` ou herança polimórfica.

### 10. Sem coleção genérica nativa

A System Library oferece **apenas** `Collections.StringList` (lista de strings + objetos opcionais). Não há `TList<T>`, `TDictionary<K,V>`, `TQueue<T>`, `TStack<T>` nativos.

**Workaround atual**: classes tipadas derivando de uma `TTList` base (vide [12-convencoes-idiomaticas.md](./12-convencoes-idiomaticas.md)) ou templates `TList<T>` monomorfizados pelo Builder/preview/MCP (vide [07-generics.md](./07-generics.md)).

### 11. Sem `Enum` nativo

Data7 Basic não tem palavra-chave `Enum`. O equivalente é o padrão **`TEnum`** — classe que herda de `TEnum` e usa `Shared` factory methods (vide [12-convencoes-idiomaticas.md](./12-convencoes-idiomaticas.md)).

**Workaround atual de tooling**: sugar `Enum X / End Enum` gera a classe `TEnum` equivalente (vide [10-acucares-atuais.md § D1](./10-acucares-atuais.md#fase-d--enum-declarativo)).

### 12. Sem interface natively + `Implements`

Existe `Interface` nominal em algumas hierarquias (`IXMLNode`, `IXMLNodeList`) — herdadas do Delphi — mas o programador **não** pode declarar `Interface IRepository / End Interface` no `.bas` (em investigação).

**Workaround atual**: definir uma classe abstrata como contrato.

### 13. Sem captura nominal por unidade (top-level closures)

Variáveis declaradas no topo de `Principal.bas` viram globais — não é "closure", é **escopo global** mesmo. Cuidado com nomenclatura para evitar colisões.

### 14. Sem object literal anônimo

```typescript
const x = { nome: "João", idade: 30 };  // TypeScript
```

Não existe no Data7. Tem que declarar uma `Class` nominal. Workaround `Variant` com pares Nome=Valor em `StringList` é pobre.

### 15. Sem array literal `[...]`

```typescript
const xs = [1, 2, 3];  // TypeScript
```

Não existe diretamente. **Workaround atual**:

```basic
Dim xs As New StringList
xs.Add("1")
xs.Add("2")
xs.Add("3")
```

**Workaround futuro**: sugar `From { 1, 2, 3 }` em construtor (vide [10-acucares-atuais.md § B4](./10-acucares-atuais.md#fase-b--inicializacao-e-objeto)).

### 16. Sem `Slice`, `Splice`, `Filter`, `Map`, `Reduce` em `StringList`

A `StringList` é uma lista crua sem métodos funcionais. Para coleções tipadas você implementa esses operadores manualmente herdando de uma `TTList` base (vide [06-delegates.md](./06-delegates.md)).

### 17. Sem subscript operator `lista[i]`

A sintaxe é sempre **chamada de método**: `lista.Strings(i)`, `lista.Item(0)`.

**Workaround futuro**: default indexer (vide [10-acucares-atuais.md § C5](./10-acucares-atuais.md#fase-c--coletas-e-generics)) — `lista(i)` vira `lista.Item(i)`.

### 18. Comportamento ambíguo de `+` com `String` + numérico

```basic
Dim s As String = "Total: " + 42   ' coerce surpreendente; pode falhar em runtime
```

Use sempre `&` para concatenação:

```basic
Dim s As String = "Total: " & 42   ' coerce numérico para String corretamente
```

### 19. Comparação de string case-sensitive por default

`"abc" = "ABC"` é `False`. Use `UCase(a) = UCase(b)` para case-insensitive.

### 20. Sem `Try/Finally` automático em recursos

Recursos (Forms, DataSets, FileStreams) precisam de `Free()` manual em `Finally`:

```basic
Dim form As New TForm
Try
   form.Show()
Finally
   form.Free()
End Try
```

**Workaround atual de tooling**: sugar `Using x As New T(...) / ... / End Using` expande para `Try/Finally/x.Free()` (vide [10-acucares-atuais.md § B2](./10-acucares-atuais.md#fase-b--inicializacao-e-objeto)).

## Limitações da System Library

Adicionais ao runtime — esses **podem** mudar conforme a extensão evolui:

### Membros marcados `unsupported`

Muitos membros herdados de VCL/Delphi (`Caption`, `Color`, `Constraints`, `Padding`, …) **existem nos tipos** mas o compilador Data7 não os traduz. Vide diagnóstico [`unsupported-member`](./13-diagnostic-codes.md#unsupported-member). Use as alternativas Data7 (`Title`/`Titulo` em vez de `Caption`, etc.).

### `Net` é minúsculo

Só `TFTP`. Para HTTP/REST use `THTTP` (global, em `Globals/`). Não há WebSocket, gRPC, GraphQL.

### `Drawing` é limitado

Só `TCanvas.MoveTo`/`Rectangle` + `TPen` (Color/Width). Sem `TextOut`, `LineTo`, `Polygon`, `Brush` (no nível Data7 do desenho).

### `Environment` é minúsculo

Só `Execute(file, params, wait)`. Não há variáveis de ambiente, registry, info de OS.

### `SQL` é FireDAC por baixo, mas...

A maior parte da API FireDAC avançada (`Macros`, `FetchOptions`, `Aggregates`, `MasterSource`, `Connection` direto, `Constraints`, `Bookmark`, `State`, `Data`, `Delta`, `FieldDefs`, `Fields`) está marcada como `unsupported-member`. Use só: `CommandText`/`SQL`, `Param()`, `Field()`, `Open`/`ExecSQL`/`Close`, navegação `First`/`Next`/`Prior`/`Last`/`Eof`/`Bof`, `RecordCount`, `IsEmpty`, `Active`.

## Limitações do tooling atual (a extensão)

Estas a extensão **pode** evoluir — vide [10-acucares-atuais.md](./10-acucares-atuais.md):

| Item | Status |
|---|---|
| Generics em `.bas` (`Class TList<T>`) | ativo via parser/AST + `src/project/generics/` |
| Null narrowing após guardas `NULL` | implementado para os padrões cobertos por `src/analysis/flow-analyzer.ts` |
| Inferência de literais (`Dim x = 42` → `Integer`) | parcial; cobre literais e casos usados por transpiler/resolver, não todos os fluxos arbitrários |
| Inferência por cadeia (`a.b().c().d`) | só 1 nível |
| `For Each (k, v) In dict` | não implementado |
| Optional chaining `?.` | implementado nos contextos suportados pelo transpilador |
| Null-coalescing `??` | implementado em RHS de assignment suportado |
| Pipe `\|>` | implementado como sugar de chamada encadeada |
| Decorators `@Singleton` | não implementado |

## Cross-references

- [10-acucares-atuais.md](./10-acucares-atuais.md) — açúcares atuais e planejados.
- [12-convencoes-idiomaticas.md](./12-convencoes-idiomaticas.md) — padrões para contornar limitações.
- [`docs/system-library/README.md`](../system-library/README.md) — catálogo completo.
- [`src/diagnostics/diagnostic-codes.ts`](../../src/diagnostics/diagnostic-codes.ts) — diagnósticos que sinalizam limitações.
