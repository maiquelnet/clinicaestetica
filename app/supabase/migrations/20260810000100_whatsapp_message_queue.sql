create table if not exists public.fila_mensagens (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  modelo_mensagem_id uuid not null references public.modelos_mensagens(id) on delete cascade,
  canal text not null default 'whatsapp_business',
  tipo text not null default 'agendamento',
  ciclo text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'processando', 'enviado', 'erro', 'cancelado')),
  tentativas integer not null default 0 check (tentativas >= 0),
  disponivel_em timestamptz not null default now(),
  processando_em timestamptz,
  enviado_em timestamptz,
  ultimo_erro text,
  meta_message_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (clinica_id, canal, ciclo)
);

create index if not exists fila_mensagens_processamento_idx
  on public.fila_mensagens (clinica_id, status, disponivel_em, criado_em);

create index if not exists fila_mensagens_agendamento_idx
  on public.fila_mensagens (agendamento_id, modelo_mensagem_id);

alter table public.fila_mensagens enable row level security;

create or replace function public.claim_whatsapp_message_queue(
  p_clinica_id uuid,
  p_limit integer default 25
)
returns setof public.fila_mensagens
language plpgsql
set search_path = public
as $$
begin
  return query
  with selecionadas as (
    select id
    from public.fila_mensagens
    where clinica_id = p_clinica_id
      and disponivel_em <= now()
      and (
        status = 'pendente'
        or (status = 'erro' and tentativas < 5)
      )
    order by disponivel_em, criado_em
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  update public.fila_mensagens fila
     set status = 'processando',
         tentativas = fila.tentativas + 1,
         processando_em = now(),
         atualizado_em = now()
    from selecionadas
   where fila.id = selecionadas.id
  returning fila.*;
end;
$$;

create or replace function public.complete_whatsapp_message_queue(
  p_id uuid,
  p_meta_message_id text default null
)
returns void
language sql
set search_path = public
as $$
  update public.fila_mensagens
     set status = 'enviado',
         enviado_em = now(),
         processando_em = null,
         meta_message_id = p_meta_message_id,
         atualizado_em = now()
   where id = p_id and status = 'processando';
$$;

create or replace function public.fail_whatsapp_message_queue(
  p_id uuid,
  p_error text,
  p_retry_seconds integer default 300
)
returns void
language sql
set search_path = public
as $$
  update public.fila_mensagens
     set status = 'erro',
         disponivel_em = now() + make_interval(secs => least(greatest(coalesce(p_retry_seconds, 300), 30), 86400)),
         processando_em = null,
         ultimo_erro = left(coalesce(p_error, 'Falha desconhecida.'), 2000),
         atualizado_em = now()
   where id = p_id and status = 'processando';
$$;
