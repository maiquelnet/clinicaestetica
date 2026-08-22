-- Normaliza os interesses de clientes e os alvos de campanhas sem remover o
-- array legado de clientes. Todas as operacoes de escrita passam a manter as
-- duas representacoes dentro da mesma transacao.

alter table public.clientes
  add constraint clientes_id_clinica_unique unique (id, clinica_id);

alter table public.servicos
  add constraint servicos_id_clinica_unique unique (id, clinica_id);

alter table public.campanhas
  add constraint campanhas_id_clinica_unique unique (id, clinica_id);

create table public.clientes_servicos_interesse (
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid not null,
  servico_id uuid not null,
  origem text not null default 'painel',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, servico_id),
  constraint clientes_servicos_interesse_origem_check
    check (origem in ('cadastro_publico', 'painel', 'migracao')),
  constraint clientes_servicos_interesse_cliente_clinica_fkey
    foreign key (cliente_id, clinica_id)
    references public.clientes(id, clinica_id) on delete cascade,
  constraint clientes_servicos_interesse_servico_clinica_fkey
    foreign key (servico_id, clinica_id)
    references public.servicos(id, clinica_id) on delete restrict
);

create index clientes_servicos_interesse_clinica_servico_idx
  on public.clientes_servicos_interesse (clinica_id, servico_id, cliente_id);

create table public.campanhas_servicos_alvo (
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  campanha_id uuid not null,
  servico_id uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (campanha_id, servico_id),
  constraint campanhas_servicos_alvo_campanha_clinica_fkey
    foreign key (campanha_id, clinica_id)
    references public.campanhas(id, clinica_id) on delete cascade,
  constraint campanhas_servicos_alvo_servico_clinica_fkey
    foreign key (servico_id, clinica_id)
    references public.servicos(id, clinica_id) on delete restrict
);

create index campanhas_servicos_alvo_clinica_servico_idx
  on public.campanhas_servicos_alvo (clinica_id, servico_id, campanha_id);

alter table public.clientes_servicos_interesse enable row level security;
alter table public.campanhas_servicos_alvo enable row level security;

create policy clientes_servicos_interesse_clinica_access
  on public.clientes_servicos_interesse
  for all
  to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));

create policy campanhas_servicos_alvo_clinica_access
  on public.campanhas_servicos_alvo
  for all
  to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));

revoke all on table public.clientes_servicos_interesse from public, anon;
revoke all on table public.campanhas_servicos_alvo from public, anon;
grant select, insert, update, delete on table public.clientes_servicos_interesse to authenticated;
grant select, insert, update, delete on table public.campanhas_servicos_alvo to authenticated;

insert into public.clientes_servicos_interesse (
  clinica_id,
  cliente_id,
  servico_id,
  origem
)
select
  clientes.clinica_id,
  clientes.id,
  interesse.servico_id,
  'migracao'
from public.clientes
cross join lateral unnest(clientes.servicos_interesse) as interesse(servico_id)
join public.servicos
  on servicos.id = interesse.servico_id
 and servicos.clinica_id = clientes.clinica_id
on conflict (cliente_id, servico_id) do nothing;

