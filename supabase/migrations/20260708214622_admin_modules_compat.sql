create extension if not exists pgcrypto;
create extension if not exists citext;

alter table public.clientes
  add column if not exists parceira boolean not null default false;

alter table public.clinicas
  add column if not exists complemento text,
  add column if not exists cep text,
  add column if not exists link_google_avaliacao text,
  add column if not exists google_place_id text;

create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null,
  documento text,
  telefone text,
  email citext,
  contato text,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz
);

create table if not exists public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  nome text not null,
  categoria text,
  sala_local text,
  valor_compra numeric not null default 0,
  data_compra date,
  status text not null default 'ativo',
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz
);

create table if not exists public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  servico_id uuid references public.servicos(id) on delete set null,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  data_preferida date,
  inicio_desejado_em timestamptz,
  fim_desejado_em timestamptz,
  status text not null default 'em_espera',
  prioridade integer not null default 3,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz
);

alter table public.lista_espera
  add column if not exists agendamento_id uuid references public.agendamentos(id) on delete set null,
  add column if not exists data_preferida date,
  add column if not exists inicio_desejado_em timestamptz,
  add column if not exists fim_desejado_em timestamptz,
  add column if not exists prioridade integer not null default 3,
  add column if not exists arquivado_em timestamptz;

update public.lista_espera
set inicio_desejado_em = coalesce(inicio_desejado_em, data_preferida::timestamptz + interval '9 hours'),
    fim_desejado_em = coalesce(fim_desejado_em, data_preferida::timestamptz + interval '10 hours')
where data_preferida is not null
  and (inicio_desejado_em is null or fim_desejado_em is null);

alter table public.lista_espera drop constraint if exists lista_espera_status_check;
update public.lista_espera
set status = case status
  when 'agendado' then 'confirmado'
  when 'cancelado' then 'cancelado'
  else 'em_espera'
end
where status not in ('em_espera', 'confirmado', 'cancelado');
alter table public.lista_espera
  add constraint lista_espera_status_check
    check (status in ('em_espera', 'confirmado', 'cancelado')),
  drop constraint if exists lista_espera_periodo_check,
  add constraint lista_espera_periodo_check
    check (fim_desejado_em is null or inicio_desejado_em is null or fim_desejado_em > inicio_desejado_em);

create table if not exists public.planos_tratamento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  servico_id uuid references public.servicos(id) on delete restrict,
  titulo text not null default '',
  nome text not null default '',
  total_sessoes integer not null default 1,
  sessoes_realizadas integer not null default 0,
  valor_total numeric not null default 0,
  valor_sessao numeric not null default 0,
  status text not null default 'em_andamento',
  inicio_em date,
  fim_previsto_em date,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz
);

alter table public.planos_tratamento
  add column if not exists servico_id uuid references public.servicos(id) on delete restrict,
  add column if not exists titulo text not null default '',
  add column if not exists nome text,
  add column if not exists total_sessoes integer not null default 1,
  add column if not exists sessoes_realizadas integer not null default 0,
  add column if not exists valor_total numeric not null default 0,
  add column if not exists valor_sessao numeric not null default 0,
  add column if not exists inicio_em date,
  add column if not exists fim_previsto_em date,
  add column if not exists observacoes text,
  add column if not exists arquivado_em timestamptz;

update public.planos_tratamento
set nome = coalesce(nullif(nome, ''), titulo, 'Plano de tratamento')
where nome is null or nome = '';
alter table public.planos_tratamento
  alter column nome set default '',
  alter column nome set not null,
  alter column titulo set default '';
alter table public.planos_tratamento drop constraint if exists planos_tratamento_status_check;
update public.planos_tratamento
set status = 'em_andamento'
where status = 'ativo';
alter table public.planos_tratamento
  add constraint planos_tratamento_status_check
    check (status in ('em_andamento', 'concluido', 'cancelado')),
  drop constraint if exists planos_tratamento_total_sessoes_check,
  add constraint planos_tratamento_total_sessoes_check
    check (total_sessoes > 0 and sessoes_realizadas >= 0 and sessoes_realizadas <= total_sessoes);

