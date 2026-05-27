# Namespace `XML`

> Documentação gerada automaticamente pela extensão **Data7 Dev Studio**.
> Reflete o estado atual da System Library reconhecida pelo linter / IntelliSense.

## 1. Visão geral

Conteúdo bruto do XML em uma lista de strings (linhas).

**Como importar:**

```basic
Imports XML
```

## 2. Árvore de herança das classes

```
TObject  (externo)
├─ IXMLNode
├─ IXMLNodeList
└─ TXMLDocument
```

## 3. Classes (com membros próprios)

> Cada classe lista apenas seus membros **próprios**. Membros herdados podem ser consultados nas classes ancestrais via os links da cadeia de herança no topo de cada seção.

#### `IXMLNode`

**Herda de:** `TObject`

**Cadeia completa:** `TObject` → `System.Classes.TObject`

Nó individual de um documento XML contendo propriedades, atributos e nós filhos.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `NodeValue` | `Variant` | Lê ou configura o valor de texto contido neste nó (OleVariant). |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `_AddRef` | `Integer` | `()` | Herdado de IUnknown — incrementa o contador de referências da interface. |
| `_GetAttribute` | `Variant` | `(I As String)` | Acessor interno (getter) para um atributo XML identificado pelo nome. |
| `_GetNodeValue` | `Variant` | `()` | Acessor interno (getter) da propriedade NodeValue (OleVariant). |
| `_Release` | `Integer` | `()` | Herdado de IUnknown — decrementa o contador de referências; libera a instância ao chegar a zero. |
| `_SetAttribute` | `Void` | `(I As String, Value As Variant)` | Acessor interno (setter) para um atributo XML identificado pelo nome. |
| `_SetNodeValue` | `Void` | `(Value As Variant)` | Acessor interno (setter) da propriedade NodeValue (OleVariant). |
| `AddChild` | [`IXMLNode`](#ixmlnode) | `(pTagName As String)` | Adiciona e retorna um novo nó filho com o nome de tag informado. |
| `ChildNodes` | [`IXMLNodeList`](#ixmlnodelist) | `()` | Retorna a lista de nós filhos diretos deste nó. |
| `GetNodeName` | `String` | `()` | Retorna o nome da tag XML correspondente a este nó. |
| `QueryInterface` | `HRESULT` | `(IID As TGUID, ByRef Obj As PVOID)` | Herdado de IUnknown — retorna outra interface implementada pelo nó (RTTI COM). |
| `SelectSingleNode` | [`IXMLNode`](#ixmlnode) | `(NodeName As String)` | Busca e retorna um único nó utilizando a query/nome informado. |

#### `IXMLNodeList`

**Herda de:** `TObject`

**Cadeia completa:** `TObject` → `System.Classes.TObject`

Lista ordenada de nós XML (IXMLNode). Permite navegação por índice e busca por nome.

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `_AddRef` | `Integer` | `()` | Herdado de IUnknown — incrementa o contador de referências da interface. |
| `_GetNodes` | [`IXMLNode`](#ixmlnode) | `(I As Integer)` | Acessor interno (getter) da propriedade indexada Nodes. |
| `_Release` | `Integer` | `()` | Herdado de IUnknown — decrementa o contador de referências; libera a instância ao chegar a zero. |
| `Count` | `Integer` | `()` | Retorna a quantidade de nós contidos na lista. |
| `FindNode` | [`IXMLNode`](#ixmlnode) | `(NodeName As String)` | Localiza e retorna o primeiro nó filho com o nome informado. |
| `QueryInterface` | `HRESULT` | `(IID As TGUID, ByRef Obj As PVOID)` | Herdado de IUnknown — retorna outra interface implementada pela lista. |

#### `TXMLDocument`

**Herda de:** `TObject`

**Cadeia completa:** `TObject` → `System.Classes.TObject`

Representa um documento XML que pode ser lido, manipulado e salvo.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Active` | `Boolean` | Ativa ou desativa a manipulação do documento XML. |
| `ChildNodes` | [`IXMLNodeList`](#ixmlnodelist) | Lista de nós filhos diretos no documento XML. |
| `DocumentElement` | [`IXMLNode`](#ixmlnode) | Nó raiz (elemento principal) do documento XML. |
| `Encoding` | `String` | Codificação do documento XML (ex.: UTF-8, ISO-8859-1). |
| `FileName` | `String` | Caminho/nome do arquivo XML físico. |
| `Node` | [`IXMLNode`](#ixmlnode) | Nó base associado ao documento XML. |
| `Options` | `Variant` | Conjunto de opções de comportamento do parser/serializer. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Version` | `String` | Versão declarada no prólogo XML (ex.: 1.0). |
| `XML` | `TStrings` | Conteúdo bruto do XML em uma lista de strings (linhas). |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `AddChild` | [`IXMLNode`](#ixmlnode) | `(TagName As String, NamespaceURI As String)` | Adiciona um novo nó raiz/filho no documento com a tag e (opcionalmente) o namespace informado. |
| `Create` | [`TXMLDocument`](#txmldocument) | `(AOwner As TComponent)` | Construtor. Aceita um Owner (TComponent) responsável pela liberação ou nenhum argumento (default). |
| `GetActive` | `Boolean` | `()` | Acessor interno (getter) da propriedade Active. |
| `GetChildNodes` | [`IXMLNodeList`](#ixmlnodelist) | `()` | Acessor interno (getter) da propriedade ChildNodes. |
| `GetDocumentElement` | [`IXMLNode`](#ixmlnode) | `()` | Acessor interno (getter) da propriedade DocumentElement. |
| `GetDocumentNode` | [`IXMLNode`](#ixmlnode) | `()` | Retorna o nó base (DocumentNode) associado ao documento XML. |
| `GetEncoding` | `Void` | `()` | Acessor interno (getter) da propriedade Encoding. |
| `GetOptions` | `Void` | `()` | Acessor interno (getter) da propriedade Options. |
| `GetVersion` | `Void` | `()` | Acessor interno (getter) da propriedade Version. |
| `GetXML` | `TStrings` | `()` | Acessor interno (getter) da propriedade XML. |
| `LoadFromFile` | `Void` | `(AFileName As String)` | Carrega o documento XML a partir de um arquivo físico. |
| `SaveToFile` | `Void` | `(AFileName As String)` | Salva o conteúdo XML modificado no arquivo especificado. |
| `SetActive` | `Void` | `(Value As Boolean)` | Acessor interno (setter) da propriedade Active. |
| `SetDocumentElement` | `Void` | `(Value As XML.IXMLNode)` | Acessor interno (setter) da propriedade DocumentElement. |
| `SetEncoding` | `Void` | `(Value As Variant)` | Acessor interno (setter) da propriedade Encoding. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SetOptions` | `Void` | `(Value As Variant)` | Acessor interno (setter) da propriedade Options. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SetVersion` | `Void` | `(Value As Variant)` | Acessor interno (setter) da propriedade Version. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SetXML` | `Void` | `(Value As TStrings)` | Acessor interno (setter) da propriedade XML. |

---

_3 classes/tipos, 0 delegates, 0 funções, ~45 membros próprios em classes, 0 constantes associadas a tipos enumerados._

_Snapshot `2616b20d9001` — gerado em 2026-05-27T17:44:11.203Z pela extensão Data7 Dev Studio._
