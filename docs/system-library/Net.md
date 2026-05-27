# Namespace `Net`

> Documentação gerada automaticamente pela extensão **Data7 Dev Studio**.
> Reflete o estado atual da System Library reconhecida pelo linter / IntelliSense.

## 1. Visão geral

Namespace do ERP Data7 para acesso a serviços de rede (FTP, sockets, etc.). Atualmente expõe a classe `TFTP` para conexão e transferência de arquivos via FTP.

**Como importar:**

```basic
Imports Net
```

## 3. Classes (com membros próprios)

> Cada classe lista apenas seus membros **próprios**. Membros herdados podem ser consultados nas classes ancestrais via os links da cadeia de herança no topo de cada seção.

#### `TFTP`

Cliente FTP. Possui métodos e propriedades para conectar-se a um servidor FTP.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Connected` | `Boolean` | Indica se o cliente está conectado ao servidor FTP. Marcada como obsoleta na documentação do ERP (item riscado). |
| `Host` | `String` | Obtém ou define o nome do servidor FTP. |
| `Passive` | `Boolean` | Define se o modo de conexão com o servidor FTP será passivo. |
| `Password` | `String` | Define a senha do usuário para autenticação no servidor FTP. |
| `Port` | `Integer` | Obtém ou define a porta de conexão do servidor FTP. Padrão: 21. |
| `TransferType` | `Integer` | Define o tipo de transferência (ASCII / Binário). Use os valores conforme documentação do ERP. |
| `UserName` | `String` | Define o nome do usuário para autenticação no servidor FTP. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `ChangeDir` | `Void` | `(directory As String)` | Seleciona o diretório informado no parâmetro como diretório de trabalho. |
| `Connect` | `Void` | `()` | Conecta-se ao servidor FTP usando `Host`, `Port`, `UserName` e `Password`. |
| `Delete` | `Void` | `(remoteFile As String)` | Exclui um arquivo do servidor FTP. |
| `Disconnect` | `Void` | `()` | Desconecta-se do servidor FTP. |
| `Get` | `Void` | `(remoteFile As String, localFile As String)` | Copia um arquivo do servidor FTP para o computador local. |
| `List` | `String` | `()` | Lista arquivos e diretórios do diretório atual no servidor FTP. Use `ChangeDir` antes para especificar um caminho. |
| `Put` | `Void` | `(localFile As String, remoteFile As String)` | Envia um arquivo do computador local para o servidor FTP. |
| `Rename` | `Void` | `(oldName As String, newName As String)` | Renomeia um arquivo no servidor FTP. |

---

_1 classes/tipos, 0 delegates, 0 funções, ~15 membros próprios em classes, 0 constantes associadas a tipos enumerados._

_Snapshot `2616b20d9001` — gerado em 2026-05-27T21:04:59.240Z pela extensão Data7 Dev Studio._
