alter table public.agendamentos
  add column if not exists google_sync_status text not null default 'pendente'
    check (google_sync_status in ('pendente', 'sincronizado', 'erro')),
  add column if not exists google_sync_erro text,
  add column if not exists google_atualizado_em timestamptz,
  add column if not exists google_ultima_sincronizacao_em timestamptz;

create unique index if not exists uq_agendamentos_google_event
  on public.agendamentos (clinica_id, google_event_id);

alter table public.bloqueios_agenda
  add column if not exists google_event_id text,
  add column if not exists origem text not null default 'sistema'
    check (origem in ('sistema', 'google')),
  add column if not exists google_atualizado_em timestamptz;

create unique index if not exists uq_bloqueios_google_event
  on public.bloqueios_agenda (clinica_id, google_event_id);

create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null unique references public.clinicas(id) on delete cascade,
  calendar_id text not null default 'primary',
  tokens_encrypted text not null,
  sync_token text,
  channel_id text,
  resource_id text,
  channel_token text,
  channel_expires_at timestamptz,
  ultima_sincronizacao_em timestamptz,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.google_calendar_connections enable row level security;
-- Sem policies: somente a Edge Function com service role pode ler credenciais.

create or replace function private.marcar_agendamento_google_pendente()
returns trigger language plpgsql set search_path = public, private as $$
begin
  if new.google_atualizado_em is not distinct from old.google_atualizado_em
     and (new.inicio_em, new.fim_em, new.status, new.cliente_id, new.servico_id,
          new.profissional_id, new.observacoes)
         is distinct from
         (old.inicio_em, old.fim_em, old.status, old.cliente_id, old.servico_id,
          old.profissional_id, old.observacoes) then
    new.google_sync_status = 'pendente';
    new.google_sync_erro = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agendamentos_google_sync on public.agendamentos;
create trigger trg_agendamentos_google_sync
before update on public.agendamentos
for each row execute function private.marcar_agendamento_google_pendente();

create index if not exists idx_agendamentos_google_sync
  on public.agendamentos (clinica_id, google_sync_status, atualizado_em)
  where google_sync_status in ('pendente', 'erro');

create index if not exists idx_google_calendar_channel
  on public.google_calendar_connections (channel_id) where ativo = true;