create table if not exists public.itens_plano_tratamento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  plano_tratamento_id uuid not null references public.planos_tratamento(id) on delete cascade,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  numero_sessao integer,
  status text not null default 'pendente',
  realizado_em timestamptz,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.itens_plano_tratamento
  add column if not exists agendamento_id uuid references public.agendamentos(id) on delete set null,
  add column if not exists numero_sessao integer,
  add column if not exists status text not null default 'pendente',
  add column if not exists realizado_em timestamptz,
  add column if not exists observacoes text;

create table if not exists public.movimentacoes_financeiras (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  tipo text not null,
  descricao text not null,
  valor numeric not null,
  vencimento_em date,
  pago_em date,
  status text not null default 'pendente',
  categoria text,
  conta text,
  metodo_pagamento text,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz
);

alter table public.movimentacoes_financeiras
  add column if not exists categoria text,
  add column if not exists conta text,
  add column if not exists metodo_pagamento text,
  add column if not exists arquivado_em timestamptz;

create table if not exists public.itens_estoque (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  nome text not null,
  categoria text,
  unidade text not null default 'un',
  quantidade_atual numeric not null default 0,
  estoque_minimo numeric not null default 0,
  custo_unitario numeric not null default 0,
  ativo boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz
);

create table if not exists public.movimentacoes_estoque (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  item_estoque_id uuid not null references public.itens_estoque(id) on delete cascade,
  tipo text not null,
  quantidade numeric not null,
  custo_unitario numeric,
  motivo text,
  criado_em timestamptz not null default now()
);

create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  modelo_mensagem_id uuid references public.modelos_mensagens(id) on delete set null,
  titulo text not null,
  mensagem text not null,
  publico text not null default 'todos',
  status text not null default 'rascunho',
  criado_por uuid references public.perfis(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz
);

alter table public.campanhas
  add column if not exists modelo_mensagem_id uuid references public.modelos_mensagens(id) on delete set null,
  add column if not exists publico text not null default 'todos';
alter table public.campanhas drop constraint if exists campanhas_status_check;
update public.campanhas
set status = case status
  when 'finalizada' then 'concluida'
  when 'arquivada' then 'cancelada'
  else status
end;
alter table public.campanhas
  add constraint campanhas_status_check
    check (status in ('rascunho', 'ativa', 'pausada', 'concluida', 'cancelada'));

create table if not exists public.destinatarios_campanhas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  texto text,
  status text not null default 'pendente',
  enviado_em timestamptz,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (campanha_id, cliente_id)
);

alter table public.destinatarios_campanhas
  add column if not exists texto text,
  add column if not exists observacao text;
alter table public.destinatarios_campanhas
  drop constraint if exists destinatarios_campanhas_status_check;
update public.destinatarios_campanhas
set status = case status
  when 'erro' then 'falha'
  when 'dispensado' then 'cancelado'
  else status
end;
alter table public.destinatarios_campanhas
  add constraint destinatarios_campanhas_status_check
    check (status in ('pendente', 'enviado', 'falha', 'cancelado'));

create table if not exists public.avaliacoes_clientes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  origem text not null default 'manual',
  nota integer not null,
  comentario text,
  link_externo text,
  avaliado_em date not null default current_date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz,
  constraint avaliacoes_clientes_nota_check check (nota between 1 and 5)
);

create table if not exists public.configuracoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  chave text not null,
  valor text,
  descricao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (clinica_id, chave)
);

