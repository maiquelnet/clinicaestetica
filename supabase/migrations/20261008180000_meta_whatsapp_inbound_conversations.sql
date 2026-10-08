-- Recebimento e histórico de mensagens da WhatsApp Cloud API da Meta.
-- As escritas são feitas pelo webhook com service_role; usuários autenticados
-- recebem somente leitura dentro da própria clínica.

create table if not exists public.whatsapp_conversas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  telefone text not null,
  wa_id text,
  nome_contato text,
  cliente_id uuid references public.clientes(id) on delete set null,
  status text not null default 'aberta',
  janela_atendimento_ate timestamptz,
  ultima_mensagem_em timestamptz,
  ultima_mensagem_direcao text,
  ultima_mensagem_tipo text,
  ultima_mensagem_preview text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint whatsapp_conversas_status_check check (status in ('aberta', 'aguardando', 'encerrada')),
  constraint whatsapp_conversas_direcao_check check (ultima_mensagem_direcao is null or ultima_mensagem_direcao in ('entrada', 'saida')),
  constraint whatsapp_conversas_clinica_telefone_unique unique (clinica_id, telefone)
);

create table if not exists public.whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  conversa_id uuid not null references public.whatsapp_conversas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  provider text not null default 'meta',
  provider_message_id text not null,
  direcao text not null default 'entrada',
  tipo text not null,
  texto text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'recebida',
  evento_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  constraint whatsapp_mensagens_direcao_check check (direcao in ('entrada', 'saida')),
  constraint whatsapp_mensagens_provider_id_unique unique (provider, provider_message_id)
);

alter table public.whatsapp_conversas enable row level security;
alter table public.whatsapp_mensagens enable row level security;

revoke all on table public.whatsapp_conversas, public.whatsapp_mensagens from public, anon;
grant select on table public.whatsapp_conversas, public.whatsapp_mensagens to authenticated;

drop policy if exists whatsapp_conversas_clinica_access on public.whatsapp_conversas;
create policy whatsapp_conversas_clinica_access
  on public.whatsapp_conversas
  for select
  to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id));

drop policy if exists whatsapp_mensagens_clinica_access on public.whatsapp_mensagens;
create policy whatsapp_mensagens_clinica_access
  on public.whatsapp_mensagens
  for select
  to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id));

create index if not exists whatsapp_conversas_clinica_atividade_idx
  on public.whatsapp_conversas (clinica_id, ultima_mensagem_em desc nulls last);

create index if not exists whatsapp_mensagens_conversa_evento_idx
  on public.whatsapp_mensagens (conversa_id, evento_em asc);

create index if not exists whatsapp_mensagens_clinica_evento_idx
  on public.whatsapp_mensagens (clinica_id, evento_em desc);

