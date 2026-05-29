# 01 — Instalação do servidor MCP

> Passo a passo para configurar o servidor MCP do Data7 Dev Studio em Cursor, Claude Desktop e Continue. Os três clientes usam o mesmo formato de configuração (`mcpServers` + `command/args`); a única diferença é onde o arquivo de config vive.

## Pré-requisitos

1. **A extensão `vscode-extension-data7`** instalada (Marketplace ou `.vsix`).
2. **Node.js 22+** instalado e disponível no PATH. O servidor MCP é um arquivo `.js` que precisa ser executado por um Node externo (não pelo Node embutido do VS Code).
3. **A extensão precisa ter sido ativada pelo menos uma vez** depois da instalação — a primeira ativação copia o binário do MCP para `globalStorage`.

Abra qualquer projeto Data7 (`.7Proj`) para forçar a ativação. O Output → Data7 deve mostrar `MCP: servidor instalado em <caminho>.`

## Caminho do binário

Após a primeira ativação, o servidor mora em:

| OS      | Caminho típico                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------- |
| Windows | `%APPDATA%\Code\User\globalStorage\matheusdevelope.vscode-extension-data7\mcp\server.bundled.js`                          |
| macOS   | `~/Library/Application Support/Code/User/globalStorage/matheusdevelope.vscode-extension-data7/mcp/server.bundled.js`      |
| Linux   | `~/.config/Code/User/globalStorage/matheusdevelope.vscode-extension-data7/mcp/server.bundled.js`                          |

Para descobrir o caminho exato sem precisar lembrar do globalStorage, rode no VS Code:

> **`Data7: Mostrar Configuração MCP (Cursor / Claude / Continue)`**

(Paleta de comandos → `Data7: Mostrar Configuração MCP`.)

O comando copia para a área de transferência um JSON pronto para colar — com o caminho absoluto correto + `--docs-root` + caminho do `node`. Use sempre esse comando antes de mexer manualmente no arquivo de config.

## Cursor

1. Abra o painel **Settings → MCP Servers** (`Ctrl+Shift+P` → `Cursor: MCP Settings`).
2. Edite `~/.cursor/mcp.json` (ou o equivalente do seu sistema).
3. Adicione:

```json
{
  "mcpServers": {
    "data7": {
      "command": "node",
      "args": [
        "<caminho-do-server.bundled.js>",
        "--workspace=${workspaceFolder}",
        "--docs-root=<caminho-da-pasta-docs>"
      ]
    }
  }
}
```

4. Reinicie o Cursor.
5. Verifique no chat: digite `@data7` para listar os Resources e Tools disponíveis.

## Claude Desktop

1. Abra o arquivo de configuração:
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Adicione o mesmo bloco `mcpServers` mostrado na seção do Cursor.
3. **Importante**: Claude Desktop não interpola `${workspaceFolder}`. Substitua manualmente pelo caminho absoluto do projeto Data7 que você abriu (ou omita o flag para rodar em modo standalone).
4. Reinicie o Claude Desktop.
5. No chat, peça "liste os recursos MCP disponíveis" para confirmar.

## Continue (VS Code)

1. Abra `~/.continue/config.json`.
2. Adicione:

```json
{
  "mcpServers": [
    {
      "name": "data7",
      "command": "node",
      "args": [
        "<caminho-do-server.bundled.js>",
        "--workspace=${workspaceFolder}",
        "--docs-root=<caminho-da-pasta-docs>"
      ]
    }
  ]
}
```

3. Reinicie a sessão do Continue (Ctrl+Shift+P → `Continue: Reload`).

## Modos de operação

O servidor aceita duas formas de inicialização:

| Flag                    | Quando usar                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `--standalone` (default) | Sem workspace. O agente só vê System Library + docs/exemplos. Útil em chats fora de um projeto.                                       |
| `--workspace=<path>`     | Carrega `.bas` do workspace para um indexer detached. Habilita `data7_lint_project` com visibilidade cross-file.                      |
| `--docs-root=<path>`     | Sobrescreve a auto-detecção da pasta `docs/`. Aponte para a pasta `docs/` dentro da extensão instalada (mesmo caminho do globalStorage). |

## Atualizando o binário

Quando a extensão atualiza pelo Marketplace, o `MCPService.installMcpServer` recopia o binário automaticamente na próxima ativação. Para forçar uma reinstalação imediata:

> **`Data7: Instalar/Atualizar Servidor MCP`**

(Paleta → `Data7: Instalar`.) Idempotente: compara hashes e ignora se já está em dia.

## Verificação rápida

Abra um terminal e rode o servidor manualmente para confirmar que ele inicia:

```bash
node "<caminho-do-server.bundled.js>" --docs-root="<caminho-de-docs>"
```

O processo abre e fica esperando pelo stdio do cliente MCP. Pressione `Ctrl+C` para fechar — se ele subiu sem erro, está pronto para receber conexões.