create index if not exists fornecedores_clinica_idx on public.fornecedores(clinica_id);
create index if not exists equipamentos_clinica_idx on public.equipamentos(clinica_id);
create index if not exists lista_espera_clinica_inicio_idx on public.lista_espera(clinica_id, inicio_desejado_em);
create index if not exists planos_tratamento_clinica_idx on public.planos_tratamento(clinica_id);
create index if not exists movimentacoes_financeiras_clinica_vencimento_idx on public.movimentacoes_financeiras(clinica_id, vencimento_em);
create index if not exists itens_estoque_clinica_idx on public.itens_estoque(clinica_id);
create index if not exists campanhas_clinica_idx on public.campanhas(clinica_id);
create index if not exists destinatarios_campanhas_clinica_idx on public.destinatarios_campanhas(clinica_id);
create index if not exists avaliacoes_clientes_clinica_idx on public.avaliacoes_clientes(clinica_id);
create index if not exists configuracoes_clinica_chave_idx on public.configuracoes(clinica_id, chave);

alter table public.equipamentos
  drop constraint if exists equipamentos_status_check,
  add constraint equipamentos_status_check check (status in ('ativo', 'manutencao', 'inativo'));
alter table public.movimentacoes_financeiras
  drop constraint if exists movimentacoes_financeiras_tipo_check,
  add constraint movimentacoes_financeiras_tipo_check check (tipo in ('receita', 'despesa')),
  drop constraint if exists movimentacoes_financeiras_status_check,
  add constraint movimentacoes_financeiras_status_check check (status in ('pendente', 'pago', 'atrasado', 'cancelado'));
alter table public.itens_estoque
  drop constraint if exists itens_estoque_quantidades_check,
  add constraint itens_estoque_quantidades_check check (quantidade_atual >= 0 and estoque_minimo >= 0);
alter table public.movimentacoes_estoque
  drop constraint if exists movimentacoes_estoque_tipo_check,
  add constraint movimentacoes_estoque_tipo_check check (tipo in ('entrada', 'saida', 'ajuste'));

alter table public.fornecedores enable row level security;
alter table public.equipamentos enable row level security;
alter table public.lista_espera enable row level security;
alter table public.planos_tratamento enable row level security;
alter table public.itens_plano_tratamento enable row level security;
alter table public.movimentacoes_financeiras enable row level security;
alter table public.itens_estoque enable row level security;
alter table public.movimentacoes_estoque enable row level security;
alter table public.campanhas enable row level security;
alter table public.destinatarios_campanhas enable row level security;
alter table public.avaliacoes_clientes enable row level security;
alter table public.configuracoes enable row level security;

drop policy if exists fornecedores_clinica_access on public.fornecedores;
create policy fornecedores_clinica_access on public.fornecedores
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists equipamentos_clinica_access on public.equipamentos;
create policy equipamentos_clinica_access on public.equipamentos
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists lista_espera_clinica_access on public.lista_espera;
create policy lista_espera_clinica_access on public.lista_espera
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists planos_tratamento_clinica_access on public.planos_tratamento;
create policy planos_tratamento_clinica_access on public.planos_tratamento
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists itens_plano_tratamento_clinica_access on public.itens_plano_tratamento;
create policy itens_plano_tratamento_clinica_access on public.itens_plano_tratamento
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists movimentacoes_financeiras_clinica_access on public.movimentacoes_financeiras;
create policy movimentacoes_financeiras_clinica_access on public.movimentacoes_financeiras
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists itens_estoque_clinica_access on public.itens_estoque;
create policy itens_estoque_clinica_access on public.itens_estoque
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists movimentacoes_estoque_clinica_access on public.movimentacoes_estoque;
create policy movimentacoes_estoque_clinica_access on public.movimentacoes_estoque
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists campanhas_clinica_access on public.campanhas;
create policy campanhas_clinica_access on public.campanhas
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists destinatarios_campanhas_clinica_access on public.destinatarios_campanhas;
create policy destinatarios_campanhas_clinica_access on public.destinatarios_campanhas
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists avaliacoes_clientes_clinica_access on public.avaliacoes_clientes;
create policy avaliacoes_clientes_clinica_access on public.avaliacoes_clientes
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists configuracoes_clinica_access on public.configuracoes;
create policy configuracoes_clinica_access on public.configuracoes
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));
