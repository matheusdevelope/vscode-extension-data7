# Data7 Basic — Referência da Linguagem

> Esta pasta é a **fonte canônica** da especificação da linguagem Data7 Basic — o dialeto BASIC do ERP Data7 que a extensão `vscode-extension-data7` lê, analisa e transpila.
>
> Ela descreve a **linguagem-alvo** para a qual o `Builder` gera código nativo (`.7Proj`). Tudo o que está aqui é o que o compilador do ERP entende; açúcares opcionais expandidos pela extensão estão marcados explicitamente como tal.

## Visão geral

Data7 Basic é um dialeto **VB.NET-like** com herança Delphi:

- **Sintaxe BASIC clássica**: `Namespace`, `Class`, `Sub`, `Function`, `Dim`, `If/Then/Else`, `For/Next`, `Select Case`, `End <Block>`.
- **Modelo de objetos Delphi/VCL**: hierarquia enraizada em `TObject`, `Inherits`, `MyBase`, `Overrides`, `Property/Get/Set`, eventos como `Delegate`s.
- **Tipagem estática nominal** com `Variant` como escape hatch.
- **Sem closures, sem generics nativos, sem async/await, sem coleção genérica nativa** — vide [11-limitacoes-conhecidas.md](./11-limitacoes-conhecidas.md).
- **Açúcares opcionais** adicionados pela extensão são transpilados antes do `.7Proj` final — vide [10-acucares-atuais.md](./10-acucares-atuais.md).

## Como navegar

### Quero entender a linguagem (referência sistemática)

| Cap. | Conteúdo |
|---|---|
| [01](./01-sintaxe.md) | Sintaxe básica: arquivos, `Namespace`, `Imports`, comentários, tags `@Module` |
| [02](./02-tipos.md) | Tipos primitivos, `Variant`, `NULL`, `TDateTime`, aliases |
| [03](./03-operadores.md) | Operadores aritméticos, lógicos, comparação, concatenação |
| [04](./04-controle-de-fluxo.md) | `If`, `For`, `For Each`, `Select Case`, `Try/Catch`, `With`, `Exit`, `Return`, `Throw`, `Print` |
| [05](./05-classes.md) | `Class`, `Inherits`, `MyBase`, `Overrides`, propriedades, visibilidade, sobrecarga |
| [06](./06-delegates.md) | `Delegate Sub/Function`, callbacks, padrão `extra As Variant` |
| [07](./07-generics.md) | Estado atual dos genéricos (monomorfização de templates) |
| [08](./08-modulos-e-imports.md) | Módulos (`@Module`), `Principal.bas`, repositório privado, `data7.json` |
| [09](./09-system-library.md) | Visão geral dos 11 namespaces nativos |
| [10](./10-acucares-atuais.md) | Açúcares sintáticos (For Each, range, ternário, interpolation) |
| [11](./11-limitacoes-conhecidas.md) | Limitações da linguagem (essencial para escolher arquitetura) |
| [12](./12-convencoes-idiomaticas.md) | Padrões idiomáticos usados nos projetos reais |
| [13](./13-diagnostic-codes.md) | Códigos de diagnóstico emitidos pelo linter |
| [14](./14-construindo-telas.md) | Construindo telas (Forms): layout `Align`, hierarquia de pais, eventos, ciclo `Show`/`Free` |

### Quero ver um projeto real

A pasta [`mod_card_grouper/`](./mod_card_grouper) traz um projeto Data7 completo — adapter pattern, schema, extractor, grouper, controller, formulário. É a maior fonte concreta de **padrões idiomáticos** da linguagem.

Veja também os exemplos canônicos em [`docs/exemple/`](../exemple/README.md) — fixtures pequenos com header `@example` que servem simultaneamente como referência humana e como entrada de testes automatizados.

## Cross-references

- **System Library** (classes/funções nativas do ERP): [`docs/system-library/`](../system-library/README.md).
- **Documentação oficial do ERP** (HTMLs originais): [`docs/Documentação Data7/`](../Documentação%20Data7).
- **Diagnostic codes** (código-fonte): [`src/diagnostics/diagnostic-codes.ts`](../../src/diagnostics/diagnostic-codes.ts).
- **Engine de transpilação**: [`src/project/transpiler.ts`](../../src/project/transpiler.ts).
- **Engine de monomorfização**: [`src/project/generics-monomorphizer/`](../../src/project/generics-monomorphizer).
- **Contexto técnico/arquitetural**: [`project_context.md`](../../project_context.md).
