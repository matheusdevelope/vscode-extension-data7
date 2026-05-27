# Namespace `System.Classes`

> Documentação gerada automaticamente pela extensão **Data7 Dev Studio**.
> Reflete o estado atual da System Library reconhecida pelo linter / IntelliSense.

## 1. Visão geral

Namespace contendo as classes bases de persistência e strings do Delphi (TObject, TPersistent, TStrings, TStringList).

**Como importar:**

```basic
Imports System.Classes
```

## 2. Árvore de herança das classes

```
System.Classes.TObject  (externo)
└─ TPersistent
```

## 3. Classes (com membros próprios)

> Cada classe lista apenas seus membros **próprios**. Membros herdados podem ser consultados nas classes ancestrais via os links da cadeia de herança no topo de cada seção.

#### `TObject`

Classe base de todos os objetos nativos Delphi no namespace System.Classes.

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `AfterConstruction` | `Void` | `()` | Hook chamado logo após o último construtor da hierarquia; permite executar lógica que depende do objeto totalmente construído. |
| `BeforeDestruction` | `Void` | `()` | Hook chamado imediatamente antes de o primeiro destrutor da hierarquia executar; permite limpeza que depende de o objeto ainda estar íntegro. |
| `ClassName` | `String` | `()` | Retorna o nome da classe do objeto como uma string. |
| `ClassNameIs` | `Boolean` | `(pName As String)` | Verifica se o nome da classe do objeto é igual ao nome fornecido. |
| `ClassParent` | [`TObject`](#tobject) | `()` | Retorna a classe pai direto da classe deste objeto. |
| `ClassType` | `TClass` | `()` | Retorna a referência ao tipo (metaclasse TClass) do objeto, útil em comparações TObject1.ClassType = TObject2.ClassType. |
| `Create` | [`TObject`](#tobject) | `()` | Construtor padrão sem parâmetros (descendentes geralmente sobrescrevem). |
| `DefaultHandler` | `Void` | `(ByRef Message As PVOID)` | Handler invocado por Dispatch quando nenhum método específico processa a mensagem. |
| `Destroy` | `Void` | `()` | Destrutor virtual da classe — prefira `Free` para liberar a instância (Free testa Self antes de chamar Destroy). |
| `Dispatch` | `Void` | `(ByRef Message As PVOID)` | Despacha uma mensagem (Windows ou definida pelo usuário) para o handler correspondente; chama DefaultHandler quando nenhum método casa. |
| `DisposeOf` | `Void` | `()` | Libera a memória e destrói o objeto se ele tiver sido criado dinamicamente. |
| `Equals` | `Boolean` | `(Obj As TObject)` | Compara este objeto a outro (igualdade lógica) — a implementação padrão usa identidade de referência. |
| `FieldAddress` | `Pointer` | `(Name As ShortString)` | Retorna o endereço de um campo da classe a partir do nome publicado (RTTI legacy). |
| `Free` | `Void` | `()` | Libera a memória alocada pelo objeto (Destrutor nativo Delphi). |
| `FreeInstance` | `Void` | `()` | Libera a memória de uma instância (uso baixo nível — chamado pelo runtime no Destroy). |
| `GetHashCode` | `Integer` | `()` | Retorna o código hash do objeto (identificador único no ecossistema Delphi). |
| `GetInterface` | `Boolean` | `(IID As TGUID, ByRef Obj As PVOID)` | Tenta obter a interface identificada por IID a partir deste objeto; preenche `Obj` quando a interface é suportada e retorna True/False. |
| `InheritsFrom` | `Boolean` | `(pClass As TObject)` | Verifica se a classe do objeto herda de uma determinada classe. |
| `InstanceSize` | `Integer` | `()` | Retorna o tamanho em bytes alocado para uma instância da classe (sizeof do objeto em memória). |
| `MethodAddress` | `Pointer` | `(Name As ShortString)` | Retorna o endereço de um método publicado a partir do nome (RTTI legacy). |
| `MethodName` | `ShortString` | `(Address As Pointer)` | Retorna o nome de um método publicado a partir de seu endereço (RTTI legacy). |
| `NewInstance` | [`TObject`](#tobject) | `()` | Aloca memória para uma nova instância (uso baixo nível — chamado pelo runtime no Create). |
| `SafeCallException` | `HRESULT` | `(ExceptObject As TObject, ExceptAddr As Pointer)` | Tratador padrão de exceções para métodos `safecall` — converte a exceção em HRESULT para callers COM. |
| `ToString` | `String` | `()` | Retorna a representação textual do objeto. |

#### `TPersistent`

**Herda de:** [`TObject`](#tobject)

Classe ancestral para todos os objetos nativos Delphi que suportam atribuição e persistência em streams.

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Assign` | `Void` | `(pSource As TObject)` | Copia o conteúdo de outro objeto compatível para esta instância. |
| `GetNamePath` | `String` | `()` | Retorna o nome do objeto como aparece no Inspetor de Objetos. |

---

_2 classes/tipos, 0 delegates, 0 funções, ~26 membros próprios em classes, 0 constantes associadas a tipos enumerados._

_Snapshot `2616b20d9001` — gerado em 2026-05-27T21:04:59.250Z pela extensão Data7 Dev Studio._
