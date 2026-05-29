# Servidor MCP do Data7 Dev Studio

> Manual do usuário final. Esta pasta complementa a RFC arquitetural em [`docs/rfcs/MCP-001-mcp-server.md`](../rfcs/MCP-001-mcp-server.md) — a RFC explica **por que** o servidor foi desenhado assim; este manual mostra **como** usá-lo.

## O que é

O **servidor MCP do Data7 Dev Studio** é um pequeno binário embutido na extensão `vscode-extension-data7` que expõe a especificação e o catálogo da linguagem Data7 Basic para agentes de IA (Cursor, Claude Desktop, Continue) através do [Model Context Protocol](https://modelcontextprotocol.io/).

Em vez de injetar 60+ k tokens de documentação no contexto do agente toda vez que ele digita uma linha, o servidor MCP fornece **buscas dirigidas** (`data7_search_symbol`, `data7_describe_symbol`, `data7_get_official_example`, …) que devolvem **apenas o que o agente precisa**, com **exemplos oficiais do ERP** extraídos da base de conhecimento original.

## O que ele entrega

| Capacidade            | Quantidade                  | Onde aprender                                    |
| --------------------- | --------------------------- | ------------------------------------------------ |
| **Resources** (read-only) | 10 famílias                 | [03-recursos.md](./03-recursos.md)               |
| **Tools** (chamáveis)     | 12 (7 lookup + 3 executable + 1 sugest + 1 lint cross-file) | [04-ferramentas.md](./04-ferramentas.md) |
| **Prompts** (templates)   | 4 (esqueletos canônicos, incl. tela)    | [05-prompts.md](./05-prompts.md)                 |

## Navegação

| Arquivo                                         | Para quem / quando                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [01-instalacao.md](./01-instalacao.md)          | Você vai usar o MCP pela primeira vez. Passo a passo para Cursor, Claude Desktop e Continue.                        |
| [02-uso-rapido.md](./02-uso-rapido.md)          | Você instalou e quer ver 5 cenários típicos funcionando em 2 minutos.                                               |
| [03-recursos.md](./03-recursos.md)              | Referência das 10 famílias de Resources (data7://language/_, data7://system-library/_, data7://official/\*, etc.).  |
| [04-ferramentas.md](./04-ferramentas.md)        | Referência das 11 Tools com schema de entrada/saída.                                                                |
| [05-prompts.md](./05-prompts.md)                | Referência dos 3 prompt templates (module_skeleton, baseenum_pattern, typed_recordlist).                            |
| [06-exemplos-praticos.md](./06-exemplos-praticos.md) | 3 cenários end-to-end realistas (criar módulo, refatorar para BaseEnum, corrigir missing-import).             |
| [07-troubleshooting.md](./07-troubleshooting.md) | Problemas comuns: MCP não aparece, lint vazio, drift de snapshot, atualização de binário.                          |

## Por que essa pasta existe (e por que está fora do `.vsix`)

A pasta `docs/mcp/` segue o mesmo padrão de `docs/linguagem-basic/` e `docs/exemple/`: é **documentação versionada do repo**, não documentação acessória empacotada no Marketplace. Está excluída do `.vsix` por [.vscodeignore](../../.vscodeignore) (tudo sob `docs/**` é excluído).

Quem instala a extensão pelo Marketplace acessa esses documentos lendo o repo GitHub. Quem desenvolve a extensão (e a IA dele) lê localmente.

A criação dessa pasta é uma **exceção sancionada** à regra "não criar docs proativamente" em `coding_standards.mdc`, justificada pela mesma razão de `docs/exemple/`: insumos versionados e tratados como contrato estável, não documentação acessória.

## Versão atual

O servidor reporta sua versão em `data7://meta/snapshot`:

```json
{
  "version": "0.1.0",
  "snapshotHash": "<12-hex>",
  "namespaces": ["Collections", "Data7", "Drawing", "..."],
  "capabilities": { "resources": 10, "tools": 12, "prompts": 4 }
}
```

`snapshotHash` é o mesmo hash que o `DocsGenerator` usa para detectar drift entre `SYSTEM_SYMBOLS` e os docs gerados. Se o hash muda entre versões do MCP, o conteúdo da System Library mudou.
