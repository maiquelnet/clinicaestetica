begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Consentimento de WhatsApp e marketing nunca deve nascer previamente marcado.
alter table public.clientes
  alter column aceita_marketing set default false,
  add column if not exists whatsapp_opt_in_status text not null default 'pendente',
  add column if not exists whatsapp_opt_in_em timestamptz,
  add column if not exists whatsapp_opt_in_origem text,
  add column if not exists whatsapp_opt_in_versao text,
  add column if not exists whatsapp_opt_out_em timestamptz;

alter table public.clientes
  drop constraint if exists clientes_whatsapp_opt_in_status_check;

alter table public.clientes
  add constraint clientes_whatsapp_opt_in_status_check
  check (
    (whatsapp_opt_in_status = 'pendente' and whatsapp_opt_in_em is null and whatsapp_opt_out_em is null)
    or (
      whatsapp_opt_in_status = 'aceito'
      and whatsapp_opt_in_em is not null
      and whatsapp_opt_out_em is null
      and nullif(btrim(whatsapp_opt_in_origem), '') is not null
      and nullif(btrim(whatsapp_opt_in_versao), '') is not null
    )
    or (whatsapp_opt_in_status = 'recusado' and whatsapp_opt_in_em is null and whatsapp_opt_out_em is null)
    or (
      whatsapp_opt_in_status = 'revogado'
      and whatsapp_opt_in_em is not null
      and whatsapp_opt_out_em is not null
      and nullif(btrim(whatsapp_opt_in_origem), '') is not null
      and nullif(btrim(whatsapp_opt_in_versao), '') is not null
    )
  );

create table if not exists public.whatsapp_consent_events (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  status text not null check (status in ('pendente', 'aceito', 'recusado', 'revogado')),
  telefone text not null,
  escopo text not null default 'appointment_updates',
  origem text,
  versao text,
  ocorrido_em timestamptz not null,
  registrado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_whatsapp_consent_events_cliente
  on public.whatsapp_consent_events (cliente_id, ocorrido_em desc);

alter table public.whatsapp_consent_events enable row level security;
drop policy if exists whatsapp_consent_events_select_clinica on public.whatsapp_consent_events;
create policy whatsapp_consent_events_select_clinica
  on public.whatsapp_consent_events for select
  to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id));

create or replace function private.proteger_consentimento_whatsapp_telefone()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if regexp_replace(old.telefone, '[^0-9]', '', 'g')
      is distinct from regexp_replace(new.telefone, '[^0-9]', '', 'g')
    and old.whatsapp_opt_in_status = 'aceito' then
    insert into public.whatsapp_consent_events (
      clinica_id,
      cliente_id,
      status,
      telefone,
      origem,
      versao,
      ocorrido_em,
      registrado_por
    ) values (
      old.clinica_id,
      old.id,
      'revogado',
      old.telefone,
      old.whatsapp_opt_in_origem,
      old.whatsapp_opt_in_versao,
      now(),
      auth.uid()
    );

    -- O consentimento pertence ao numero anterior. Sem um novo aceite
    -- explicito, o numero novo volta ao estado pendente.
    if new.whatsapp_opt_in_status = 'aceito'
      and new.whatsapp_opt_in_em is not distinct from old.whatsapp_opt_in_em then
      new.whatsapp_opt_in_status := 'pendente';
      new.whatsapp_opt_in_em := null;
      new.whatsapp_opt_in_origem := null;
      new.whatsapp_opt_in_versao := null;
      new.whatsapp_opt_out_em := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.proteger_consentimento_whatsapp_telefone() from public;
drop trigger if exists trg_clientes_whatsapp_phone_consent on public.clientes;
create trigger trg_clientes_whatsapp_phone_consent
before update of telefone on public.clientes
for each row execute function private.proteger_consentimento_whatsapp_telefone();

