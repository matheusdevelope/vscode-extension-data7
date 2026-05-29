# 07 — Troubleshooting

> Problemas comuns ao configurar / usar o servidor MCP do Data7.

## "O servidor MCP não aparece no Cursor / Claude / Continue"

Checklist:

1. **Você abriu um projeto Data7 (`.7Proj`) pelo menos uma vez no VS Code?** A auto-instalação do binário acontece no primeiro `activate` da extensão. Sem isso, `globalStorage/mcp/server.bundled.js` não existe.
2. **O caminho no `mcpServers` está correto?** Rode o comando **`Data7: Mostrar Configuração MCP`** no VS Code para gerar o JSON com o caminho absoluto certo + copiar para a área de transferência.
3. **O `node` está no PATH?** Os clientes MCP usam `command: "node"` literal. No Windows, `where node` deve devolver um caminho.
4. **Verifique a versão do Node**: o servidor é compilado para `target=node22`. Versões mais antigas podem dar erros de sintaxe (`?.`, `??`, etc.).
5. **Olhe o log do cliente MCP**: o Cursor escreve em "Cursor: Show MCP Logs"; o Claude Desktop em `~/Library/Logs/Claude` (macOS) ou `%APPDATA%\Claude\logs` (Windows).

## "O `lint_bas` retorna vazio mesmo quando há erro óbvio"

Causas comuns:

- **O code está usando syntax sugarada que o linter não dispara?** Açúcares como `??`, `?.`, ternário fora de assignment, etc. são diagnosticados pelo `SugarTranspiler` (build-time), não pelo linter live. Para esses casos, use `data7_transpile_bas` que devolve `diagnostics` específicos do transpiler.
- **O `--workspace` flag não foi passado?** Em modo standalone, o linter não consegue resolver tipos de outros módulos do workspace — só os da System Library + globals. Adicione `--workspace=${workspaceFolder}` (Cursor) ou o path absoluto (Claude Desktop) na config.
- **O arquivo declara `Namespace`?** O linter espera o esqueleto canônico. Trechos avulsos sem `Namespace`/`End Namespace` podem não acionar todas as regras.

## "O `transpile_bas` ignora meu açúcar"

- **Verifique se o açúcar está em `data7_list_sugar`**. Se não estiver, ele não está implementado.
- **A sintaxe está correta?** O transpiler é estrito sobre alguns padrões. Por exemplo: `Match` precisa `Case Is TFoo : body` exatamente; ternário só funciona no RHS de assignment.
- **Snippet incompleto?** Alguns açúcares são multi-line (`Using`, `Match`, `Enum`). Inclua o `End <Block>` correspondente.

## "O `data7://official/<X>` devolve 'Símbolo não encontrado'"

Causas:

1. **O articles.json ainda não foi gerado**. Rode `npm run mcp:articles` no projeto da extensão e depois `npm run mcp:bundle` para empacotar.
2. **O nome qualificado está exato?** Use `data7_get_official_example` (que retorna sugestões) em vez do Resource direto.
3. **O símbolo está em `Global/`?** No catálogo `articles.json` os símbolos globais aparecem com o nome curto (ex.: `TJSONObject.Has`, não `Globals.TJSONObject.Has`). A `tool` aceita ambas as formas; o Resource é case-insensitive mas exige o nome canônico.

## "O snapshotHash em meta/snapshot está diferente"

Esperado quando:

- Você atualizou a extensão pelo Marketplace (System Library mudou).
- Você editou `src/system-library/**` localmente e re-bundlou.

O `snapshotHash` é determinístico sobre `SYSTEM_SYMBOLS`. Use-o no seu cliente para invalidar caches:

```text
last_hash != current_hash → re-fetch all data7://system-library/* resources
```

## "O `node out/mcp/server.bundled.js` dá erro `Cannot find module 'vscode'`"

Esperado se você está rodando o `out/mcp/server.js` (o **não-bundlado**) em vez do `server.bundled.js`. O esbuild bundle inclui o `vscode-shim` que intercepta `require("vscode")`. O servidor não-bundlado tenta resolver `vscode` pelo Node real e falha.

Rode sempre o `.bundled.js`. Em desenvolvimento da extensão, depois de mudanças em `src/mcp/`:

```bash
npm run compile         # tsc gera out/mcp/server.js
npm run mcp:bundle      # esbuild gera out/mcp/server.bundled.js
```

## "Eu mudei `docs/linguagem-basic/<chapter>.md` mas o MCP não atualizou"

O servidor lê os arquivos de `docs/` em runtime — não há cache pelo `tsc`. Mas o **bundle** copiado para `globalStorage` aponta para `<extensionPath>/docs/` que é a versão dentro do `.vsix` (ou seja, vazia, já que `docs/` é excluído do pacote).

Para que o agente externo veja sua mudança local:

- Em desenvolvimento, rode o `server.bundled.js` direto do `out/` do projeto: `node out/mcp/server.bundled.js --docs-root=$(pwd)/docs`.
- Em produção (Marketplace), os agentes só veem o estado dos docs no momento do build do `.vsix`. Updates da extensão republicam.

## "Como reset completo do MCP?"

1. Feche os clientes MCP que estão conectados (Cursor / Claude / Continue).
2. Apague o `globalStorage`/mcp/ da extensão (Windows: `%APPDATA%\Code\User\globalStorage\matheusdevelope.vscode-extension-data7\mcp\`).
3. Recarregue o VS Code.
4. Abra um projeto Data7 — a auto-instalação re-cria.
5. Rode `Data7: Mostrar Configuração MCP` para regenerar o JSON pros clientes.

## "Onde reportar bug?"

Issues no GitHub: <https://github.com/matheusdevelope/vscode-extension-data7/issues>. Inclua:

- Versão da extensão (`data7://meta/snapshot` → `version`).
- Cliente MCP usado.
- Trecho do log do cliente.
- (Opcional) saída de `node out/mcp/server.bundled.js` rodando manualmente.