create or replace function public.record_meta_whatsapp_inbound(
  p_event_id text,
  p_clinica_id uuid,
  p_phone_number_id text,
  p_from text,
  p_wa_id text,
  p_contact_name text,
  p_message_id text,
  p_message_type text,
  p_message_text text,
  p_payload jsonb,
  p_event_time timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted_event integer;
  v_inserted_message integer;
  v_phone text := regexp_replace(coalesce(p_from, ''), '\D', '', 'g');
  v_event_time timestamptz := coalesce(p_event_time, now());
  v_cliente_id uuid;
  v_conversa_id uuid;
  v_message_type text := coalesce(nullif(trim(p_message_type), ''), 'unknown');
  v_preview text := left(nullif(trim(coalesce(p_message_text, '')), ''), 500);
begin
  if nullif(trim(coalesce(p_event_id, '')), '') is null then
    raise exception 'Evento Meta sem id.';
  end if;
  if nullif(trim(coalesce(p_message_id, '')), '') is null then
    raise exception 'Mensagem Meta sem WAMID.';
  end if;
  if p_clinica_id is null then
    raise exception 'Clinica do WhatsApp nao informada.';
  end if;
  if length(v_phone) < 8 or length(v_phone) > 15 then
    raise exception 'Telefone de origem invalido.';
  end if;

  insert into public.whatsapp_webhook_events (id, provider, tipo)
  values (p_event_id, 'meta', 'messages.inbound')
  on conflict (id) do nothing;
  get diagnostics v_inserted_event = row_count;

  if v_inserted_event = 0 then
    return jsonb_build_object('received', true, 'duplicate', true, 'stored', false);
  end if;

  select c.id
    into v_cliente_id
    from public.clientes c
   where c.clinica_id = p_clinica_id
     and c.arquivado_em is null
     and regexp_replace(c.telefone, '\D', '', 'g') = v_phone
   order by c.atualizado_em desc, c.criado_em desc
   limit 1
   for update;

  if v_cliente_id is null then
    insert into public.clientes (
      clinica_id, nome, telefone, aceita_marketing, ativo,
      whatsapp_opt_in_status, whatsapp_opt_in_origem, whatsapp_opt_in_versao,
      atualizado_em
    ) values (
      p_clinica_id,
      coalesce(nullif(trim(p_contact_name), ''), v_phone),
      v_phone,
      false,
      true,
      'pendente',
      'whatsapp_inbound_meta',
      'meta-whatsapp-webhook',
      now()
    )
    returning id into v_cliente_id;
  end if;

  insert into public.whatsapp_conversas (
    clinica_id, telefone, wa_id, nome_contato, cliente_id, status,
    janela_atendimento_ate, ultima_mensagem_em, ultima_mensagem_direcao,
    ultima_mensagem_tipo, ultima_mensagem_preview, atualizado_em
  ) values (
    p_clinica_id, v_phone, nullif(trim(p_wa_id), ''), nullif(trim(p_contact_name), ''),
    v_cliente_id, 'aberta', v_event_time + interval '24 hours', v_event_time,
    'entrada', v_message_type, v_preview, now()
  )
  on conflict (clinica_id, telefone) do update set
    wa_id = coalesce(excluded.wa_id, whatsapp_conversas.wa_id),
    nome_contato = coalesce(excluded.nome_contato, whatsapp_conversas.nome_contato),
    cliente_id = coalesce(whatsapp_conversas.cliente_id, excluded.cliente_id),
    status = 'aberta',
    janela_atendimento_ate = excluded.janela_atendimento_ate,
    ultima_mensagem_em = excluded.ultima_mensagem_em,
    ultima_mensagem_direcao = excluded.ultima_mensagem_direcao,
    ultima_mensagem_tipo = excluded.ultima_mensagem_tipo,
    ultima_mensagem_preview = excluded.ultima_mensagem_preview,
    atualizado_em = now()
  returning id into v_conversa_id;

  insert into public.whatsapp_mensagens (
    clinica_id, conversa_id, cliente_id, provider, provider_message_id,
    direcao, tipo, texto, payload, status, evento_em
  ) values (
    p_clinica_id, v_conversa_id, v_cliente_id, 'meta', p_message_id,
    'entrada', v_message_type, nullif(trim(p_message_text), ''),
    coalesce(p_payload, '{}'::jsonb), 'recebida', v_event_time
  )
  on conflict (provider, provider_message_id) do nothing;
  get diagnostics v_inserted_message = row_count;

  return jsonb_build_object(
    'received', true,
    'duplicate', false,
    'stored', v_inserted_message = 1,
    'conversation_id', v_conversa_id,
    'client_id', v_cliente_id,
    'phone', v_phone
  );
end;
$$;

revoke all on function public.record_meta_whatsapp_inbound(text, uuid, text, text, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.record_meta_whatsapp_inbound(text, uuid, text, text, text, text, text, text, text, jsonb, timestamptz) to service_role;

comment on table public.whatsapp_conversas is 'Conversas de entrada da WhatsApp Cloud API, uma por telefone e clínica.';
comment on table public.whatsapp_mensagens is 'Mensagens recebidas da WhatsApp Cloud API, deduplicadas pelo WAMID.';
