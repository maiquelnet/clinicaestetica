# Dicionario de Dados

Atualizado em: 2026-08-11.

Banco: Supabase Postgres

Schema principal: `public`

Status: banco de producao ativo com 45 tabelas `public`. Os dados nao estao mais zerados; em 2026-08-11 havia clientes, agendamentos, bloqueios, fila de espera e uma conexao Google.

## Ultimas migrations remotas confirmadas

- `20260803192636_google_calendar_bidirectional_sync`
- `20260806171333_public_client_service_interests`
- `20260806192216_add_whatsapp_consent_columns`
- `20260807185358_whatsapp_automation`
- `20260807190318_fix_whatsapp_rpc_security`
- `20260810173548_whatsapp_message_queue`

O historico completo deve ser consultado com `supabase migration list --linked`. Alguns arquivos locais possuem timestamps diferentes porque migrations foram aplicadas por ferramentas remotas.

## Politicas gerais de modelagem

- Todas as entidades operacionais usam `uuid`.
- A maioria das tabelas possui `clinica_id` para isolamento multi-clinica.
- RLS esta habilitado em 44 das 45 tabelas publicas. `integracoes_google` permanece com RLS desabilitado e e uma pendencia critica do Security Advisor.
- Acesso por clinica e validado por funcoes auxiliares no schema `private`.
- Tabelas com alteracao possuem `criado_em` e `atualizado_em`.
- Arquivamento logico usa `arquivado_em` quando aplicavel.

## Tabelas por dominio

### Base e acesso

- `clinicas`
- `perfis`
- `usuarios_clinicas`
- `modulos`
- `modulos_clinicas`
- `configuracoes`

### Clientes e agenda

- `clientes`
- `agendamentos`
- `historico_status_agendamentos`
- `eventos_agenda`
- `bloqueios_agenda`
- `lista_espera`

### Servicos e precos

- `servicos`
- `precos_servicos`

### Atendimento

- `atendimentos`
- `secoes_atendimento`
- `anotacoes_atendimento`
- `anexos_atendimento`
- `anotacoes_clientes`
- `planos_tratamento`
- `itens_plano_tratamento`

### Mensagens e campanhas

- `modelos_mensagens`
- `regras_mensagens`
- `logs_mensagens`
- `mensagens_dispensadas`
- `lembretes_agendamentos`
- `fila_mensagens`
- `campanhas`
- `destinatarios_campanhas`

### Integracoes

- `google_calendar_connections`
- `integracoes_google` (legado, vazio e com RLS pendente)

### Financeiro

- `movimentacoes_financeiras`
- `contas_financeiras`
- `categorias_financeiras`
- `metodos_pagamento`
- `caixas`
- `comissoes`

### Onboarding

- `fluxos_onboarding`
- `etapas_onboarding`
- `progresso_onboarding`

## Estrutura das tabelas

### `agendamentos`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `cliente_id uuid not null`
- `servico_id uuid`
- `profissional_id uuid`
- `inicio_em timestamp with time zone not null`
- `fim_em timestamp with time zone not null`
- `status text not null`
- `valor_aplicado numeric not null`
- `google_event_id text`
- `google_sync_status text not null`
- `google_sync_erro text`
- `google_atualizado_em timestamp with time zone`
- `google_ultima_sincronizacao_em timestamp with time zone`
- `observacoes text`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`
- `arquivado_em timestamp with time zone`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`
- FK: `cliente_id -> clientes.id`
- FK: `servico_id -> servicos.id`
- FK: `profissional_id -> perfis.id`

### `clientes`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `nome text not null`
- `telefone text not null`
- `email citext`
- `data_nascimento date`
- `cpf text`
- `genero text`
- `observacoes text`
- `aceita_marketing boolean not null`
- `ativo boolean not null`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`
- `arquivado_em timestamp with time zone`
- `intervalo_retorno_dias integer`
- `parceira boolean not null`
- `servicos_interesse uuid[] not null`
- `whatsapp_opt_in_status text not null`
- `whatsapp_opt_in_em timestamp with time zone`
- `whatsapp_opt_in_origem text`
- `whatsapp_opt_in_versao text`
- `whatsapp_opt_out_em timestamp with time zone`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`

### `clinicas`

Colunas:

- `id uuid not null`
- `nome text not null`
- `nome_publico text`
- `documento text`
- `telefone text`
- `email citext`
- `endereco text`
- `complemento text`
- `cep text`
- `cidade text`
- `estado text`
- `fuso_horario text not null`
- `logo_url text`
- `link_google_avaliacao text`
- `google_place_id text`
- `ativo boolean not null`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`
- `arquivado_em timestamp with time zone`

Chaves:

- PK: `id`

### `perfis`

Colunas:

- `id uuid not null`
- `nome text not null`
- `email citext not null`
- `telefone text`
- `foto_url text`
- `ativo boolean not null`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`

Chaves:

- PK: `id`
- FK esperada: `id -> auth.users.id`

### `usuarios_clinicas`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `perfil_id uuid not null`
- `papel text not null`
- `ativo boolean not null`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`
- FK: `perfil_id -> perfis.id`
- UNIQUE: `clinica_id, perfil_id`

### `servicos`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `nome text not null`
- `categoria text`
- `descricao text`
- `duracao_minutos integer not null`
- `preco_sob_consulta boolean not null`
- `observacao_preco text`
- `ativo boolean not null`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`
- `arquivado_em timestamp with time zone`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`

### `precos_servicos`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `servico_id uuid not null`
- `valor numeric not null`
- `inicio_validade date not null`
- `fim_validade date`
- `criado_em timestamp with time zone not null`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`
- FK: `servico_id -> servicos.id`

