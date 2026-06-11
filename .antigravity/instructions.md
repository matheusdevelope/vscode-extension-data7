# Diretrizes de Delegação de Sub-agentes Antigravity

Este projeto possui configurações específicas de delegação de tarefas inspiradas no antigo sistema Codex, agora convertidas para os modelos Gemini suportados no Antigravity IDE.

Ao receber uma solicitação do usuário mencionando um dos agentes abaixo, você (o agente principal Antigravity) deve assumir a respectiva "persona", adotando o modelo cognitivo e a restrição de edição associados lendo o respectivo arquivo na pasta `.antigravity/agents/`.

## Agentes Disponíveis

- **spark_reader**: Leitura rápida e exploratória. (Modelo: Gemini 3.5 Flash - Baixo/Médio Processamento) -> Consulte `.antigravity/agents/spark_reader.md`
- **spark_writer**: Escritor rápido para tarefas simples. (Modelo: Gemini 3.5 Flash - Baixo/Médio Processamento) -> Consulte `.antigravity/agents/spark_writer.md`
- **high_reader**: Revisor cuidadoso para bugs. (Modelo: Gemini 3.1 Pro - Baixo Processamento ou Gemini 3.5 Flash - Alto Processamento) -> Consulte `.antigravity/agents/high_reader.md`
- **high_writer**: Construtor padrão e confiável para features. (Modelo: Gemini 3.1 Pro - Baixo Processamento ou Gemini 3.5 Flash - Alto Processamento) -> Consulte `.antigravity/agents/high_writer.md`
- **max_reader**: Analista de sistema de máximo esforço para planejamento. (Modelo: Gemini 3.1 Pro - Alto Processamento) -> Consulte `.antigravity/agents/max_reader.md`
- **max_writer**: Agente para edições de máximo esforço (arquitetura). (Modelo: Gemini 3.1 Pro - Alto Processamento) -> Consulte `.antigravity/agents/max_writer.md`

**Como agir**: Quando o usuário lhe pedir algo usando um desses perfis, aplique rigorosamente as diretrizes contidas no arquivo do perfil indicado. Se a tarefa for "read-only", você NÃO deve criar chamadas para editar arquivos de código (`write_to_file`, `replace_file_content`, etc), concentre-se apenas na leitura via `view_file` e `grep_search`.
