# Especificacoes da IA

## Estado atual

Nao ha IA aplicacional implementada no sistema.

O sistema atual nao possui:

- Chatbot.
- Agente de atendimento.
- RAG.
- Chamadas a OpenAI, Anthropic, Google Gemini ou similares.
- Repositorio de prompts em codigo.
- Fallback de modelo.

## Repositorio de Prompts

Status: nao implementado.

Quando IA for adicionada, criar a pasta:

```text
prompts/
  system.md
  atendimento-cliente.md
  mensagens-pos-atendimento.md
  campanhas.md
  rag-query.md
```

Formato recomendado para cada prompt:

```markdown
# Nome do prompt

## Objetivo

## System instructions

## Inputs esperados

## Output esperado

## Regras de seguranca

## Exemplos

## Historico de alteracoes
```

Observacao importante: instrucoes internas do ambiente de desenvolvimento e do assistente usado para construir o sistema nao fazem parte do runtime do produto e nao devem ser tratadas como prompts do sistema final.

## Configuracao dos Modelos

Status: nao implementado.

Quando houver IA, documentar:

| Campo | Valor |
| --- | --- |
| Provedor | A definir |
| Modelo principal | A definir |
| Modelo fallback | A definir |
| Temperatura | A definir |
| top_p | A definir |
| max_tokens | A definir |
| timeout | A definir |
| retry | A definir |

Configuracao recomendada inicial para mensagens administrativas:

| Campo | Valor recomendado |
| --- | --- |
| Temperatura | `0.2` a `0.4` |
| top_p | `1` |
| Timeout | `20s` |
| Retry | 1 tentativa |
| Modo | Assistivo, nao autonomo |

## Pipeline de RAG

Status: nao implementado.

Se o sistema usar base de conhecimento, documentar:

1. Fontes de dados.
2. Processo de ingestao.
3. Limpeza e normalizacao.
4. Chunking.
5. Embeddings.
6. Banco vetorial.
7. Recuperacao.
8. Montagem do contexto.
9. Citacoes/referencias.
10. Politicas de atualizacao.

Fontes candidatas futuras:

- Descricao dos servicos.
- Orientacoes pre e pos-procedimento.
- Politicas da clinica.
- Perguntas frequentes.
- Historico de modelos de mensagens aprovados.

## Matriz de Fallback

Status: nao implementado.

Matriz recomendada:

| Falha | Comportamento esperado |
| --- | --- |
| API da IA fora do ar | Exibir mensagem neutra e permitir envio manual sem sugestao automatica. |
| Timeout | Cancelar chamada, registrar erro e permitir continuar fluxo manual. |
| Resposta insegura | Bloquear resposta e pedir revisao humana. |
| Baixa confianca | Mostrar sugestao como rascunho, nunca enviar automaticamente. |
| Falha de RAG | Responder apenas com informacoes confirmadas no sistema ou pedir revisao. |

## Guardrails recomendados

- IA nunca deve diagnosticar condicoes medicas.
- IA nunca deve prometer resultados esteticos garantidos.
- IA nunca deve enviar mensagem automaticamente sem revisao humana.
- IA nunca deve expor dados de outra clinica.
- IA deve evitar linguagem sensacionalista em campanhas.
- IA deve respeitar opt-out de marketing (`clientes.aceita_marketing`).