### `modelos_mensagens`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `tipo text not null`
- `nome text not null`
- `texto text not null`
- `ativo boolean not null`
- `prioridade integer not null`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`
- `arquivado_em timestamp with time zone`
- `whatsapp_template_name text`
- `whatsapp_template_language text not null`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`
- UNIQUE: `clinica_id, tipo`

### `regras_mensagens`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `modelo_mensagem_id uuid not null`
- `gatilho text not null`
- `quantidade integer`
- `unidade text`
- `direcao text`
- `canal_padrao text not null`
- `ativo boolean not null`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`
- `janela_alerta_dias integer`
- `automacao_iniciada_em timestamp with time zone`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`
- FK: `modelo_mensagem_id -> modelos_mensagens.id`

### `logs_mensagens`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `cliente_id uuid not null`
- `agendamento_id uuid`
- `modelo_mensagem_id uuid`
- `campanha_id uuid`
- `canal text not null`
- `texto text not null`
- `ciclo text`
- `status text not null`
- `enviado_em timestamp with time zone`
- `observacao text`
- `criado_em timestamp with time zone not null`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`
- FK: `cliente_id -> clientes.id`
- FK: `agendamento_id -> agendamentos.id`
- FK: `modelo_mensagem_id -> modelos_mensagens.id`
- FK: `campanha_id -> campanhas.id`

### `mensagens_dispensadas`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `cliente_id uuid not null`
- `agendamento_id uuid`
- `modelo_mensagem_id uuid`
- `tipo text`
- `ciclo text not null`
- `motivo text`
- `dispensado_em timestamp with time zone not null`
- `criado_em timestamp with time zone not null`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`
- FK: `cliente_id -> clientes.id`
- FK: `agendamento_id -> agendamentos.id`
- FK: `modelo_mensagem_id -> modelos_mensagens.id`
- UNIQUE: `clinica_id, ciclo`

### `campanhas`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `titulo text not null`
- `mensagem text not null`
- `status text not null`
- `criado_por uuid`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`
- `arquivado_em timestamp with time zone`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`
- FK: `criado_por -> perfis.id`

### `destinatarios_campanhas`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `campanha_id uuid not null`
- `cliente_id uuid not null`
- `status text not null`
- `enviado_em timestamp with time zone`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`
- FK: `campanha_id -> campanhas.id`
- FK: `cliente_id -> clientes.id`
- UNIQUE: `campanha_id, cliente_id`

### `movimentacoes_financeiras`

Colunas:

- `id uuid not null`
- `clinica_id uuid not null`
- `tipo text not null`
- `descricao text not null`
- `valor numeric not null`
- `vencimento_em date`
- `pago_em date`
- `status text not null`
- `categoria_id uuid`
- `conta_financeira_id uuid`
- `metodo_pagamento_id uuid`
- `agendamento_id uuid`
- `cliente_id uuid`
- `observacao text`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`

Chaves:

- PK: `id`
- FK: `clinica_id -> clinicas.id`
- FK: `categoria_id -> categorias_financeiras.id`
- FK: `conta_financeira_id -> contas_financeiras.id`
- FK: `metodo_pagamento_id -> metodos_pagamento.id`
- FK: `agendamento_id -> agendamentos.id`
- FK: `cliente_id -> clientes.id`

## Demais tabelas

As tabelas abaixo fazem parte do schema e devem ser detalhadas conforme forem implementadas na aplicacao:

- `anexos_atendimento`
- `anotacoes_atendimento`
- `anotacoes_clientes`
- `atendimentos`
- `bloqueios_agenda`
- `caixas`
- `categorias_financeiras`
- `comissoes`
- `configuracoes`
- `contas_financeiras`
- `etapas_onboarding`
- `eventos_agenda`
- `fluxos_onboarding`
- `historico_status_agendamentos`
- `itens_plano_tratamento`
- `lembretes_agendamentos`
- `lista_espera`
- `metodos_pagamento`
- `modulos`
- `modulos_clinicas`
- `planos_tratamento`
- `progresso_onboarding`
- `secoes_atendimento`

### `google_calendar_connections`

Armazena uma conexao OAuth por clinica:

- `id uuid`
- `clinica_id uuid`
- `calendar_id text`, padrao `primary`
- `tokens_encrypted text`
- `sync_token text`
- `channel_id text`
- `resource_id text`
- `channel_token text`
- `channel_expires_at timestamptz`
- `ultima_sincronizacao_em timestamptz`
- `ativo boolean`
- timestamps de criacao/atualizacao

RLS esta habilitado sem policy de frontend. A Edge Function usa credencial server-side. `tokens_encrypted` nunca deve ser exibido ou copiado para logs/documentacao.

### `fila_mensagens`

Outbox da versao WhatsApp implantada:

- IDs de clinica, cliente, agendamento e modelo;
- `canal`, `tipo` e `ciclo`;
- `payload jsonb` com os parametros do template;
- `status`: `pendente`, `processando`, `enviado`, `erro` ou `cancelado`;
- `tentativas`, `disponivel_em`, `processando_em`, `enviado_em`;
- `ultimo_erro` e `meta_message_id`;
- timestamps.

Restricoes/indices:

- UNIQUE `(clinica_id, canal, ciclo)`;
- indice de processamento por clinica/status/disponibilidade;
- indice de agendamento/modelo;
- RLS habilitado sem policy de frontend; processamento pela Edge Function/service role.

## RLS e funcoes auxiliares

Funcoes auxiliares:

- `private.usuario_tem_acesso_clinica(clinica uuid)`
- `private.usuario_e_admin_clinica(clinica uuid)`

Observacoes:

- As funcoes publicas antigas tiveram execucao revogada para `anon` e `authenticated`.
- As policies chamam funcoes do schema `private`.
- `usuarios_clinicas` tem policies separadas por acao: select, insert, update e delete.

