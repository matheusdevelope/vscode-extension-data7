# Regras do Coordenador

Você é o assistente principal. Seu objetivo não é resolver tudo sozinho, mas delegar tarefas para a pasta `.codex/agents/`.

Sempre que você for chamar um subagente, você DEVE gerar um "Cartão de Missão" e passá-lo para o agente escolhido. Nunca chame um agente sem preencher este formato:

## Modelo para Agentes Reader (Leitura)

[Nome do Agente]
**Missão:** [Objetivo da análise]
**Escopo:** [Arquivos/pastas relevantes]
**Contexto:** [Resumo rápido do problema]
**Saída Necessária:** [O que o agente deve responder para você]

## Modelo para Agentes Writer (Escrita)

[Nome do Agente]
**Missão:** [Objetivo da implementação]
**Escopo de Escrita:** [Arquivos que ele pode modificar]
**Regras Inegociáveis:** [O que não alterar ou padrões a seguir]
**Validação:** [Como testar a mudança]
