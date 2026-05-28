# RFCs — Data7 VS Code Extension

> Registros de decisão arquitetural (Architecture Decision Records) para mudanças que afetam **múltiplos arquivos, múltiplas camadas ou regras (`*.mdc`)** desta extensão.

## Quando criar uma RFC

Crie uma RFC quando uma mudança proposta atender **dois ou mais** dos critérios abaixo:

- Adiciona uma nova **dependência runtime** ao `package.json`.
- Toca uma regra em `.cursor/rules/*.mdc` (estrutura, governança, stack).
- Introduz uma nova pasta dentro de `src/` ou uma nova fence em `eslint.config.mjs`.
- Empacota um artefato novo no `.vsix` ou exige novo passo no `npm run verify`.
- Tem esforço estimado > 1 dia-pessoa e envolve mais de 2 milestones.

Mudanças que **não** precisam de RFC: correções de bug pontuais, refactors locais, novos `DiagnosticCode` (já cobertos pelo workflow descrito em `data7_domain.mdc`), novos açúcares isolados (já cobertos por `testing.mdc`).

## Convenção de nomes

`MCP-NNN-slug-em-kebab-case.md`, onde:

- `MCP-NNN` é o número sequencial zero-padded (a numeração é única no projeto inteiro, não por categoria — primeira RFC é `MCP-001`).
- `slug` resume em 3-5 palavras o que a RFC propõe.

Exemplo: `MCP-001-mcp-server.md`.

## Estrutura mínima de uma RFC

Toda RFC abre com um cabeçalho YAML-like em comentário Markdown:

```markdown
<!--
status: Proposed | Accepted | Rejected | Superseded
author: <Nome>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
supersedes: <RFC-NNN ou ->
superseded-by: <RFC-NNN ou ->
-->
```

E segue as seguintes seções na ordem:

1. **Resumo executivo** (2-4 frases).
2. **Motivação** (por que agora).
3. **Inventário / Levantamento** (dados quantitativos que sustentam a proposta).
4. **Proposta** (arquitetura, superfícies, mudanças concretas).
5. **Decisões travadas** (escolhas explícitas, com justificativa curta — cite a alternativa rejeitada).
6. **Plano de execução** (milestones com esforço estimado).
7. **Riscos e mitigações** (tabela; severidade alta/média/baixa).
8. **Mudanças regulatórias necessárias** (`.mdc`, `eslint.config.mjs`, `package.json`, `.vscodeignore`).
9. **Métricas de sucesso** (como saberemos que deu certo).
10. **Anexos** (links, decisões de questionário, snapshots de dados).

## Ciclo de vida

- **Proposed**: RFC criada; aguardando revisão. Não há código em produção.
- **Accepted**: RFC revisada e aprovada. Implementação pode começar. A RFC permanece como referência (não é apagada após implementação).
- **Rejected**: RFC discutida e descartada. Mantida para histórico (com `status: Rejected` e justificativa nos comentários).
- **Superseded**: substituída por uma RFC mais nova. Aponta `superseded-by: MCP-NNN` no header.

Após `Accepted`, atualizações da RFC só devem corrigir fatos descobertos durante a implementação — não revisar a decisão. Mudanças de direção viram uma RFC nova que `supersedes` a anterior.

## Por que essa pasta existe

`coding_standards.mdc` proíbe criação proativa de documentação fora de `project_context.md` e `docs/exemple/`. Esta pasta é uma **exceção sancionada** porque RFCs são **insumo de decisão arquitetural**, não documentação acessória: cada RFC é referenciada por commits (`Implements MCP-001`), pull requests e regras `.mdc`, e fica versionada como a forma estável de revisitar "por que isso foi feito assim?".

Não criar RFC para mudanças que não atendem os critérios acima — atualizar `project_context.md` continua sendo o caminho default.
