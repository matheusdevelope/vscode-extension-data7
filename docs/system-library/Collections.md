# Namespace `Collections`

> Documentação gerada automaticamente pela extensão **Data7 Dev Studio**.
> Reflete o estado atual da System Library reconhecida pelo linter / IntelliSense.

## 1. Visão geral

Namespace nativo do Data7 para estruturas de dados e coleções (StringList, etc.).

**Como importar:**

```basic
Imports Collections
```

## 2. Árvore de herança das classes

```
Collections.TStringList  (externo)
└─ StringList
Collections.TStrings  (externo)
└─ TStringList
System.Classes.TPersistent  (externo)
└─ TStrings
```

## 3. Classes (com membros próprios)

> Cada classe lista apenas seus membros **próprios**. Membros herdados podem ser consultados nas classes ancestrais via os links da cadeia de herança no topo de cada seção.

#### `StringList`

**Herda de:** [`TStringList`](#tstringlist)

Classe nativa para manipulação de listas de strings, pares chave-valor e textos longos.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Capacity` | `Integer` | Capacidade máxima de Strings que poderão ser adicionadas à lista. |
| `CommaText` | `String` | Lista formatada/obtida por meio de uma string separada por vírgulas. |
| `Count` | `Integer` | Quantidade de elementos na lista. |
| `LineBreak` | `String` | Caractere separador de quebras de linha para a propriedade Text. |
| `NameValueSeparator` | `String` | Caractere separador de chaves e valores (padrão é "="). |
| `OwnsObjects` | `Boolean` | Especifica se a lista possui a propriedade dos objetos armazenados. |
| `Sorted` | `Boolean` | Ordena a lista de strings por ordem ascendente. |
| `Text` | `String` | Todo o conteúdo do StringList concatenado e separado por quebras de linha. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Add` | `Integer` | `(pText As String)` | Adiciona uma string na lista e retorna o índice adicionado. |
| `AddObject` | `Integer` | `(pText As String, pObj As TObject)` | Adiciona uma string associada a um objeto na lista. |
| `AddStrings` | `Void` | `(pList As StringList)` | Adiciona strings de outro objeto StringList à lista. |
| `Append` | `Void` | `(pText As String)` | Adiciona uma string à lista de strings. |
| `Assign` | `Void` | `(pSource As TObject)` | Copia o conteúdo de outro objeto compatível para esta lista. |
| `BeginUpdate` | `Void` | `()` | Chame BeginUpdate antes de modificar diretamente as sequências de caracteres na lista. |
| `Clear` | `Void` | `()` | Esvazia a lista inteira. |
| `Delete` | `Void` | `(pIndex As Integer)` | Remove o elemento do índice indicado da lista. |
| `EndUpdate` | `Void` | `()` | Chame EndUpdate para finalizar modificações na lista de strings. |
| `Equals` | `Boolean` | `(pText As String)` | Compara duas strings. |
| `Exchange` | `Void` | `(pIndex1 As Integer, pIndex2 As Integer)` | Utilize o Exchange para reorganizar as sequências de caracteres na lista. |
| `IndexOf` | `Integer` | `(pValue As String)` | Retorna o índice da primeira ocorrência da string especificada na lista, ou -1 se não for encontrada. |
| `IndexOfName` | `Integer` | `(pName As String)` | Localiza o índice do par Nome=Valor cujo nome corresponde ao parâmetro. |
| `IndexOfObject` | `Integer` | `(pObj As TObject)` | Retorna o índice da primeira ocorrência do objeto especificado na lista. |
| `Insert` | `Void` | `(pIndex As Integer, pText As String)` | Insere uma linha no índice indicado. |
| `InsertObject` | `Void` | `(pIndex As Integer, pText As String, pObj As TObject)` | Insere uma string na lista na posição especificada e a associa a um objeto. |
| `LoadFromFile` | `Void` | `(pFileName As String)` | Preenche uma lista de strings com os dados de um arquivo físico. |
| `Move` | `Void` | `(pCurIndex As Integer, pNewIndex As Integer)` | Altera a posição de uma sequência na lista. |
| `Names` | `String` | `(pIndex As Integer)` | Retorna a parte de nome de um par chave-valor no índice indicado. |
| `Objects` | `TObject` | `(pIndex As Integer)` | Retorna o objeto associado no índice especificado. |
| `SaveToFile` | `Void` | `(pFileName As String)` | Salva as strings em um arquivo de texto. |
| `Strings` | `String` | `(pIndex As Integer)` | Retorna a string presente no índice especificado. |
| `Values` | `String` | `(pName As String)` | Retorna o valor associado à chave em um par Nome=Valor. |

#### `TStringList`

**Herda de:** [`TStrings`](#tstrings)

Classe de lista de strings com suporte a ordenação, busca e controle de duplicatas.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `CaseSensitive` | `Boolean` | Especifica se as buscas e comparações diferenciam maiúsculas de minúsculas. |
| `Duplicates` | `String` | Controla a política de inserção de duplicatas (ex: dupIgnore, dupAccept, dupError). |
| `OwnsObjects` | `Boolean` | Especifica se a lista deve liberar a memória dos objetos contidos ao limpá-la ou remover itens. |
| `Sorted` | `Boolean` | Especifica se a lista deve manter os elementos automaticamente ordenados. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `CustomSort` | `Void` | `(pCompare As TObject)` | Ordena os itens da lista usando um método customizado de comparação de objetos/strings. |
| `Find` | `Boolean` | `(pText As String, ByRef pIndex As Integer)` | Busca uma string na lista ordenada e retorna true se encontrada, preenchendo o índice em pIndex. |
| `Sort` | `Void` | `()` | Ordena os itens da lista em ordem ascendente. |

#### `TStrings`

**Herda de:** `System.Classes.TPersistent`

Classe base para manipulação de coleções de strings associadas a objetos, disponível no namespace Collections.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Capacity` | `Integer` | Indica a capacidade máxima atual de strings que a lista pode comportar. |
| `CommaText` | `String` | Conteúdo inteiro da lista representado em uma linha delimitado por vírgulas. |
| `Count` | `Integer` | Retorna a quantidade total de elementos presentes na lista. |
| `DelimitedText` | `String` | Retorna ou analisa toda a lista em uma única string delimitada. |
| `Delimiter` | `String` | Define o caractere delimitador usado para gerar e carregar dados delimitados. |
| `LineBreak` | `String` | Define os caracteres usados para quebra de linha. |
| `NameValueSeparator` | `String` | Informa o caractere separador de par Nome=Valor (padrão '='). |
| `QuoteChar` | `String` | Informa o caractere usado para aspas. |
| `StrictDelimiter` | `Boolean` | Especifica se o Delimiter deve ser interpretado estritamente. |
| `Text` | `String` | Retorna ou define todos os elementos em uma única string concatenada com quebra de linhas. |
| `TrailingLineBreak` | `Boolean` | Informa se deve incluir uma quebra de linha na última linha da propriedade Text. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Add` | `Integer` | `(pText As String)` | Adiciona uma string na lista e retorna o índice correspondente. |
| `AddObject` | `Integer` | `(pText As String, pObj As TObject)` | Adiciona uma string associada a um objeto na lista. |
| `AddPair` | [`TStrings`](#tstrings) | `(pName As String, pValue As String)` | Adiciona um par Nome=Valor na lista. |
| `AddStrings` | `Void` | `(pList As TStrings)` | Adiciona os itens de outra lista nesta lista. |
| `Append` | `Void` | `(pText As String)` | Adiciona uma string ao final da lista. |
| `Assign` | `Void` | `(pSource As TObject)` | Copia o conteúdo de outra lista de strings. |
| `BeginUpdate` | `Void` | `()` | Bloqueia atualizações visuais da lista de strings. |
| `Clear` | `Void` | `()` | Limpa toda a lista e deleta as strings e objetos. |
| `Delete` | `Void` | `(pIndex As Integer)` | Remove o item do índice indicado. |
| `EndUpdate` | `Void` | `()` | Libera atualizações visuais da lista de strings. |
| `Equals` | `Boolean` | `(pStrings As TStrings)` | Compara esta lista de strings com outra. |
| `Exchange` | `Void` | `(pIndex1 As Integer, pIndex2 As Integer)` | Inverte a posição de duas strings na lista. |
| `IndexOf` | `Integer` | `(pText As String)` | Retorna o índice correspondente à string fornecida, ou -1. |
| `IndexOfName` | `Integer` | `(pName As String)` | Retorna o índice do par Nome=Valor contendo o nome fornecido. |
| `IndexOfObject` | `Integer` | `(pObj As TObject)` | Retorna o índice da string associada ao objeto informado. |
| `Insert` | `Void` | `(pIndex As Integer, pText As String)` | Insere uma string na lista na posição especificada. |
| `InsertObject` | `Void` | `(pIndex As Integer, pText As String, pObj As TObject)` | Insere uma string associada a um objeto na posição especificada. |
| `LoadFromFile` | `Void` | `(pFileName As String)` | Carrega a lista de strings com o conteúdo de um arquivo de texto. |
| `LoadFromStream` | `Void` | `(pStream As TObject)` | Carrega a lista de strings a partir de um stream de dados. |
| `Move` | `Void` | `(pCurIndex As Integer, pNewIndex As Integer)` | Altera o índice da string selecionada. |
| `Names` | `String` | `(pIndex As Integer)` | Retorna o nome correspondente do par Nome=Valor no índice indicado. |
| `Objects` | `TObject` | `(pIndex As Integer)` | Retorna o objeto associado à string na posição indicada. |
| `SaveToFile` | `Void` | `(pFileName As String)` | Salva a lista de strings em um arquivo físico no disco. |
| `SaveToStream` | `Void` | `(pStream As TObject)` | Salva o conteúdo em formato de texto para um stream. |
| `Strings` | `String` | `(pIndex As Integer)` | Retorna ou altera a string em uma posição indicada da lista. |
| `ValueFromIndex` | `String` | `(pIndex As Integer)` | Retorna o valor correspondente do par Nome=Valor no índice indicado. |
| `Values` | `String` | `(pName As String)` | Retorna ou define o valor correspondente de um par Nome=Valor através do nome informado. |

---

_3 classes/tipos, 0 delegates, 0 funções, ~76 membros próprios em classes, 0 constantes associadas a tipos enumerados._

_Snapshot `2616b20d9001` — gerado em 2026-05-27T17:44:11.147Z pela extensão Data7 Dev Studio._