create or replace function private.registrar_evento_consentimento_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_registrar boolean := false;
begin
  if tg_op = 'INSERT' then
    v_registrar := true;
  elsif old.whatsapp_opt_in_status is distinct from new.whatsapp_opt_in_status
    or old.whatsapp_opt_in_em is distinct from new.whatsapp_opt_in_em
    or old.whatsapp_opt_out_em is distinct from new.whatsapp_opt_out_em
    or regexp_replace(old.telefone, '[^0-9]', '', 'g')
      is distinct from regexp_replace(new.telefone, '[^0-9]', '', 'g') then
    v_registrar := true;
  end if;

  if v_registrar then
    insert into public.whatsapp_consent_events (
      clinica_id,
      cliente_id,
      status,
      telefone,
      origem,
      versao,
      ocorrido_em,
      registrado_por
    ) values (
      new.clinica_id,
      new.id,
      new.whatsapp_opt_in_status,
      new.telefone,
      new.whatsapp_opt_in_origem,
      new.whatsapp_opt_in_versao,
      case
        when new.whatsapp_opt_in_status = 'aceito' then new.whatsapp_opt_in_em
        when new.whatsapp_opt_in_status = 'revogado' then new.whatsapp_opt_out_em
        else now()
      end,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

revoke all on function private.registrar_evento_consentimento_whatsapp() from public;
drop trigger if exists trg_clientes_whatsapp_consent_audit on public.clientes;
create trigger trg_clientes_whatsapp_consent_audit
after insert or update of telefone, whatsapp_opt_in_status, whatsapp_opt_in_em, whatsapp_opt_out_em
on public.clientes
for each row execute function private.registrar_evento_consentimento_whatsapp();

alter table public.modelos_mensagens
  add column if not exists whatsapp_template_name text,
  add column if not exists whatsapp_template_language text not null default 'pt_BR';

update public.modelos_mensagens
set
  whatsapp_template_name = case tipo
    when 'confirmacao_agendamento' then 'confirmacao_agendamento_v1'
    when 'lembrete_agendamento' then 'lembrete_agendamento_v1'
    else whatsapp_template_name
  end,
  whatsapp_template_language = coalesce(nullif(whatsapp_template_language, ''), 'pt_BR')
where tipo in ('confirmacao_agendamento', 'lembrete_agendamento');

alter table public.regras_mensagens
  add column if not exists automacao_iniciada_em timestamptz;

create unique index if not exists uq_regras_mensagens_modelo_ativo
  on public.regras_mensagens (modelo_mensagem_id)
  where ativo = true;

alter table public.agendamentos
  add column if not exists whatsapp_schedule_revision bigint not null default 0;

alter table public.agendamentos
  drop constraint if exists agendamentos_whatsapp_schedule_revision_check;
alter table public.agendamentos
  add constraint agendamentos_whatsapp_schedule_revision_check
  check (whatsapp_schedule_revision >= 0);

create or replace function private.versionar_agendamento_whatsapp()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.whatsapp_schedule_revision := greatest(coalesce(new.whatsapp_schedule_revision, 0), 1);
  elsif old.inicio_em is distinct from new.inicio_em
    or old.cliente_id is distinct from new.cliente_id
    or (old.status = 'cancelado' and new.status in ('agendado', 'confirmado')) then
    new.whatsapp_schedule_revision := old.whatsapp_schedule_revision + 1;
  else
    new.whatsapp_schedule_revision := old.whatsapp_schedule_revision;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agendamentos_whatsapp_revision on public.agendamentos;
create trigger trg_agendamentos_whatsapp_revision
before insert or update on public.agendamentos
for each row execute function private.versionar_agendamento_whatsapp();

-- A tabela existente de lembretes passa a ser a outbox transacional.
alter table public.lembretes_agendamentos
  add column if not exists cliente_id uuid references public.clientes(id) on delete cascade,
  add column if not exists modelo_mensagem_id uuid references public.modelos_mensagens(id) on delete set null,
  add column if not exists regra_mensagem_id uuid references public.regras_mensagens(id) on delete set null,
  add column if not exists dedupe_key text,
  add column if not exists tentativas integer not null default 0,
  add column if not exists proxima_tentativa_em timestamptz,
  add column if not exists bloqueado_em timestamptz,
  add column if not exists bloqueado_por text,
  add column if not exists provider_message_id text,
  add column if not exists provider_status text,
  add column if not exists provider_status_em timestamptz,
  add column if not exists ultimo_erro text,
  add column if not exists enviado_em timestamptz,
  add column if not exists entregue_em timestamptz,
  add column if not exists lido_em timestamptz,
  add column if not exists cancelado_em timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.lembretes_agendamentos
  drop constraint if exists lembretes_agendamentos_status_check,
  drop constraint if exists lembretes_agendamentos_tentativas_check,
  drop constraint if exists lembretes_agendamentos_whatsapp_business_check;

alter table public.lembretes_agendamentos
  add constraint lembretes_agendamentos_status_check
    check (status in ('pendente', 'processando', 'enviado', 'entregue', 'lido', 'dispensado', 'erro', 'cancelado')),
  add constraint lembretes_agendamentos_tentativas_check
    check (tentativas >= 0),
  add constraint lembretes_agendamentos_whatsapp_business_check
    check (
      canal <> 'whatsapp_business'
      or (
        cliente_id is not null
        and modelo_mensagem_id is not null
        and regra_mensagem_id is not null
        and nullif(dedupe_key, '') is not null
        and metadata ? 'appointment_start'
        and metadata ? 'appointment_client_id'
        and metadata ? 'schedule_revision'
      )
    );

create index if not exists idx_lembretes_whatsapp_cliente
  on public.lembretes_agendamentos (cliente_id)
  where cliente_id is not null;
create index if not exists idx_lembretes_whatsapp_modelo
  on public.lembretes_agendamentos (modelo_mensagem_id)
  where modelo_mensagem_id is not null;
create index if not exists idx_lembretes_whatsapp_regra
  on public.lembretes_agendamentos (regra_mensagem_id)
  where regra_mensagem_id is not null;

create unique index if not exists uq_lembretes_whatsapp_dedupe
  on public.lembretes_agendamentos (clinica_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_lembretes_whatsapp_pendentes
  on public.lembretes_agendamentos (lembrar_em, proxima_tentativa_em)
  where canal = 'whatsapp_business' and status in ('pendente', 'processando', 'erro');

create unique index if not exists uq_lembretes_whatsapp_provider_message
  on public.lembretes_agendamentos (provider_message_id)
  where provider_message_id is not null;

alter table public.logs_mensagens
  add column if not exists provider_message_id text,
  add column if not exists provider_status text,
  add column if not exists provider_status_em timestamptz,
  add column if not exists dispatch_worker_id text,
  add column if not exists erro_codigo text,
  add column if not exists erro_detalhes text,
  add column if not exists entregue_em timestamptz,
  add column if not exists lido_em timestamptz,
  add column if not exists atualizado_em timestamptz not null default now();

alter table public.logs_mensagens
  drop constraint if exists logs_mensagens_status_check;

alter table public.logs_mensagens
  add constraint logs_mensagens_status_check
  check (status in ('pendente', 'enviado', 'entregue', 'lido', 'dispensado', 'erro', 'cancelado'));

create unique index if not exists uq_logs_mensagens_ciclo_canal
  on public.logs_mensagens (clinica_id, canal, ciclo);

create unique index if not exists uq_logs_mensagens_provider_message
  on public.logs_mensagens (provider_message_id)
  where provider_message_id is not null;

create table if not exists public.whatsapp_provider_events (
  id bigint generated always as identity primary key,
  provider_message_id text not null,
  provider_status text not null,
  ocorrido_em timestamptz not null,
  status text not null check (status in ('enviado', 'entregue', 'lido', 'erro')),
  erro_codigo text,
  erro_detalhes text,
  criado_em timestamptz not null default now(),
  unique (provider_message_id, provider_status, ocorrido_em)
);

create index if not exists idx_whatsapp_provider_events_message_time
  on public.whatsapp_provider_events (provider_message_id, ocorrido_em desc);

alter table public.whatsapp_provider_events enable row level security;
revoke all on public.whatsapp_provider_events from anon, authenticated;

create or replace function private.enfileirar_lembretes_whatsapp_agendamento()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  regra record;
  data_base timestamptz;
  data_programada timestamptz;
  deslocamento interval;
  chave text;
begin
  if new.status not in ('agendado', 'confirmado') or new.arquivado_em is not null then
    update public.lembretes_agendamentos
    set
      status = 'cancelado',
      cancelado_em = now(),
      bloqueado_em = null,
      bloqueado_por = null,
      atualizado_em = now()
    where agendamento_id = new.id
      and canal = 'whatsapp_business'
      and status in ('pendente', 'processando', 'dispensado', 'erro');
    return new;
  end if;

  for regra in
    select
      regras.id as regra_id,
      regras.gatilho,
      coalesce(regras.quantidade, 0) as quantidade,
      coalesce(regras.unidade, 'horas') as unidade,
      coalesce(regras.direcao, 'depois') as direcao,
      regras.automacao_iniciada_em,
      modelos.id as modelo_id,
      modelos.tipo
    from public.regras_mensagens regras
    join public.modelos_mensagens modelos on modelos.id = regras.modelo_mensagem_id
    where regras.clinica_id = new.clinica_id
      and regras.ativo = true
      and regras.canal_padrao = 'whatsapp_business'
      and regras.automacao_iniciada_em is not null
      and modelos.ativo = true
      and modelos.arquivado_em is null
      and modelos.whatsapp_template_name is not null
      and (
        (modelos.tipo = 'confirmacao_agendamento' and regras.gatilho = 'agendamento_criado')
        or (modelos.tipo = 'lembrete_agendamento' and regras.gatilho = 'inicio_agendamento')
      )
  loop
    if regra.gatilho = 'agendamento_criado' then
      if new.criado_em < regra.automacao_iniciada_em then
        continue;
      end if;
      data_base := new.criado_em;
    else
      if new.inicio_em <= now() then
        continue;
      end if;
      data_base := new.inicio_em;
    end if;

    deslocamento := case regra.unidade
      when 'minutos' then make_interval(mins => regra.quantidade)
      when 'dias' then make_interval(days => regra.quantidade)
      else make_interval(hours => regra.quantidade)
    end;
    data_programada := data_base + case regra.direcao
      when 'antes' then -deslocamento
      else deslocamento
    end;

    if regra.gatilho = 'inicio_agendamento' then
      data_programada := greatest(data_programada, now());
    end if;

    chave := format(
      'appointment:%s:client:%s:rule:%s:revision:%s:start:%s',
      new.id,
      new.cliente_id,
      regra.regra_id,
      new.whatsapp_schedule_revision,
      to_char(new.inicio_em at time zone 'UTC', 'YYYYMMDDHH24MISSMS')
    );

    update public.lembretes_agendamentos
    set
      status = 'cancelado',
      cancelado_em = now(),
      bloqueado_em = null,
      bloqueado_por = null,
      atualizado_em = now()
    where agendamento_id = new.id
      and regra_mensagem_id = regra.regra_id
      and canal = 'whatsapp_business'
      and dedupe_key is distinct from chave
      and status in ('pendente', 'processando', 'dispensado', 'erro');

    insert into public.lembretes_agendamentos (
      clinica_id,
      agendamento_id,
      cliente_id,
      modelo_mensagem_id,
      regra_mensagem_id,
      tipo,
      lembrar_em,
      canal,
      status,
      dedupe_key,
      metadata
    ) values (
      new.clinica_id,
      new.id,
      new.cliente_id,
      regra.modelo_id,
      regra.regra_id,
      regra.tipo,
      data_programada,
      'whatsapp_business',
      'pendente',
      chave,
      jsonb_build_object(
        'appointment_start', new.inicio_em,
        'appointment_client_id', new.cliente_id,
        'schedule_revision', new.whatsapp_schedule_revision
      )
    )
    on conflict (clinica_id, dedupe_key) where dedupe_key is not null
    do update set
      cliente_id = excluded.cliente_id,
      modelo_mensagem_id = excluded.modelo_mensagem_id,
      regra_mensagem_id = excluded.regra_mensagem_id,
      tipo = excluded.tipo,
      lembrar_em = excluded.lembrar_em,
      status = case
        when lembretes_agendamentos.status in ('enviado', 'entregue', 'lido') then lembretes_agendamentos.status
        else 'pendente'
      end,
      proxima_tentativa_em = null,
      bloqueado_em = null,
      bloqueado_por = null,
      ultimo_erro = null,
      cancelado_em = null,
      metadata = excluded.metadata,
      atualizado_em = now();
  end loop;

  return new;
end;
$$;

revoke all on function private.enfileirar_lembretes_whatsapp_agendamento() from public;

drop trigger if exists trg_agendamentos_whatsapp_outbox on public.agendamentos;
create trigger trg_agendamentos_whatsapp_outbox
after insert or update of inicio_em, fim_em, status, cliente_id, arquivado_em
on public.agendamentos
for each row execute function private.enfileirar_lembretes_whatsapp_agendamento();

create or replace function private.sincronizar_outbox_whatsapp_regra()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.ativo = true
    and new.canal_padrao = 'whatsapp_business'
    and new.automacao_iniciada_em is not null then
    -- A atribuicao, mesmo sem alterar o valor, dispara a funcao de fila somente
    -- para agendamentos futuros. Confirmacoes anteriores ao marco sao ignoradas.
    update public.agendamentos
    set inicio_em = inicio_em
    where clinica_id = new.clinica_id
      and status in ('agendado', 'confirmado')
      and arquivado_em is null
      and inicio_em > now();
  else
    update public.lembretes_agendamentos
    set
      status = 'cancelado',
      cancelado_em = now(),
      bloqueado_em = null,
      bloqueado_por = null,
      atualizado_em = now()
    where regra_mensagem_id = new.id
      and canal = 'whatsapp_business'
      and status in ('pendente', 'processando', 'dispensado', 'erro');
  end if;
  return new;
end;
$$;

revoke all on function private.sincronizar_outbox_whatsapp_regra() from public;

drop trigger if exists trg_regras_mensagens_whatsapp_outbox on public.regras_mensagens;
create trigger trg_regras_mensagens_whatsapp_outbox
after insert or update of ativo, canal_padrao, automacao_iniciada_em, gatilho, quantidade, unidade, direcao
on public.regras_mensagens
for each row execute function private.sincronizar_outbox_whatsapp_regra();

create or replace function private.sincronizar_outbox_whatsapp_modelo()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.ativo = true
    and new.arquivado_em is null
    and new.whatsapp_template_name is not null then
    update public.agendamentos
    set inicio_em = inicio_em
    where clinica_id = new.clinica_id
      and status in ('agendado', 'confirmado')
      and arquivado_em is null
      and inicio_em > now();
  else
    update public.lembretes_agendamentos
    set
      status = 'cancelado',
      cancelado_em = now(),
      bloqueado_em = null,
      bloqueado_por = null,
      atualizado_em = now()
    where modelo_mensagem_id = new.id
      and canal = 'whatsapp_business'
      and status in ('pendente', 'processando', 'dispensado', 'erro');
  end if;
  return new;
end;
$$;

revoke all on function private.sincronizar_outbox_whatsapp_modelo() from public;

drop trigger if exists trg_modelos_mensagens_whatsapp_outbox on public.modelos_mensagens;
create trigger trg_modelos_mensagens_whatsapp_outbox
after update of ativo, arquivado_em, whatsapp_template_name, whatsapp_template_language
on public.modelos_mensagens
for each row execute function private.sincronizar_outbox_whatsapp_modelo();

create or replace function private.sincronizar_outbox_whatsapp_consentimento()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.whatsapp_opt_in_status = 'aceito'
    and new.whatsapp_opt_in_em is not null
    and new.whatsapp_opt_out_em is null
    and (
      old.whatsapp_opt_in_status is distinct from new.whatsapp_opt_in_status
      or old.whatsapp_opt_in_em is distinct from new.whatsapp_opt_in_em
      or old.whatsapp_opt_out_em is distinct from new.whatsapp_opt_out_em
    ) then
    update public.agendamentos
    set inicio_em = inicio_em
    where clinica_id = new.clinica_id
      and cliente_id = new.id
      and status in ('agendado', 'confirmado')
      and arquivado_em is null
      and inicio_em > now();
  elsif new.whatsapp_opt_in_status <> 'aceito' or new.whatsapp_opt_out_em is not null then
    update public.lembretes_agendamentos
    set
      status = 'dispensado',
      ultimo_erro = 'Cliente sem consentimento ativo para mensagens de agendamento no WhatsApp.',
      bloqueado_em = null,
      bloqueado_por = null,
      atualizado_em = now()
    where cliente_id = new.id
      and canal = 'whatsapp_business'
      and status in ('pendente', 'processando', 'erro');
  end if;
  return new;
end;
$$;

revoke all on function private.sincronizar_outbox_whatsapp_consentimento() from public;

drop trigger if exists trg_clientes_whatsapp_consentimento on public.clientes;
create trigger trg_clientes_whatsapp_consentimento
after update of telefone, whatsapp_opt_in_status, whatsapp_opt_in_em, whatsapp_opt_out_em
on public.clientes
for each row execute function private.sincronizar_outbox_whatsapp_consentimento();

create or replace function public.claim_lembretes_whatsapp(
  p_limit integer default 25,
  p_worker_id text default null
)
returns setof public.lembretes_agendamentos
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with candidatos as materialized (
    select lembretes.id
    from public.lembretes_agendamentos lembretes
    where lembretes.canal = 'whatsapp_business'
      and (
        lembretes.status = 'pendente'
        or (
          lembretes.status = 'processando'
          and lembretes.bloqueado_em < now() - interval '10 minutes'
        )
        or (
          lembretes.status = 'erro'
          and lembretes.proxima_tentativa_em is not null
          and lembretes.proxima_tentativa_em <= now()
        )
      )
      and lembretes.lembrar_em <= now()
      and lembretes.cancelado_em is null
    order by lembretes.lembrar_em, lembretes.criado_em
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  update public.lembretes_agendamentos lembretes
  set
    status = 'processando',
    bloqueado_em = now(),
    bloqueado_por = coalesce(nullif(p_worker_id, ''), gen_random_uuid()::text),
    tentativas = lembretes.tentativas + 1,
    atualizado_em = now()
  from candidatos
  where lembretes.id = candidatos.id
  returning lembretes.*;
end;
$$;

revoke all on function public.claim_lembretes_whatsapp(integer, text) from public, anon, authenticated;
grant execute on function public.claim_lembretes_whatsapp(integer, text) to service_role;

create or replace function public.apply_whatsapp_provider_status(
  p_provider_message_id text,
  p_provider_status text,
  p_occurred_at timestamptz,
  p_status text,
  p_error_code text default null,
  p_error_details text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated boolean := false;
begin
  if p_provider_message_id is null
    or p_provider_status is null
    or p_occurred_at is null
    or p_status not in ('enviado', 'entregue', 'lido', 'erro') then
    raise exception 'Status do provedor invalido.' using errcode = '22023';
  end if;

  insert into public.whatsapp_provider_events (
    provider_message_id,
    provider_status,
    ocorrido_em,
    status,
    erro_codigo,
    erro_detalhes
  ) values (
    p_provider_message_id,
    p_provider_status,
    p_occurred_at,
    p_status,
    p_error_code,
    p_error_details
  ) on conflict (provider_message_id, provider_status, ocorrido_em) do nothing;

  update public.logs_mensagens as logs
  set
    status = p_status,
    provider_status = p_provider_status,
    provider_status_em = p_occurred_at,
    enviado_em = case
      when p_status in ('enviado', 'entregue', 'lido') then coalesce(enviado_em, p_occurred_at)
      else enviado_em
    end,
    entregue_em = case
      when p_status in ('entregue', 'lido') then coalesce(entregue_em, p_occurred_at)
      else entregue_em
    end,
    lido_em = case
      when p_status = 'lido' then coalesce(lido_em, p_occurred_at)
      else lido_em
    end,
    erro_codigo = case when p_status = 'erro' then p_error_code else null end,
    erro_detalhes = case when p_status = 'erro' then p_error_details else null end,
    atualizado_em = now()
  where logs.provider_message_id = p_provider_message_id
    and (
      provider_status_em is null
      or logs.provider_status in ('accepted', 'accepted_after_cancel', 'accepted_after_opt_out', 'accepted_unconfirmed')
      or provider_status_em < p_occurred_at
      or (
        provider_status_em = p_occurred_at
        and case p_status when 'enviado' then 1 when 'entregue' then 2 when 'lido' then 3 else 4 end
          >= case status when 'enviado' then 1 when 'entregue' then 2 when 'lido' then 3 when 'erro' then 4 else 0 end
      )
    );
  v_updated := found;

  update public.lembretes_agendamentos as lembretes
  set
    status = case
      when lembretes.status in ('cancelado', 'dispensado') then lembretes.status
      else p_status
    end,
    provider_status = p_provider_status,
    provider_status_em = p_occurred_at,
    enviado_em = case
      when p_status in ('enviado', 'entregue', 'lido') then coalesce(enviado_em, p_occurred_at)
      else enviado_em
    end,
    entregue_em = case
      when p_status in ('entregue', 'lido') then coalesce(entregue_em, p_occurred_at)
      else entregue_em
    end,
    lido_em = case
      when p_status = 'lido' then coalesce(lido_em, p_occurred_at)
      else lido_em
    end,
    ultimo_erro = case
      when lembretes.status in ('cancelado', 'dispensado') then lembretes.ultimo_erro
      when p_status = 'erro' then p_error_details
      else null
    end,
    atualizado_em = now()
  where lembretes.provider_message_id = p_provider_message_id
    and (
      provider_status_em is null
      or lembretes.provider_status in ('accepted', 'accepted_after_cancel', 'accepted_after_opt_out', 'accepted_unconfirmed')
      or provider_status_em < p_occurred_at
      or (
        provider_status_em = p_occurred_at
        and case p_status when 'enviado' then 1 when 'entregue' then 2 when 'lido' then 3 else 4 end
          >= case status when 'enviado' then 1 when 'entregue' then 2 when 'lido' then 3 when 'erro' then 4 else 0 end
      )
    );
  v_updated := v_updated or found;

  return v_updated;
end;
$$;

revoke all on function public.apply_whatsapp_provider_status(text, text, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_whatsapp_provider_status(text, text, timestamptz, text, text, text)
  to service_role;

create or replace function public.reconcile_whatsapp_provider_status(p_provider_message_id text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  evento record;
begin
  select eventos.* into evento
  from public.whatsapp_provider_events as eventos
  where eventos.provider_message_id = p_provider_message_id
  order by eventos.ocorrido_em desc, eventos.id desc
  limit 1;

  if evento.id is null then
    return false;
  end if;

  return public.apply_whatsapp_provider_status(
    evento.provider_message_id,
    evento.provider_status,
    evento.ocorrido_em,
    evento.status,
    evento.erro_codigo,
    evento.erro_detalhes
  );
end;
$$;

revoke all on function public.reconcile_whatsapp_provider_status(text) from public, anon, authenticated;
grant execute on function public.reconcile_whatsapp_provider_status(text) to service_role;

create or replace function public.finalize_whatsapp_send(
  p_log_id uuid,
  p_reminder_id uuid,
  p_worker_id text,
  p_provider_message_id text,
  p_sent_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_log_saved boolean := false;
  v_reminder_saved boolean := false;
begin
  if p_log_id is null
    or p_reminder_id is null
    or nullif(p_worker_id, '') is null
    or nullif(p_provider_message_id, '') is null
    or p_sent_at is null then
    raise exception 'Confirmacao de envio invalida.' using errcode = '22023';
  end if;

  -- Mantem a mesma ordem de bloqueio usada pelos webhooks: log e depois outbox.
  -- Assim, a associacao do message_id permanece atomica mesmo se consentimento,
  -- agendamento ou outro worker mudar o lembrete durante a chamada a Meta.
  perform 1
  from public.logs_mensagens as logs
  where logs.id = p_log_id
  for update;
  if not found then
    return false;
  end if;

  perform 1
  from public.lembretes_agendamentos as lembretes
  where lembretes.id = p_reminder_id
  for update;
  if not found then
    return false;
  end if;

  update public.logs_mensagens as logs
  set
    status = case when logs.status in ('entregue', 'lido') then logs.status else 'enviado' end,
    provider_message_id = p_provider_message_id,
    provider_status = case
      when logs.provider_status_em is not null and logs.provider_status_em > p_sent_at
        then logs.provider_status
      else 'accepted'
    end,
    provider_status_em = greatest(coalesce(logs.provider_status_em, p_sent_at), p_sent_at),
    enviado_em = coalesce(logs.enviado_em, p_sent_at),
    dispatch_worker_id = null,
    atualizado_em = now(),
    erro_codigo = null,
    erro_detalhes = null
  where logs.id = p_log_id
    and exists (
      select 1
      from public.lembretes_agendamentos as lembretes
      where lembretes.id = p_reminder_id
        and lembretes.clinica_id = logs.clinica_id
        and lembretes.agendamento_id = logs.agendamento_id
        and lembretes.dedupe_key = logs.ciclo
        and (
          lembretes.provider_message_id is null
          or lembretes.provider_message_id = p_provider_message_id
        )
    )
    and (
      (
        logs.status = 'pendente'
        and logs.provider_message_id is null
        and logs.dispatch_worker_id = p_worker_id
      )
      or logs.provider_message_id = p_provider_message_id
    );
  v_log_saved := found;

  if not v_log_saved then
    return false;
  end if;

  update public.lembretes_agendamentos as lembretes
  set
    status = case
      when lembretes.status in ('cancelado', 'dispensado', 'entregue', 'lido')
        then lembretes.status
      else 'enviado'
    end,
    provider_message_id = p_provider_message_id,
    provider_status = case
      when lembretes.status = 'cancelado' then 'accepted_after_cancel'
      when lembretes.status = 'dispensado' then 'accepted_after_opt_out'
      when lembretes.provider_status_em is not null
        and lembretes.provider_status_em > p_sent_at then lembretes.provider_status
      else 'accepted'
    end,
    provider_status_em = greatest(coalesce(lembretes.provider_status_em, p_sent_at), p_sent_at),
    enviado_em = coalesce(lembretes.enviado_em, p_sent_at),
    ultimo_erro = case
      when lembretes.status = 'cancelado'
        then 'A Meta aceitou a mensagem enquanto o job era cancelado.'
      when lembretes.status = 'dispensado'
        then 'A Meta aceitou a mensagem enquanto o consentimento era revogado.'
      else null
    end,
    proxima_tentativa_em = null,
    bloqueado_em = null,
    bloqueado_por = null,
    atualizado_em = now()
  where lembretes.id = p_reminder_id
    and (
      lembretes.provider_message_id is null
      or lembretes.provider_message_id = p_provider_message_id
    );
  v_reminder_saved := found;

  perform public.reconcile_whatsapp_provider_status(p_provider_message_id);
  return v_log_saved and v_reminder_saved;
end;
$$;

revoke all on function public.finalize_whatsapp_send(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.finalize_whatsapp_send(uuid, uuid, text, text, timestamptz)
  to service_role;

create or replace function public.salvar_modelo_mensagem_e_regra(
  p_clinica_id uuid,
  p_modelo_id uuid,
  p_regra_id uuid,
  p_tipo text,
  p_nome text,
  p_texto text,
  p_modelo_ativo boolean,
  p_prioridade integer,
  p_whatsapp_template_name text,
  p_whatsapp_template_language text,
  p_gatilho text,
  p_quantidade integer,
  p_unidade text,
  p_direcao text,
  p_janela_alerta_dias integer,
  p_canal_padrao text,
  p_automacao_iniciada_em timestamptz
)
returns table (modelo_id uuid, regra_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_modelo_id uuid;
  v_regra_id uuid;
begin
  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Sem acesso a clinica.' using errcode = '42501';
  end if;
  if nullif(btrim(p_tipo), '') is null
    or nullif(btrim(p_nome), '') is null
    or nullif(btrim(p_texto), '') is null then
    raise exception 'Tipo, nome e texto sao obrigatorios.' using errcode = '22023';
  end if;
  if p_canal_padrao not in ('whatsapp_manual', 'whatsapp_business') then
    raise exception 'Canal de mensagem invalido.' using errcode = '22023';
  end if;
  if (
    p_canal_padrao = 'whatsapp_business'
    or exists (
      select 1
      from public.regras_mensagens regras_existentes
      where regras_existentes.clinica_id = p_clinica_id
        and regras_existentes.canal_padrao = 'whatsapp_business'
        and (
          (p_regra_id is not null and regras_existentes.id = p_regra_id)
          or (p_modelo_id is not null and regras_existentes.modelo_mensagem_id = p_modelo_id)
        )
    )
  ) and not exists (
    select 1
    from public.usuarios_clinicas
    where clinica_id = p_clinica_id
      and perfil_id = auth.uid()
      and ativo = true
      and papel in ('proprietario', 'administrador')
  ) then
    raise exception 'Apenas proprietarios e administradores podem alterar a automacao.' using errcode = '42501';
  end if;
  if p_canal_padrao = 'whatsapp_business' then
    if p_tipo not in ('confirmacao_agendamento', 'lembrete_agendamento')
      or p_automacao_iniciada_em is null
      or nullif(btrim(p_whatsapp_template_name), '') is null
      or nullif(btrim(p_whatsapp_template_language), '') is null
      or p_whatsapp_template_name !~ '^[a-z0-9_]+$'
      or p_whatsapp_template_language !~ '^[a-z]{2}(_[A-Z]{2})?$' then
      raise exception 'Configuracao do modelo automatico invalida.' using errcode = '22023';
    end if;
    if (p_tipo = 'confirmacao_agendamento' and p_gatilho <> 'agendamento_criado')
      or (p_tipo = 'lembrete_agendamento' and p_gatilho <> 'inicio_agendamento') then
      raise exception 'Gatilho incompativel com o modelo automatico.' using errcode = '22023';
    end if;
  end if;

  if p_modelo_id is null then
    insert into public.modelos_mensagens (
      clinica_id, tipo, nome, texto, ativo, prioridade,
      whatsapp_template_name, whatsapp_template_language
    ) values (
      p_clinica_id, btrim(p_tipo), btrim(p_nome), btrim(p_texto), p_modelo_ativo,
      greatest(coalesce(p_prioridade, 9), 1), nullif(btrim(p_whatsapp_template_name), ''),
      coalesce(nullif(btrim(p_whatsapp_template_language), ''), 'pt_BR')
    ) returning id into v_modelo_id;
  else
    update public.modelos_mensagens
    set
      tipo = btrim(p_tipo),
      nome = btrim(p_nome),
      texto = btrim(p_texto),
      ativo = p_modelo_ativo,
      prioridade = greatest(coalesce(p_prioridade, 9), 1),
      whatsapp_template_name = nullif(btrim(p_whatsapp_template_name), ''),
      whatsapp_template_language = coalesce(nullif(btrim(p_whatsapp_template_language), ''), 'pt_BR'),
      atualizado_em = now()
    where id = p_modelo_id and clinica_id = p_clinica_id
    returning id into v_modelo_id;
    if v_modelo_id is null then
      raise exception 'Modelo de mensagem nao encontrado.' using errcode = 'P0002';
    end if;
  end if;

  v_regra_id := p_regra_id;
  if v_regra_id is null then
    select id into v_regra_id
    from public.regras_mensagens
    where modelo_mensagem_id = v_modelo_id
      and clinica_id = p_clinica_id
    order by ativo desc, criado_em
    limit 1;
  end if;

  if v_regra_id is null then
    insert into public.regras_mensagens (
      clinica_id, modelo_mensagem_id, gatilho, quantidade, unidade, direcao,
      janela_alerta_dias, canal_padrao, ativo, automacao_iniciada_em
    ) values (
      p_clinica_id, v_modelo_id, p_gatilho, p_quantidade, p_unidade, p_direcao,
      p_janela_alerta_dias, p_canal_padrao, true, p_automacao_iniciada_em
    ) returning id into v_regra_id;
  else
    update public.regras_mensagens
    set
      gatilho = p_gatilho,
      quantidade = p_quantidade,
      unidade = p_unidade,
      direcao = p_direcao,
      janela_alerta_dias = p_janela_alerta_dias,
      canal_padrao = p_canal_padrao,
      ativo = true,
      automacao_iniciada_em = p_automacao_iniciada_em,
      atualizado_em = now()
    where id = v_regra_id
      and clinica_id = p_clinica_id
      and modelo_mensagem_id = v_modelo_id;
    if not found then
      raise exception 'Regra de mensagem nao encontrada.' using errcode = 'P0002';
    end if;
  end if;

  return query select v_modelo_id, v_regra_id;
end;
$$;

revoke all on function public.salvar_modelo_mensagem_e_regra(
  uuid, uuid, uuid, text, text, text, boolean, integer, text, text,
  text, integer, text, text, integer, text, timestamptz
) from public, anon;
grant execute on function public.salvar_modelo_mensagem_e_regra(
  uuid, uuid, uuid, text, text, text, boolean, integer, text, text,
  text, integer, text, text, integer, text, timestamptz
) to authenticated;

-- O navegador pode consultar e criar registros manuais, mas não alterar o
-- resultado confirmado pelo provedor.
drop policy if exists logs_mensagens_acesso_clinica on public.logs_mensagens;
create policy logs_mensagens_select_clinica
  on public.logs_mensagens for select
  to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id));
create policy logs_mensagens_insert_clinica
  on public.logs_mensagens for insert
  to authenticated
  with check (
    private.usuario_tem_acesso_clinica(clinica_id)
    and canal = 'whatsapp_manual'
    and provider_message_id is null
    and provider_status is null
    and provider_status_em is null
    and dispatch_worker_id is null
  );

alter policy clientes_acesso_clinica on public.clientes to authenticated;
drop policy if exists lembretes_agendamentos_acesso_clinica on public.lembretes_agendamentos;
drop policy if exists lembretes_agendamentos_select_clinica on public.lembretes_agendamentos;
create policy lembretes_agendamentos_select_clinica
  on public.lembretes_agendamentos for select
  to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id));
alter policy mensagens_dispensadas_acesso_clinica on public.mensagens_dispensadas to authenticated;
drop policy if exists modelos_mensagens_acesso_clinica on public.modelos_mensagens;
drop policy if exists modelos_mensagens_select_clinica on public.modelos_mensagens;
create policy modelos_mensagens_select_clinica
  on public.modelos_mensagens for select
  to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id));
drop policy if exists regras_mensagens_acesso_clinica on public.regras_mensagens;
drop policy if exists regras_mensagens_select_clinica on public.regras_mensagens;
create policy regras_mensagens_select_clinica
  on public.regras_mensagens for select
  to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id));

revoke all on public.clientes, public.lembretes_agendamentos, public.logs_mensagens,
  public.mensagens_dispensadas, public.modelos_mensagens, public.regras_mensagens,
  public.whatsapp_consent_events, public.whatsapp_provider_events from anon;
revoke truncate, references, trigger on public.clientes, public.lembretes_agendamentos,
  public.logs_mensagens, public.mensagens_dispensadas, public.modelos_mensagens,
  public.regras_mensagens from authenticated;
revoke insert, update, delete on public.lembretes_agendamentos from authenticated;
revoke update, delete on public.logs_mensagens from authenticated;
revoke insert, update, delete on public.modelos_mensagens, public.regras_mensagens from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.whatsapp_consent_events, public.whatsapp_provider_events from authenticated;
grant select on public.whatsapp_consent_events to authenticated;
grant all on public.whatsapp_consent_events, public.whatsapp_provider_events to service_role;
grant usage, select on sequence public.whatsapp_provider_events_id_seq to service_role;

-- O pg_cron confirma apenas a execucao do SQL que enfileira o pg_net. Esta
-- tabela conserva o resultado HTTP real depois que a tabela UNLOGGED do pg_net
-- expira, sem armazenar headers, tokens ou o corpo da resposta.
create table if not exists private.whatsapp_cron_http_runs (
  request_id bigint primary key,
  enqueued_at timestamptz not null default clock_timestamp(),
  response_at timestamptz,
  status_code integer,
  timed_out boolean,
  error_msg text
);

create index if not exists whatsapp_cron_http_runs_enqueued_at_idx
  on private.whatsapp_cron_http_runs (enqueued_at desc);

revoke all on private.whatsapp_cron_http_runs from public, anon, authenticated;

create or replace function private.capture_whatsapp_cron_http_responses()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update private.whatsapp_cron_http_runs as runs
  set
    response_at = responses.created,
    status_code = responses.status_code,
    timed_out = coalesce(responses.timed_out, false),
    error_msg = left(responses.error_msg, 1000)
  from net._http_response as responses
  where responses.id = runs.request_id
    and runs.response_at is null;

  delete from private.whatsapp_cron_http_runs as runs
  where runs.enqueued_at < clock_timestamp() - interval '30 days';
end;
$$;

revoke all on function private.capture_whatsapp_cron_http_responses()
  from public, anon, authenticated;

create or replace function public.whatsapp_runtime_status()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_job_id bigint;
  v_cron_active boolean := false;
  v_vault_configured boolean := false;
  v_last_status text;
  v_last_run_at timestamptz;
  v_http_enqueued_at timestamptz;
  v_http_response_at timestamptz;
  v_http_status_code integer;
  v_http_timed_out boolean;
  v_http_error text;
  v_http_outcome text;
begin
  perform private.capture_whatsapp_cron_http_responses();

  select jobs.jobid, jobs.active
  into v_job_id, v_cron_active
  from cron.job as jobs
  where jobs.jobname = 'whatsapp-process-due-every-minute'
  limit 1;

  select count(distinct secrets.name) = 2
  into v_vault_configured
  from vault.decrypted_secrets as secrets
  where secrets.name in ('whatsapp_function_url', 'whatsapp_cron_secret');

  if v_job_id is not null then
    select runs.status, coalesce(runs.end_time, runs.start_time)
    into v_last_status, v_last_run_at
    from cron.job_run_details as runs
    where runs.jobid = v_job_id
    order by runs.runid desc
    limit 1;
  end if;

  select
    runs.enqueued_at,
    runs.response_at,
    runs.status_code,
    runs.timed_out,
    runs.error_msg
  into
    v_http_enqueued_at,
    v_http_response_at,
    v_http_status_code,
    v_http_timed_out,
    v_http_error
  from private.whatsapp_cron_http_runs as runs
  order by runs.enqueued_at desc
  limit 1;

  v_http_outcome := case
    when v_http_enqueued_at is null then null
    when v_http_response_at is null
      and v_http_enqueued_at >= clock_timestamp() - interval '2 minutes' then 'pending'
    when v_http_response_at is null then 'response_missing'
    when coalesce(v_http_timed_out, false) or v_http_error is not null then 'transport_error'
    when v_http_status_code between 200 and 299 then 'http_2xx'
    when v_http_status_code = 401 then 'http_401'
    when v_http_status_code between 500 and 599 then 'http_5xx'
    else 'http_non_2xx'
  end;

  return jsonb_build_object(
    'cronActive', coalesce(v_cron_active, false),
    'vaultConfigured', coalesce(v_vault_configured, false),
    'lastRunStatus', v_last_status,
    'lastRunAt', v_last_run_at,
    'lastHttpOutcome', v_http_outcome,
    'lastHttpStatusCode', v_http_status_code,
    'lastHttpResponseAt', v_http_response_at,
    'lastHttpError', v_http_error
  );
end;
$$;

revoke all on function public.whatsapp_runtime_status() from public, anon, authenticated;
grant execute on function public.whatsapp_runtime_status() to service_role;

create or replace function private.invoke_whatsapp_processor()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_function_url text;
  v_cron_secret text;
  v_request_id bigint;
begin
  perform private.capture_whatsapp_cron_http_responses();

  select decrypted_secret into v_function_url
  from vault.decrypted_secrets
  where name = 'whatsapp_function_url'
  order by created_at desc
  limit 1;

  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets
  where name = 'whatsapp_cron_secret'
  order by created_at desc
  limit 1;

  if nullif(v_function_url, '') is null or nullif(v_cron_secret, '') is null then
    return null;
  end if;

  select net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body := jsonb_build_object('action', 'process-due'),
    timeout_milliseconds := 60000
  ) into v_request_id;

  insert into private.whatsapp_cron_http_runs (request_id)
  values (v_request_id)
  on conflict (request_id) do nothing;

  return v_request_id;
end;
$$;

revoke all on function private.invoke_whatsapp_processor() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'whatsapp-process-due-every-minute';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'whatsapp-process-due-every-minute',
    '* * * * *',
    'select private.invoke_whatsapp_processor();'
  );
end;
$$;

commit;
