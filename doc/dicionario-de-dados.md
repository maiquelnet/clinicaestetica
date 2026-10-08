# Dicionario de Dados

Atualizado em: 2026-10-08.

Banco: Supabase Postgres

Schema principal: `public`

Status: banco de producao ativo com 54 tabelas `public`. Os dados nao estao mais zerados; em 2026-08-11 havia clientes, agendamentos, bloqueios, fila de espera e uma conexao Google.

## Ultimas migrations remotas confirmadas

- `20260803192636_google_calendar_bidirectional_sync`
- `20260806171333_public_client_service_interests`
- `20260806192216_add_whatsapp_consent_columns`
- `20260807185358_whatsapp_automation`
- `20260807190318_fix_whatsapp_rpc_security`
- `20260810173548_whatsapp_message_queue`
- `20260907025141_weekly_commercial_availability`
- `20260907025247_secure_weekly_availability_rpc`
- `20260907152132_availability_exceptions`
- `20260907164915_schedule_block_recurrence`
- `20260907183341_canonical_commercial_capacity_radar_opportunities`
- `20260907200519_assisted_secretary_action_plans`
- `20260907202917_ycloud_coexistence_outbound_status` (timestamp remoto; arquivo local `20260907223000_ycloud_coexistence_outbound_status.sql`)
- `20260907203731_ycloud_worker_status` (timestamp remoto; arquivo local `20260907223500_ycloud_worker_status.sql`)
- `20260912090000_meta_whatsapp_cloud_direct` (aplicada remotamente com registro `20260922074529_meta_whatsapp_cloud_direct`)

O historico completo deve ser consultado com `supabase migration list --linked`. Alguns arquivos locais possuem timestamps diferentes porque migrations foram aplicadas por ferramentas remotas.

## Politicas gerais de modelagem

- Todas as entidades operacionais usam `uuid`.
- A maioria das tabelas possui `clinica_id` para isolamento multi-clinica.
- RLS esta habilitado nas 52 tabelas publicas. A tabela legada `integracoes_google` foi removida em 2026-08-14.
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
- `clientes_servicos_interesse`
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
- `whatsapp_testes`
- `whatsapp_webhook_events`
- `campanhas`
- `campanhas_servicos_alvo`
- `destinatarios_campanhas`

### Secretaria assistida

- `secretaria_planos_acao`
- `secretaria_plano_itens`
- `secretaria_atividades`

### Integracoes

- `google_calendar_connections`

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
- `fila_mensagem_id uuid`
- `canal text not null`
- `texto text not null`
- `ciclo text`
- `status text not null`
- `enviado_em timestamp with time zone`
- `observacao text`
- `provider text`, `provider_message_id text`, `meta_message_id text`
- `provider_status text`, `provider_error_code text`, `provider_updated_at timestamp with time zone`
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

### `clientes_servicos_interesse`

Relaciona clientes aos serviços de interesse, com origem do registro:

- `clinica_id uuid not null`
- `cliente_id uuid not null`
- `servico_id uuid not null`
- `origem text not null`: `cadastro_publico`, `painel` ou `migracao`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`

Chaves e índices:

- PK: `cliente_id, servico_id`
- FK composta de cliente e serviço com `clinica_id`
- índice por `clinica_id, servico_id, cliente_id`
- RLS para usuários autenticados vinculados à clínica; acesso `anon` revogado

O array legado `clientes.servicos_interesse` permanece sincronizado pelas operações de escrita para compatibilidade.

### `campanhas_servicos_alvo`

Relaciona campanhas aos serviços usados na segmentação por interesse:

- `clinica_id uuid not null`
- `campanha_id uuid not null`
- `servico_id uuid not null`
- `criado_em timestamp with time zone not null`
- `atualizado_em timestamp with time zone not null`

Chaves e índices:

- PK: `campanha_id, servico_id`
- FKs compostas com `clinica_id` para campanha e serviço
- índice por `clinica_id, servico_id, campanha_id`
- RLS para usuários autenticados vinculados à clínica; acesso `anon` revogado

Uma campanha do público `interesses` inclui clientes que tenham qualquer um dos serviços alvo.

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

### `planos_tratamento` e `itens_plano_tratamento`

Além dos dados comerciais do plano, o cronograma usa:

- em `planos_tratamento`: `frequencia`, `intervalo_dias`, `horario_preferencial`, `considerar_sabado`, `considerar_domingo` e `profissional_id`;
- em `itens_plano_tratamento`: `inicio_previsto_em`, `fim_previsto_em`, `ajuste_manual`, `situacao` e `arquivado_em`.

Frequências válidas: `diario`, `semanal`, `mensal` e `intervalo`. Situações dos itens: `planejado`, `aguardando_reagendamento` e `cancelado_plano`. O cronograma mantém unicidade por número de sessão no plano e por agendamento vinculado.

### `disponibilidade_semanal`

Representa os períodos semanais em que um profissional normalmente recebe clientes. Cada linha é um intervalo real de um profissional em um dia da semana; a ausência de linhas para um dia significa que o profissional não atende normalmente nesse dia.

- `id uuid`: identificador do período;
- `clinica_id uuid`: clínica/tenant do período;
- `profissional_id uuid`: referência a `perfis.id`, mesma identidade utilizada em `agendamentos.profissional_id`;
- `dia_semana smallint`: `0` domingo, `1` segunda, até `6` sábado;
- `inicio time` e `fim time`: horários locais da clínica, com `fim > inicio`;
- `criado_em` e `atualizado_em`: timestamps de auditoria.

Um profissional pode ter vários períodos no mesmo dia, mas os intervalos do mesmo profissional e dia não podem se sobrepor. A semana é salva atomicamente pela RPC `salvar_disponibilidade_semanal`, que também valida o vínculo do profissional à clínica, a permissão do usuário e os conflitos entre períodos. A leitura é protegida por RLS usando `private.usuario_tem_acesso_clinica`; a gravação pela API é feita somente pela RPC.

Esta tabela não substitui `bloqueios_agenda`: disponibilidade semanal representa o padrão comercial e bloqueios representam exceções operacionais. Atendimentos manuais fora da disponibilidade continuam permitidos e são desconsiderados do denominador das métricas canônicas de ocupação.

### `disponibilidade_excecoes`

Cabeçalho da disponibilidade comercial excepcional de um profissional em uma data específica:

- `id uuid`: identificador da exceção;
- `clinica_id uuid`: clínica/tenant;
- `profissional_id uuid`: referência a `perfis.id`;
- `data date`: data local da exceção;
- `nao_atende boolean`: indica indisponibilidade comercial durante todo o dia;
- `observacao text`: anotação opcional;
- `criado_em` e `atualizado_em`: timestamps de auditoria.

Há unicidade por `clinica_id`, `profissional_id` e `data`. Quando `nao_atende` é falso, os intervalos ficam em `disponibilidade_excecao_periodos`. A exceção substitui o padrão semanal somente naquela data; removê-la faz a data voltar a usar a configuração semanal.

### `disponibilidade_excecao_periodos`

Intervalos da exceção de uma data:

- `id uuid`: identificador do período;
- `clinica_id uuid`: clínica/tenant;
- `excecao_id uuid`: referência a `disponibilidade_excecoes.id`, com exclusão em cascata;
- `inicio time` e `fim time`: horários locais, com `fim > inicio`;
- `criado_em` e `atualizado_em`: timestamps de auditoria.

Os períodos não podem se sobrepor dentro da mesma exceção. As tabelas têm RLS para leitura de usuários vinculados à clínica, não aceitam escrita direta pelo cliente e são alteradas apenas pelas RPCs `salvar_disponibilidade_excecao` e `excluir_disponibilidade_excecao`. A capacidade consulta essas tabelas sob demanda; não cria recorrência, cache ou alteração em `bloqueios_agenda` e Google Calendar.

### Contratos canônicos de agenda

As RPCs `calcular_capacidade_comercial_periodo`, `calcular_radar_ocupacao_periodo` e `calcular_oportunidades_comerciais_periodo` recebem clínica, profissional e intervalo de datas de até 63 dias. Todas são `SECURITY INVOKER`, usam `search_path` fixo, exigem sessão/vínculo e têm execução revogada para `anon`.

Capacidade aplica a exceção integralmente quando presente; sem exceção usa o semanal. Bloqueios efetivos são subtraídos como união de intervalos. Atendimentos não cancelados são unidos e recortados à capacidade; cancelados, arquivados e fora da capacidade não ocupam. O fuso é `clinicas.fuso_horario`; janelas livres retornam timestamps e horários locais.

O Radar classifica cada data e marca atenção com `possui_capacidade`, ocupação menor que 65% e pelo menos 120 minutos livres. O motor de oportunidades usa apenas datas de atenção e fontes atuais de lista de espera ativa e retorno devido após atendimento concluído. O resultado é transitório e não representa envio, reserva, agendamento, score ou automação.

### `secretaria_planos_acao`

Cabeçalho persistido somente depois da ação explícita `Preparar ação`:

- `id uuid`: identificador do plano;
- `clinica_id uuid` e `profissional_id uuid`: tenant e profissional do snapshot;
- `data_alvo date`: dia comercial analisado;
- `status text`: `RASCUNHO`, `APROVADO` ou `CANCELADO`;
- `capacidade_minutos_snapshot`, `ocupado_minutos_snapshot`, `livre_minutos_snapshot` e `ocupacao_percentual_snapshot`: métricas do Radar no momento da criação/atualização;
- `classificacao_snapshot`, `fonte_disponibilidade_snapshot` e `total_oportunidades_snapshot`: contexto comercial recalculado;
- `criado_em`, `atualizado_em`, `criado_por`, `aprovado_em`, `aprovado_por`, `cancelado_em` e `cancelado_por`.

Há unicidade parcial de um plano ativo por `clinica_id`, `profissional_id` e `data_alvo` para `RASCUNHO`/`APROVADO`. O estado `CANCELADO` não é apagado e não bloqueia nova preparação. RLS exige acesso à clínica; grants REST são somente para `authenticated`.

### `secretaria_plano_itens`

Itens do plano e seu snapshot de oportunidade:

- `id`, `plano_id`, `clinica_id`, `profissional_id`, `cliente_id` e `servico_id`;
- `origem`: `lista_espera` ou `retorno`;
- `oportunidade_id_snapshot text` e `lista_espera_id uuid`: referências do resultado canônico;
- `motivo`, `duracao_minutos`, `retorno_devido_em`, `atraso_retorno_dias` e `janelas_compativeis jsonb`;
- `ordem integer`: ordem determinística de apresentação;
- `status`: `SELECIONADO`, `REMOVIDO` ou `INVALIDO`;
- `motivo_invalidacao`, `criado_em` e `atualizado_em`.

Existe no máximo um item `SELECIONADO` por cliente no plano e uma restrição de oportunidade por plano. A RPC de aprovação revalida cada item individualmente; um candidato inválido não descarta os demais.

### `secretaria_atividades`

Auditoria contextual de planos, sem reutilizar `logs_mensagens`:

- `id`, `clinica_id`, `profissional_id`, `plano_id`, `cliente_id`, `criado_em` e `criado_por`;
- `tipo`: `PLANO_CRIADO`, `PLANO_ATUALIZADO`, `PLANO_APROVADO`, `PLANO_CANCELADO`, `CANDIDATO_REMOVIDO` ou `CANDIDATO_INVALIDADO`;
- `dados jsonb`: detalhes mínimos da transição, sem payload de mensagem.

As três tabelas são criadas pela migration `20260907210000_assisted_secretary_action_plans`, têm RLS por clínica e não criam fila, reserva, agendamento, contato ou automação.

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
- `ultimo_erro`, `provider`, `provider_message_id`, `provider_status`, `provider_error_code` e `provider_updated_at`;
- `meta_message_id` e `provider_message_id` guardam o WAMID retornado pela Meta na integração direta;
- timestamps.

Restricoes/indices:

- UNIQUE `(clinica_id, canal, ciclo)`;
- indice de processamento por clinica/status/disponibilidade;
- indice de agendamento/modelo;

### `whatsapp_testes` e `whatsapp_webhook_events`

`whatsapp_testes` guarda somente a auditoria mínima dos testes controlados por clínica: destinatário, IDs do provedor/WhatsApp, status, erro e timestamps. `whatsapp_webhook_events` guarda apenas IDs e tipo de evento para idempotência. Nenhuma das duas tabelas armazena conteúdo ou histórico de conversas.
- RLS habilitado sem policy de frontend; processamento pela Edge Function/service role.

## RLS e funcoes auxiliares

Funcoes auxiliares:

- `private.usuario_tem_acesso_clinica(clinica uuid)`
- `private.usuario_e_admin_clinica(clinica uuid)`

Observacoes:

- As funcoes publicas antigas tiveram execucao revogada para `anon` e `authenticated`.
- As policies chamam funcoes do schema `private`.
- `usuarios_clinicas` tem policies separadas por acao: select, insert, update e delete.