create or replace function private.substituir_interesses_cliente(
  p_cliente_id uuid,
  p_clinica_id uuid,
  p_servicos_interesse uuid[],
  p_origem text,
  p_exigir_servicos_ativos boolean default false
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_servicos uuid[];
  v_quantidade_valida integer;
begin
  select coalesce(array_agg(distinct item order by item), '{}'::uuid[])
    into v_servicos
  from unnest(coalesce(p_servicos_interesse, '{}'::uuid[])) as item
  where item is not null;

  select count(*)
    into v_quantidade_valida
  from public.servicos
  where servicos.clinica_id = p_clinica_id
    and servicos.id = any(v_servicos)
    and (
      not p_exigir_servicos_ativos
      or (servicos.ativo = true and servicos.arquivado_em is null)
    );

  if v_quantidade_valida <> cardinality(v_servicos) then
    raise exception 'Um ou mais servicos nao pertencem a clinica ou nao estao disponiveis.'
      using errcode = '22023';
  end if;

  delete from public.clientes_servicos_interesse
  where cliente_id = p_cliente_id
    and clinica_id = p_clinica_id;

  insert into public.clientes_servicos_interesse (
    clinica_id,
    cliente_id,
    servico_id,
    origem,
    atualizado_em
  )
  select p_clinica_id, p_cliente_id, servico_id, p_origem, now()
  from unnest(v_servicos) as servico_id;

  update public.clientes
  set servicos_interesse = v_servicos,
      atualizado_em = now()
  where id = p_cliente_id
    and clinica_id = p_clinica_id;
end;
$$;

revoke all on function private.substituir_interesses_cliente(uuid, uuid, uuid[], text, boolean)
  from public, anon, authenticated;
grant execute on function private.substituir_interesses_cliente(uuid, uuid, uuid[], text, boolean)
  to authenticated;

create or replace function public.register_public_client_signup(
  p_clinica_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_data_nascimento date,
  p_servicos_interesse uuid[] default '{}'::uuid[]
)
returns table (cliente_id uuid, cadastro_atualizado boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_cliente_id uuid;
  v_telefone text;
  v_atualizado boolean := false;
begin
  if not exists (
    select 1
    from public.clinicas
    where id = p_clinica_id
      and ativo = true
      and arquivado_em is null
  ) then
    raise exception 'Clinica indisponivel.' using errcode = '22023';
  end if;

  if nullif(btrim(p_nome), '') is null or length(btrim(p_nome)) < 2 then
    raise exception 'Informe o nome completo.' using errcode = '22023';
  end if;

  v_telefone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if length(v_telefone) not between 10 and 13 then
    raise exception 'Informe um telefone valido.' using errcode = '22023';
  end if;

  -- Serializa recadastros simultaneos do mesmo telefone sem exigir uma nova
  -- restricao unica sobre os dados legados, que hoje contem duplicidades.
  perform pg_advisory_xact_lock(hashtextextended(p_clinica_id::text || ':' || v_telefone, 0));

  select clientes.id
    into v_cliente_id
  from public.clientes
  where clientes.clinica_id = p_clinica_id
    and regexp_replace(clientes.telefone, '\D', '', 'g') = v_telefone
    and clientes.arquivado_em is null
  order by clientes.atualizado_em desc, clientes.criado_em desc
  limit 1
  for update;

  if v_cliente_id is null then
    insert into public.clientes (
      clinica_id,
      nome,
      telefone,
      email,
      data_nascimento,
      servicos_interesse,
      cpf,
      genero,
      observacoes,
      intervalo_retorno_dias,
      parceira,
      aceita_marketing,
      ativo,
      atualizado_em
    )
    values (
      p_clinica_id,
      btrim(p_nome),
      v_telefone,
      nullif(btrim(p_email), ''),
      p_data_nascimento,
      '{}'::uuid[],
      null,
      null,
      null,
      null,
      false,
      false,
      true,
      now()
    )
    returning id into v_cliente_id;
  else
    v_atualizado := true;
    update public.clientes
    set nome = btrim(p_nome),
        telefone = v_telefone,
        email = nullif(btrim(p_email), ''),
        data_nascimento = p_data_nascimento,
        ativo = true,
        atualizado_em = now()
    where id = v_cliente_id
      and clinica_id = p_clinica_id;
  end if;

  perform private.substituir_interesses_cliente(
    v_cliente_id,
    p_clinica_id,
    p_servicos_interesse,
    'cadastro_publico',
    true
  );

  return query select v_cliente_id, v_atualizado;
end;
$$;

revoke all on function public.register_public_client_signup(uuid, text, text, text, date, uuid[])
  from public, anon, authenticated;
grant execute on function public.register_public_client_signup(uuid, text, text, text, date, uuid[])
  to anon, authenticated;

create or replace function public.salvar_cliente_com_interesses(
  p_cliente_id uuid,
  p_clinica_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_data_nascimento date,
  p_cpf text,
  p_genero text,
  p_observacoes text,
  p_intervalo_retorno_dias integer,
  p_parceira boolean,
  p_aceita_marketing boolean,
  p_whatsapp_opt_in_status text,
  p_whatsapp_opt_in_em timestamptz,
  p_whatsapp_opt_in_origem text,
  p_whatsapp_opt_in_versao text,
  p_whatsapp_opt_out_em timestamptz,
  p_ativo boolean,
  p_servicos_interesse uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_cliente_id uuid;
  v_telefone text;
begin
  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso negado para a clinica informada.' using errcode = '42501';
  end if;

  if nullif(btrim(p_nome), '') is null or length(btrim(p_nome)) < 2 then
    raise exception 'Informe o nome.' using errcode = '22023';
  end if;

  v_telefone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if length(v_telefone) not between 10 and 13 then
    raise exception 'Informe um telefone valido.' using errcode = '22023';
  end if;

  if p_whatsapp_opt_in_status not in ('pendente', 'aceito', 'recusado', 'revogado') then
    raise exception 'Status de consentimento do WhatsApp invalido.' using errcode = '22023';
  end if;

  if p_cliente_id is null then
    insert into public.clientes (
      clinica_id, nome, telefone, email, data_nascimento, cpf, genero,
      observacoes, intervalo_retorno_dias, parceira, aceita_marketing,
      whatsapp_opt_in_status, whatsapp_opt_in_em, whatsapp_opt_in_origem,
      whatsapp_opt_in_versao, whatsapp_opt_out_em, ativo,
      servicos_interesse, atualizado_em
    ) values (
      p_clinica_id, btrim(p_nome), v_telefone, nullif(btrim(p_email), ''),
      p_data_nascimento, nullif(btrim(p_cpf), ''), nullif(btrim(p_genero), ''),
      nullif(btrim(p_observacoes), ''), p_intervalo_retorno_dias,
      p_parceira, p_aceita_marketing, p_whatsapp_opt_in_status,
      p_whatsapp_opt_in_em, p_whatsapp_opt_in_origem,
      p_whatsapp_opt_in_versao, p_whatsapp_opt_out_em, p_ativo,
      '{}'::uuid[], now()
    ) returning id into v_cliente_id;
  else
    update public.clientes
    set nome = btrim(p_nome),
        telefone = v_telefone,
        email = nullif(btrim(p_email), ''),
        data_nascimento = p_data_nascimento,
        cpf = nullif(btrim(p_cpf), ''),
        genero = nullif(btrim(p_genero), ''),
        observacoes = nullif(btrim(p_observacoes), ''),
        intervalo_retorno_dias = p_intervalo_retorno_dias,
        parceira = p_parceira,
        aceita_marketing = p_aceita_marketing,
        whatsapp_opt_in_status = p_whatsapp_opt_in_status,
        whatsapp_opt_in_em = p_whatsapp_opt_in_em,
        whatsapp_opt_in_origem = p_whatsapp_opt_in_origem,
        whatsapp_opt_in_versao = p_whatsapp_opt_in_versao,
        whatsapp_opt_out_em = p_whatsapp_opt_out_em,
        ativo = p_ativo,
        atualizado_em = now()
    where id = p_cliente_id
      and clinica_id = p_clinica_id
    returning id into v_cliente_id;

    if v_cliente_id is null then
      raise exception 'Cliente nao encontrado.' using errcode = 'P0002';
    end if;
  end if;

  perform private.substituir_interesses_cliente(
    v_cliente_id,
    p_clinica_id,
    p_servicos_interesse,
    'painel',
    false
  );

  return v_cliente_id;
end;
$$;

revoke all on function public.salvar_cliente_com_interesses(
  uuid, uuid, text, text, text, date, text, text, text, integer, boolean,
  boolean, text, timestamptz, text, text, timestamptz, boolean, uuid[]
) from public, anon, authenticated;
grant execute on function public.salvar_cliente_com_interesses(
  uuid, uuid, text, text, text, date, text, text, text, integer, boolean,
  boolean, text, timestamptz, text, text, timestamptz, boolean, uuid[]
) to authenticated;

alter table public.campanhas drop constraint if exists campanhas_publico_check;
alter table public.campanhas
  add constraint campanhas_publico_check
  check (publico in ('todos', 'marketing', 'parceiras', 'interesses'));

drop function if exists public.salvar_campanha_com_destinatarios(
  uuid, uuid, uuid, text, text, text, text, uuid
);

create function public.salvar_campanha_com_destinatarios(
  p_campanha_id uuid,
  p_clinica_id uuid,
  p_modelo_mensagem_id uuid,
  p_titulo text,
  p_mensagem text,
  p_publico text,
  p_status text,
  p_criado_por uuid,
  p_servicos_alvo uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_campanha_id uuid;
  v_servicos_alvo uuid[];
  v_quantidade_valida integer;
begin
  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso negado para a clinica informada.' using errcode = '42501';
  end if;

  if nullif(btrim(p_titulo), '') is null or nullif(btrim(p_mensagem), '') is null then
    raise exception 'Informe titulo e mensagem.' using errcode = '22023';
  end if;

  if p_publico not in ('todos', 'marketing', 'parceiras', 'interesses') then
    raise exception 'Publico da campanha invalido.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct item order by item), '{}'::uuid[])
    into v_servicos_alvo
  from unnest(coalesce(p_servicos_alvo, '{}'::uuid[])) as item
  where item is not null;

  if p_publico = 'interesses' and cardinality(v_servicos_alvo) = 0 then
    raise exception 'Selecione pelo menos um servico de interesse.' using errcode = '22023';
  end if;

  select count(*)
    into v_quantidade_valida
  from public.servicos
  where servicos.clinica_id = p_clinica_id
    and servicos.id = any(v_servicos_alvo)
    and servicos.ativo = true
    and servicos.arquivado_em is null;

  if p_publico = 'interesses' and v_quantidade_valida <> cardinality(v_servicos_alvo) then
    raise exception 'Um ou mais servicos alvo nao estao disponiveis.' using errcode = '22023';
  end if;

  if p_publico <> 'interesses' then
    v_servicos_alvo := '{}'::uuid[];
  end if;

  if p_campanha_id is null then
    insert into public.campanhas (
      clinica_id, modelo_mensagem_id, titulo, mensagem, publico, status, criado_por
    ) values (
      p_clinica_id, p_modelo_mensagem_id, btrim(p_titulo), btrim(p_mensagem),
      p_publico, p_status, p_criado_por
    ) returning id into v_campanha_id;
  else
    update public.campanhas
    set modelo_mensagem_id = p_modelo_mensagem_id,
        titulo = btrim(p_titulo),
        mensagem = btrim(p_mensagem),
        publico = p_publico,
        status = p_status,
        atualizado_em = now()
    where id = p_campanha_id
      and clinica_id = p_clinica_id
    returning id into v_campanha_id;

    if v_campanha_id is null then
      raise exception 'Campanha nao encontrada.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.campanhas_servicos_alvo
  where campanha_id = v_campanha_id
    and clinica_id = p_clinica_id;

  insert into public.campanhas_servicos_alvo (
    clinica_id, campanha_id, servico_id, atualizado_em
  )
  select p_clinica_id, v_campanha_id, servico_id, now()
  from unnest(v_servicos_alvo) as servico_id;

  -- Uma edicao refaz apenas a fila ainda pendente. Envios e falhas anteriores
  -- continuam ligados a campanha como historico imutavel.
  delete from public.destinatarios_campanhas
  where campanha_id = v_campanha_id
    and clinica_id = p_clinica_id
    and status = 'pendente';

  insert into public.destinatarios_campanhas (
    clinica_id, campanha_id, cliente_id, texto, status, atualizado_em
  )
  select
    p_clinica_id,
    v_campanha_id,
    clientes.id,
    replace(btrim(p_mensagem), '{nome}', clientes.nome),
    'pendente',
    now()
  from public.clientes
  where clientes.clinica_id = p_clinica_id
    and clientes.ativo = true
    and clientes.arquivado_em is null
    and (
      p_publico = 'todos'
      or (p_publico = 'parceiras' and clientes.parceira = true)
      or (p_publico = 'marketing' and clientes.aceita_marketing = true)
      or (
        p_publico = 'interesses'
        and exists (
          select 1
          from public.clientes_servicos_interesse
          where clientes_servicos_interesse.cliente_id = clientes.id
            and clientes_servicos_interesse.clinica_id = p_clinica_id
            and clientes_servicos_interesse.servico_id = any(v_servicos_alvo)
        )
      )
    )
  on conflict (campanha_id, cliente_id) do update
  set texto = excluded.texto,
      atualizado_em = now()
  where destinatarios_campanhas.status = 'pendente';

  return v_campanha_id;
end;
$$;

revoke all on function public.salvar_campanha_com_destinatarios(
  uuid, uuid, uuid, text, text, text, text, uuid, uuid[]
) from public, anon, authenticated;
grant execute on function public.salvar_campanha_com_destinatarios(
  uuid, uuid, uuid, text, text, text, text, uuid, uuid[]
) to authenticated;

create or replace function public.prever_publico_campanha(
  p_clinica_id uuid,
  p_publico text,
  p_servicos_alvo uuid[] default '{}'::uuid[]
)
returns bigint
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_servicos_alvo uuid[];
  v_quantidade_valida integer;
  v_total bigint;
begin
  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso negado para a clinica informada.' using errcode = '42501';
  end if;

  if p_publico not in ('todos', 'marketing', 'parceiras', 'interesses') then
    raise exception 'Publico da campanha invalido.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct item order by item), '{}'::uuid[])
    into v_servicos_alvo
  from unnest(coalesce(p_servicos_alvo, '{}'::uuid[])) as item
  where item is not null;

  if p_publico = 'interesses' and cardinality(v_servicos_alvo) = 0 then
    return 0;
  end if;

  select count(*)
    into v_quantidade_valida
  from public.servicos
  where servicos.clinica_id = p_clinica_id
    and servicos.id = any(v_servicos_alvo)
    and servicos.ativo = true
    and servicos.arquivado_em is null;

  if p_publico = 'interesses' and v_quantidade_valida <> cardinality(v_servicos_alvo) then
    raise exception 'Um ou mais servicos alvo nao estao disponiveis.' using errcode = '22023';
  end if;

  select count(*)
    into v_total
  from public.clientes
  where clientes.clinica_id = p_clinica_id
    and clientes.ativo = true
    and clientes.arquivado_em is null
    and (
      p_publico = 'todos'
      or (p_publico = 'parceiras' and clientes.parceira = true)
      or (p_publico = 'marketing' and clientes.aceita_marketing = true)
      or (
        p_publico = 'interesses'
        and exists (
          select 1
          from public.clientes_servicos_interesse
          where clientes_servicos_interesse.cliente_id = clientes.id
            and clientes_servicos_interesse.clinica_id = p_clinica_id
            and clientes_servicos_interesse.servico_id = any(v_servicos_alvo)
        )
      )
    );

  return v_total;
end;
$$;

revoke all on function public.prever_publico_campanha(uuid, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.prever_publico_campanha(uuid, text, uuid[])
  to authenticated;

notify pgrst, 'reload schema';
