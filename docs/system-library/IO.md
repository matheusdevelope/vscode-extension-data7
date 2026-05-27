# Namespace `IO`

> Documentação gerada automaticamente pela extensão **Data7 Dev Studio**.
> Reflete o estado atual da System Library reconhecida pelo linter / IntelliSense.

## 1. Visão geral

Namespace para manipulação do sistema de arquivos e diretórios.

**Como importar:**

```basic
Imports IO
```

## 3. Classes (com membros próprios)

> Cada classe lista apenas seus membros **próprios**. Membros herdados podem ser consultados nas classes ancestrais via os links da cadeia de herança no topo de cada seção.

#### `Directory`

Classe para manipulação e seleção de diretórios.

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Create` | `Boolean` | `(pPath As String)` | Cria um diretório. Retorna true sempre que o diretório for criado com sucesso. |
| `Exists` | `Boolean` | `(pPath As String)` | Verifica se o diretório existe. |
| `SelectDialog` | `String` | `()` | Exibe uma caixa de diálogo para seleção de um diretório e retorna o caminho do diretório selecionado. |

#### `File`

Classe para manipulação de arquivos físicos.

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Copy` | `Boolean` | `(pSource As String, pDest As String)` | Realiza a cópia de um arquivo. |
| `Delete` | `Boolean` | `(pPath As String)` | Exclui o arquivo especificado no parâmetro. É retornado um valor true sempre que o arquivo é excluído com sucesso. |
| `Exists` | `Boolean` | `(pPath As String)` | Verifica se um arquivo existe. |
| `ExtractDir` | `String` | `(pPath As String)` | Extrai o caminho da pasta/diretório de um nome de arquivo/patch. |
| `ExtractName` | `String` | `(pPath As String)` | Extrai o nome do arquivo de um caminho/patch. |
| `GetFiles` | `Void` | `(pPath As String, pList As StringList)` | Preenche um objeto do tipo StringList com as pastas/arquivos do caminho especificado. |
| `OpenFileDialog` | `String` | `(pTitle As String = "", pFilter As String = "")` | Exibe uma caixa de diálogo para seleção de arquivo e retorna o caminho completo do arquivo selecionado. |
| `XlsToStringGrid` | `Boolean` | `(pXlsPath As String, pGrid As Forms.Grid)` | Importa os dados de um arquivo .xls para uma Grid. É necessário ter o Excel instalado no computador que irá executar o projeto. |

---

_2 classes/tipos, 0 delegates, 0 funções, ~11 membros próprios em classes, 0 constantes associadas a tipos enumerados._

_Snapshot `2616b20d9001` — gerado em 2026-05-27T21:04:59.237Z pela extensão Data7 Dev Studio._
