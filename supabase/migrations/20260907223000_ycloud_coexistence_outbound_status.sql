-- Fase 6.5: transporte YCloud, separação de identificadores e status de saída.
-- Não remove a configuração Meta legada nem importa histórico de conversas.

alter table public.fila_mensagens
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_status text,
  add column if not exists provider_error_code text,
  add column if not exists provider_updated_at timestamptz;

update public.fila_mensagens
   set provider = case when meta_message_id is not null then 'meta' else 'ycloud' end
 where provider is null;

alter table public.fila_mensagens
  alter column provider set default 'ycloud';

create index if not exists fila_mensagens_provider_message_idx
  on public.fila_mensagens (provider, provider_message_id)
  where provider_message_id is not null;

alter table public.logs_mensagens
  add column if not exists fila_mensagem_id uuid references public.fila_mensagens(id) on delete set null,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists meta_message_id text,
  add column if not exists provider_status text,
  add column if not exists provider_error_code text,
  add column if not exists provider_updated_at timestamptz;

create index if not exists logs_mensagens_fila_mensagem_idx
  on public.logs_mensagens (fila_mensagem_id)
  where fila_mensagem_id is not null;

create index if not exists logs_mensagens_provider_message_idx
  on public.logs_mensagens (provider, provider_message_id)
  where provider_message_id is not null;

create table if not exists public.whatsapp_testes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  destinatario text not null,
  provider text not null default 'ycloud',
  provider_message_id text,
  meta_message_id text,
  provider_status text not null default 'pending',
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists whatsapp_testes_clinica_criado_idx
  on public.whatsapp_testes (clinica_id, criado_em desc);

alter table public.whatsapp_testes enable row level security;

create table if not exists public.whatsapp_webhook_events (
  id text primary key,
  provider text not null default 'ycloud',
  tipo text not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz not null default now()
);

create index if not exists whatsapp_webhook_events_recebido_idx
  on public.whatsapp_webhook_events (recebido_em desc);

alter table public.whatsapp_webhook_events enable row level security;

create or replace function public.record_ycloud_webhook_event(
  p_event_id text,
  p_event_type text,
  p_provider_message_id text default null,
  p_meta_message_id text default null,
  p_external_id text default null,
  p_provider_status text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_event_time timestamptz default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  inserted_event integer;
  queue_id uuid;
  current_status text;
  next_status text := lower(coalesce(p_provider_status, ''));
  should_apply boolean := false;
  test_id uuid;
begin
  if nullif(trim(coalesce(p_event_id, '')), '') is null then
    raise exception 'Evento YCloud sem id.';
  end if;

  insert into public.whatsapp_webhook_events (id, provider, tipo)
  values (p_event_id, 'ycloud', coalesce(p_event_type, 'unknown'))
  on conflict (id) do nothing;
  get diagnostics inserted_event = row_count;

  if inserted_event = 0 then
    return jsonb_build_object('received', true, 'duplicate', true, 'matched', false);
  end if;

  if p_event_type <> 'whatsapp.message.updated' then
    return jsonb_build_object('received', true, 'ignored', true, 'matched', false);
  end if;

  if next_status not in ('accepted', 'sent', 'delivered', 'read', 'failed', 'filtered') then
    return jsonb_build_object('received', true, 'ignored', true, 'matched', false, 'reason', 'status_not_supported');
  end if;

  if nullif(trim(coalesce(p_external_id, '')), '') is not null then
    begin
      queue_id := p_external_id::uuid;
    exception when invalid_text_representation then
      queue_id := null;
    end;
  end if;

  if queue_id is null and nullif(trim(coalesce(p_provider_message_id, '')), '') is not null then
    select id into queue_id
      from public.fila_mensagens
     where provider = 'ycloud'
       and provider_message_id = p_provider_message_id
     order by criado_em desc
     limit 1;
  end if;

  if queue_id is not null then
    select provider_status into current_status
      from public.fila_mensagens
     where id = queue_id
     for update;

    should_apply := current_status is null
      or (next_status = 'read' and current_status <> 'read')
      or (next_status = 'delivered' and current_status not in ('delivered', 'read'))
      or (next_status = 'sent' and current_status in ('accepted', 'pending'))
      or (next_status = 'failed' and current_status in ('accepted', 'sent', 'pending'))
      or (next_status = 'filtered' and current_status in ('accepted', 'pending'));

    if should_apply then
      update public.fila_mensagens
         set provider = 'ycloud',
             provider_message_id = coalesce(p_provider_message_id, provider_message_id),
             meta_message_id = coalesce(p_meta_message_id, meta_message_id),
             provider_status = next_status,
             provider_error_code = coalesce(p_error_code, provider_error_code),
             provider_updated_at = coalesce(p_event_time, now()),
             ultimo_erro = case when next_status = 'failed' then left(coalesce(p_error_message, p_error_code, 'Falha reportada pela YCloud.'), 2000) else ultimo_erro end,
             atualizado_em = now()
       where id = queue_id;

      update public.logs_mensagens
         set provider = 'ycloud',
             provider_message_id = coalesce(p_provider_message_id, provider_message_id),
             meta_message_id = coalesce(p_meta_message_id, meta_message_id),
             provider_status = next_status,
             provider_error_code = coalesce(p_error_code, provider_error_code),
             provider_updated_at = coalesce(p_event_time, now()),
             status = case when next_status = 'failed' then 'erro' else status end,
             observacao = case when next_status = 'failed' then left(coalesce(p_error_message, p_error_code, 'Falha reportada pela YCloud.'), 2000) else observacao end
       where id = (
         select id
           from public.logs_mensagens
          where fila_mensagem_id = queue_id
          order by criado_em desc
          limit 1
       );
    end if;
  end if;

  if nullif(trim(coalesce(p_external_id, '')), '') like 'test:%' then
    begin
      test_id := substring(p_external_id from 6)::uuid;
    exception when invalid_text_representation then
      test_id := null;
    end;
  end if;

  if test_id is null and nullif(trim(coalesce(p_provider_message_id, '')), '') is not null then
    select id into test_id
      from public.whatsapp_testes
     where provider = 'ycloud'
       and provider_message_id = p_provider_message_id
     order by criado_em desc
     limit 1;
  end if;

  if test_id is not null then
    update public.whatsapp_testes
       set provider_message_id = coalesce(p_provider_message_id, provider_message_id),
           meta_message_id = coalesce(p_meta_message_id, meta_message_id),
           provider_status = next_status,
           erro = case when next_status = 'failed' then left(coalesce(p_error_message, p_error_code, 'Falha reportada pela YCloud.'), 2000) else erro end,
           atualizado_em = now()
     where id = test_id;
  end if;

  return jsonb_build_object('received', true, 'duplicate', false, 'matched', queue_id is not null or test_id is not null, 'applied', should_apply);
end;
$$;

revoke all on function public.record_ycloud_webhook_event(text, text, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_ycloud_webhook_event(text, text, text, text, text, text, text, text, timestamptz) to service_role;

comment on column public.fila_mensagens.provider_message_id is 'ID interno da mensagem no provedor, distinto do WAMID em meta_message_id.';
comment on column public.fila_mensagens.meta_message_id is 'WAMID retornado pelos webhooks da plataforma WhatsApp; não recebe o ID interno YCloud.';
comment on table public.whatsapp_webhook_events is 'Idempotência de eventos YCloud; não armazena conteúdo ou histórico de conversas.';
