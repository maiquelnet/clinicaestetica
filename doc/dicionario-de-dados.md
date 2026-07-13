# Dicionario de Dados

Banco: Supabase Postgres

Schema principal: `public`

Status dos dados: todas as tabelas `public` foram truncadas e estao com `0` registros.

## Migrations aplicadas nesta etapa

- `20260703014440_fix_security_advisor_findings`
- `20260703014500_add_missing_foreign_key_indexes`

## Politicas gerais de modelagem

- Todas as entidades operacionais usam `uuid`.
- A maioria das tabelas possui `clinica_id` para isolamento multi-clinica.
- RLS esta habilitado nas tabelas publicas.
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
- `campanhas`
- `destinatarios_campanhas`

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
- `cidade text`
- `estado text`
- `fuso_horario text not null`
- `logo_url text`
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

## RLS e funcoes auxiliares

Funcoes auxiliares:

- `private.usuario_tem_acesso_clinica(clinica uuid)`
- `private.usuario_e_admin_clinica(clinica uuid)`

Observacoes:

- As funcoes publicas antigas tiveram execucao revogada para `anon` e `authenticated`.
- As policies chamam funcoes do schema `private`.
- `usuarios_clinicas` tem policies separadas por acao: select, insert, update e delete.

