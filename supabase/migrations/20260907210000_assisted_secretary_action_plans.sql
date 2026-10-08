-- Fase 6: Secretaria Assistida V1.
-- Persiste somente planos revisaveis e atividades auditaveis. Nao cria
-- mensagens, reservas, agendamentos, bloqueios ou execucao automatica.

create table if not exists public.secretaria_planos_acao (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id),
  profissional_id uuid not null references public.perfis(id),
  data_alvo date not null,
  status text not null default 'RASCUNHO'
    check (status in ('RASCUNHO', 'APROVADO', 'CANCELADO')),
  capacidade_minutos_snapshot integer not null check (capacidade_minutos_snapshot >= 0),
  ocupado_minutos_snapshot integer not null check (ocupado_minutos_snapshot >= 0),
  livre_minutos_snapshot integer not null check (livre_minutos_snapshot >= 0),
  ocupacao_percentual_snapshot numeric,
  classificacao_snapshot text not null,
  fonte_disponibilidade_snapshot text not null
    check (fonte_disponibilidade_snapshot in ('semanal', 'excecao')),
  total_oportunidades_snapshot integer not null default 0
    check (total_oportunidades_snapshot >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  aprovado_em timestamptz,
  aprovado_por uuid references public.perfis(id),
  cancelado_em timestamptz,
  cancelado_por uuid references public.perfis(id),
  criado_por uuid not null references public.perfis(id)
);

create table if not exists public.secretaria_plano_itens (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.secretaria_planos_acao(id),
  clinica_id uuid not null references public.clinicas(id),
  profissional_id uuid not null references public.perfis(id),
  cliente_id uuid not null references public.clientes(id),
  servico_id uuid not null references public.servicos(id),
  origem text not null check (origem in ('lista_espera', 'retorno')),
  oportunidade_id_snapshot text not null,
  lista_espera_id uuid references public.lista_espera(id),
  motivo text not null,
  duracao_minutos integer not null check (duracao_minutos > 0),
  retorno_devido_em date,
  atraso_retorno_dias integer,
  janelas_compativeis jsonb not null default '[]'::jsonb,
  ordem integer not null check (ordem > 0),
  status text not null default 'SELECIONADO'
    check (status in ('SELECIONADO', 'REMOVIDO', 'INVALIDO')),
  motivo_invalidacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (plano_id, oportunidade_id_snapshot)
);

create table if not exists public.secretaria_atividades (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id),
  profissional_id uuid not null references public.perfis(id),
  plano_id uuid not null references public.secretaria_planos_acao(id),
  cliente_id uuid references public.clientes(id),
  tipo text not null check (tipo in (
    'PLANO_CRIADO',
    'PLANO_ATUALIZADO',
    'PLANO_APROVADO',
    'PLANO_CANCELADO',
    'CANDIDATO_REMOVIDO',
    'CANDIDATO_INVALIDADO'
  )),
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  criado_por uuid not null references public.perfis(id)
);

create unique index if not exists secretaria_planos_acao_ativos_uidx
  on public.secretaria_planos_acao (clinica_id, profissional_id, data_alvo)
  where status in ('RASCUNHO', 'APROVADO');

create unique index if not exists secretaria_plano_itens_selecionados_cliente_uidx
  on public.secretaria_plano_itens (plano_id, cliente_id)
  where status = 'SELECIONADO';

create index if not exists secretaria_planos_acao_contexto_idx
  on public.secretaria_planos_acao (clinica_id, profissional_id, data_alvo, status);

create index if not exists secretaria_plano_itens_plano_idx
  on public.secretaria_plano_itens (plano_id, status, ordem);

create index if not exists secretaria_atividades_plano_idx
  on public.secretaria_atividades (clinica_id, profissional_id, plano_id, criado_em desc);

alter table public.secretaria_planos_acao enable row level security;
alter table public.secretaria_plano_itens enable row level security;
alter table public.secretaria_atividades enable row level security;

drop policy if exists secretaria_planos_acao_acesso_clinica on public.secretaria_planos_acao;
create policy secretaria_planos_acao_acesso_clinica
  on public.secretaria_planos_acao
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));

drop policy if exists secretaria_plano_itens_acesso_clinica on public.secretaria_plano_itens;
create policy secretaria_plano_itens_acesso_clinica
  on public.secretaria_plano_itens
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));

drop policy if exists secretaria_atividades_acesso_clinica on public.secretaria_atividades;
create policy secretaria_atividades_acesso_clinica
  on public.secretaria_atividades
  for all to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id))
  with check (private.usuario_tem_acesso_clinica(clinica_id));

revoke all on table public.secretaria_planos_acao, public.secretaria_plano_itens, public.secretaria_atividades from public, anon;
grant select, insert, update on table public.secretaria_planos_acao to authenticated;
grant select, insert, update on table public.secretaria_plano_itens to authenticated;
grant select, insert on table public.secretaria_atividades to authenticated;

create or replace function private.validar_secretaria_contexto(
  p_clinica_id uuid,
  p_profissional_id uuid
)
returns text
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
declare
  v_timezone text;
begin
  if auth.uid() is null then
    raise exception 'Sessao obrigatoria.';
  end if;

  if p_clinica_id is null or p_profissional_id is null then
    raise exception 'Clinica e profissional sao obrigatorios.';
  end if;

  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso negado para a clinica informada.';
  end if;

  if not exists (
    select 1
    from public.usuarios_clinicas uc
    where uc.clinica_id = p_clinica_id
      and uc.perfil_id = p_profissional_id
      and uc.ativo = true
  ) then
    raise exception 'O profissional nao pertence a esta clinica.';
  end if;

  select c.fuso_horario
    into v_timezone
  from public.clinicas c
  where c.id = p_clinica_id
    and c.ativo = true
    and c.arquivado_em is null;

  if v_timezone is null or btrim(v_timezone) = '' then
    raise exception 'A clinica nao possui fuso horario configurado.';
  end if;

  return v_timezone;
end;
$function$;

create or replace function private.inserir_secretaria_plano_item(
  p_plano_id uuid,
  p_oportunidade jsonb,
  p_ordem integer
)
returns uuid
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
declare
  v_plan public.secretaria_planos_acao%rowtype;
  v_item_id uuid;
  v_origem text;
begin
  select *
    into v_plan
  from public.secretaria_planos_acao
  where id = p_plano_id;

  if v_plan.id is null then
    raise exception 'Plano nao encontrado.';
  end if;

  v_origem := p_oportunidade->>'origem';
  if v_origem not in ('lista_espera', 'retorno') then
    raise exception 'Oportunidade invalida.';
  end if;

  if p_oportunidade->>'cliente_id' is null or p_oportunidade->>'servico_id' is null or p_oportunidade->>'id' is null then
    raise exception 'Oportunidade sem cliente, servico ou identificador.';
  end if;

  if not exists (
    select 1
    from public.clientes c
    where c.id = (p_oportunidade->>'cliente_id')::uuid
      and c.clinica_id = v_plan.clinica_id
      and c.ativo = true
      and c.arquivado_em is null
  ) then
    raise exception 'Cliente da oportunidade nao pertence a clinica ativa.';
  end if;

  if not exists (
    select 1
    from public.servicos s
    where s.id = (p_oportunidade->>'servico_id')::uuid
      and s.clinica_id = v_plan.clinica_id
      and s.ativo = true
      and s.arquivado_em is null
  ) then
    raise exception 'Servico da oportunidade nao pertence a clinica ativa.';
  end if;

  if v_origem = 'lista_espera' and not exists (
    select 1
    from public.lista_espera l
    where l.id = (p_oportunidade->>'id')::uuid
      and l.clinica_id = v_plan.clinica_id
      and l.cliente_id = (p_oportunidade->>'cliente_id')::uuid
      and l.servico_id = (p_oportunidade->>'servico_id')::uuid
      and l.status = 'em_espera'
  ) then
    raise exception 'Entrada da lista de espera nao esta mais ativa.';
  end if;

  insert into public.secretaria_plano_itens (
    plano_id,
    clinica_id,
    profissional_id,
    cliente_id,
    servico_id,
    origem,
    oportunidade_id_snapshot,
    lista_espera_id,
    motivo,
    duracao_minutos,
    retorno_devido_em,
    atraso_retorno_dias,
    janelas_compativeis,
    ordem
  )
  values (
    v_plan.id,
    v_plan.clinica_id,
    v_plan.profissional_id,
    (p_oportunidade->>'cliente_id')::uuid,
    (p_oportunidade->>'servico_id')::uuid,
    v_origem,
    p_oportunidade->>'id',
    case when v_origem = 'lista_espera' then (p_oportunidade->>'id')::uuid else null end,
    coalesce(nullif(p_oportunidade->>'motivo', ''), 'Oportunidade comercial encontrada.'),
    (p_oportunidade->>'duracao_minutos')::integer,
    nullif(p_oportunidade->>'retorno_devido_em', '')::date,
    nullif(p_oportunidade->>'atraso_retorno_dias', '')::integer,
    coalesce(p_oportunidade->'janelas_compativeis', '[]'::jsonb),
    p_ordem
  )
  returning id into v_item_id;

  return v_item_id;
end;
$function$;

create or replace function private.secretaria_max_candidatos_plano()
returns integer
language sql
immutable
set search_path = public, private, pg_temp
as $function$
  select 5;
$function$;

create or replace function private.secretaria_plano_json(p_plano_id uuid)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select jsonb_build_object(
    'id', p.id,
    'clinica_id', p.clinica_id,
    'profissional_id', p.profissional_id,
    'data_alvo', p.data_alvo,
    'status', p.status,
    'capacidade_minutos_snapshot', p.capacidade_minutos_snapshot,
    'ocupado_minutos_snapshot', p.ocupado_minutos_snapshot,
    'livre_minutos_snapshot', p.livre_minutos_snapshot,
    'ocupacao_percentual_snapshot', p.ocupacao_percentual_snapshot,
    'classificacao_snapshot', p.classificacao_snapshot,
    'fonte_disponibilidade_snapshot', p.fonte_disponibilidade_snapshot,
    'total_oportunidades_snapshot', p.total_oportunidades_snapshot,
    'criado_em', p.criado_em,
    'atualizado_em', p.atualizado_em,
    'aprovado_em', p.aprovado_em,
    'aprovado_por', p.aprovado_por,
    'cancelado_em', p.cancelado_em,
    'cancelado_por', p.cancelado_por,
    'criado_por', p.criado_por,
    'itens_selecionados', (
      select count(*)::integer
      from public.secretaria_plano_itens i
      where i.plano_id = p.id
        and i.status = 'SELECIONADO'
    ),
    'itens', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'plano_id', i.plano_id,
          'cliente_id', i.cliente_id,
          'cliente_nome', c.nome,
          'telefone', c.telefone,
          'whatsapp_opt_in_status', c.whatsapp_opt_in_status,
          'aceita_marketing', c.aceita_marketing,
          'servico_id', i.servico_id,
          'servico_nome', s.nome,
          'origem', i.origem,
          'oportunidade_id_snapshot', i.oportunidade_id_snapshot,
          'lista_espera_id', i.lista_espera_id,
          'motivo', i.motivo,
          'duracao_minutos', i.duracao_minutos,
          'retorno_devido_em', i.retorno_devido_em,
          'atraso_retorno_dias', i.atraso_retorno_dias,
          'janelas_compativeis', i.janelas_compativeis,
          'ordem', i.ordem,
          'status', i.status,
          'motivo_invalidacao', i.motivo_invalidacao,
          'criado_em', i.criado_em,
          'atualizado_em', i.atualizado_em
        )
        order by i.ordem, i.criado_em
      )
      from public.secretaria_plano_itens i
      join public.clientes c on c.id = i.cliente_id
      join public.servicos s on s.id = i.servico_id
      where i.plano_id = p.id
    ), '[]'::jsonb)
  )
  from public.secretaria_planos_acao p
  where p.id = p_plano_id;
$function$;

create or replace function public.listar_secretaria_planos_acao_periodo(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
begin
  perform private.validar_secretaria_contexto(p_clinica_id, p_profissional_id);

  if p_data_inicio is null or p_data_fim is null or p_data_fim < p_data_inicio then
    raise exception 'Informe um periodo de datas valido.';
  end if;

  if p_data_fim - p_data_inicio > 62 then
    raise exception 'O periodo maximo para esta consulta e de 63 dias.';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'data_alvo', p.data_alvo,
        'status', p.status,
        'capacidade_minutos_snapshot', p.capacidade_minutos_snapshot,
        'ocupado_minutos_snapshot', p.ocupado_minutos_snapshot,
        'livre_minutos_snapshot', p.livre_minutos_snapshot,
        'ocupacao_percentual_snapshot', p.ocupacao_percentual_snapshot,
        'classificacao_snapshot', p.classificacao_snapshot,
        'total_oportunidades_snapshot', p.total_oportunidades_snapshot,
        'itens_selecionados', (
          select count(*)::integer
          from public.secretaria_plano_itens i
          where i.plano_id = p.id
            and i.status = 'SELECIONADO'
        ),
        'atualizado_em', p.atualizado_em
      )
      order by p.data_alvo
    )
    from public.secretaria_planos_acao p
    where p.clinica_id = p_clinica_id
      and p.profissional_id = p_profissional_id
      and p.data_alvo between p_data_inicio and p_data_fim
      and p.status in ('RASCUNHO', 'APROVADO')
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.buscar_secretaria_plano_acao(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_plano_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
declare
  v_plan public.secretaria_planos_acao%rowtype;
begin
  perform private.validar_secretaria_contexto(p_clinica_id, p_profissional_id);

  select *
    into v_plan
  from public.secretaria_planos_acao p
  where p.id = p_plano_id
    and p.clinica_id = p_clinica_id
    and p.profissional_id = p_profissional_id;

  if v_plan.id is null then
    raise exception 'Plano nao encontrado.';
  end if;

  return private.secretaria_plano_json(v_plan.id);
end;
$function$;

create or replace function public.preparar_secretaria_plano(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_data_alvo date
)
returns uuid
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
declare
  v_timezone text;
  v_today date;
  v_existing_id uuid;
  v_plan_id uuid;
  v_capacity record;
  v_radar record;
  v_day record;
  v_candidate jsonb;
  v_selected_count integer := 0;
begin
  v_timezone := private.validar_secretaria_contexto(p_clinica_id, p_profissional_id);
  v_today := (now() at time zone v_timezone)::date;

  if p_data_alvo is null or p_data_alvo < v_today + 1 or p_data_alvo > v_today + 7 then
    raise exception 'Escolha um dia dos proximos sete dias.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_clinica_id::text || ':' || p_profissional_id::text || ':' || p_data_alvo::text,
    0
  ));

  select c.* into v_capacity
  from public.calcular_capacidade_comercial_periodo(
    p_clinica_id, p_profissional_id, p_data_alvo, p_data_alvo
  ) c
  where c.data = p_data_alvo;

  select r.* into v_radar
  from public.calcular_radar_ocupacao_periodo(
    p_clinica_id, p_profissional_id, p_data_alvo, p_data_alvo
  ) r
  where r.data = p_data_alvo;

  select o.* into v_day
  from public.calcular_oportunidades_comerciais_periodo(
    p_clinica_id, p_profissional_id, p_data_alvo, p_data_alvo
  ) o
  where o.data = p_data_alvo;

  select p.id
    into v_existing_id
  from public.secretaria_planos_acao p
  where p.clinica_id = p_clinica_id
    and p.profissional_id = p_profissional_id
    and p.data_alvo = p_data_alvo
    and p.status in ('RASCUNHO', 'APROVADO')
  order by case when p.status = 'RASCUNHO' then 1 else 2 end
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if v_capacity.data is null or v_radar.data is null or v_day.data is null then
    raise exception 'Nao foi possivel recalcular a agenda para este dia.';
  end if;

  if not v_day.merece_atencao then
    raise exception 'A agenda mudou e este dia nao precisa mais de atencao.';
  end if;

  if coalesce(v_day.total_oportunidades, 0) = 0 then
    raise exception 'Ainda nao encontrei clientes compativeis para este dia.';
  end if;

  insert into public.secretaria_planos_acao (
    clinica_id,
    profissional_id,
    data_alvo,
    capacidade_minutos_snapshot,
    ocupado_minutos_snapshot,
    livre_minutos_snapshot,
    ocupacao_percentual_snapshot,
    classificacao_snapshot,
    fonte_disponibilidade_snapshot,
    total_oportunidades_snapshot,
    criado_por
  )
  values (
    p_clinica_id,
    p_profissional_id,
    p_data_alvo,
    v_day.capacidade_minutos,
    v_day.ocupado_minutos,
    v_day.livre_minutos,
    v_day.ocupacao_percentual,
    v_day.classificacao,
    v_day.fonte_disponibilidade,
    v_day.total_oportunidades,
    auth.uid()
  )
  returning id into v_plan_id;

  for v_candidate in
    select ranked.candidate
    from (
      select elements.candidate,
             elements.ordinality,
             row_number() over (
               partition by elements.candidate->>'cliente_id'
               order by elements.ordinality
             ) as cliente_ordem
      from jsonb_array_elements(coalesce(v_day.oportunidades, '[]'::jsonb))
        with ordinality as elements(candidate, ordinality)
    ) ranked
    where ranked.cliente_ordem = 1
    order by ranked.ordinality
    limit (private.secretaria_max_candidatos_plano())
  loop
    perform private.inserir_secretaria_plano_item(v_plan_id, v_candidate, v_selected_count + 1);
    v_selected_count := v_selected_count + 1;
  end loop;

  if v_selected_count = 0 then
    raise exception 'Ainda nao encontrei clientes compativeis para este dia.';
  end if;

  insert into public.secretaria_atividades (
    clinica_id, profissional_id, plano_id, tipo, dados, criado_por
  )
  values (
    p_clinica_id,
    p_profissional_id,
    v_plan_id,
    'PLANO_CRIADO',
    jsonb_build_object(
      'data_alvo', p_data_alvo,
      'total_oportunidades', v_day.total_oportunidades,
      'itens_selecionados', v_selected_count,
      'limite_candidatos', private.secretaria_max_candidatos_plano()
    ),
    auth.uid()
  );

  return v_plan_id;
end;
$function$;

create or replace function public.revalidar_secretaria_plano(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_plano_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
declare
  v_plan public.secretaria_planos_acao%rowtype;
  v_capacity record;
  v_radar record;
  v_day record;
  v_item record;
  v_candidate_exists boolean;
  v_agenda_mudou boolean;
  v_invalidated integer := 0;
begin
  perform private.validar_secretaria_contexto(p_clinica_id, p_profissional_id);

  select * into v_plan
  from public.secretaria_planos_acao p
  where p.id = p_plano_id
    and p.clinica_id = p_clinica_id
    and p.profissional_id = p_profissional_id
  for update;

  if v_plan.id is null then
    raise exception 'Plano nao encontrado.';
  end if;

  select c.* into v_capacity
  from public.calcular_capacidade_comercial_periodo(
    p_clinica_id, p_profissional_id, v_plan.data_alvo, v_plan.data_alvo
  ) c
  where c.data = v_plan.data_alvo;

  select r.* into v_radar
  from public.calcular_radar_ocupacao_periodo(
    p_clinica_id, p_profissional_id, v_plan.data_alvo, v_plan.data_alvo
  ) r
  where r.data = v_plan.data_alvo;

  select o.* into v_day
  from public.calcular_oportunidades_comerciais_periodo(
    p_clinica_id, p_profissional_id, v_plan.data_alvo, v_plan.data_alvo
  ) o
  where o.data = v_plan.data_alvo;

  if v_capacity.data is null or v_radar.data is null or v_day.data is null then
    raise exception 'Nao foi possivel recalcular a agenda para este plano.';
  end if;

  v_agenda_mudou :=
    v_plan.capacidade_minutos_snapshot is distinct from v_radar.capacidade_minutos
    or v_plan.ocupado_minutos_snapshot is distinct from v_radar.ocupado_minutos
    or v_plan.livre_minutos_snapshot is distinct from v_radar.livre_minutos
    or v_plan.ocupacao_percentual_snapshot is distinct from v_radar.ocupacao_percentual
    or v_plan.classificacao_snapshot is distinct from v_radar.classificacao
    or v_plan.fonte_disponibilidade_snapshot is distinct from v_radar.fonte_disponibilidade;

  for v_item in
    select i.*
    from public.secretaria_plano_itens i
    where i.plano_id = v_plan.id
      and i.status = 'SELECIONADO'
    for update
  loop
    if v_radar.merece_atencao then
      v_candidate_exists := exists (
        select 1
        from jsonb_array_elements(coalesce(v_day.oportunidades, '[]'::jsonb)) as elements(candidate)
        where elements.candidate->>'cliente_id' = v_item.cliente_id::text
          and elements.candidate->>'servico_id' = v_item.servico_id::text
          and elements.candidate->>'origem' = v_item.origem
          and (
            v_item.origem = 'retorno'
            or elements.candidate->>'id' = v_item.oportunidade_id_snapshot
          )
      );

      if not v_candidate_exists then
        update public.secretaria_plano_itens
        set status = 'INVALIDO',
            motivo_invalidacao = case
              when v_item.origem = 'lista_espera' then 'Este cliente ja nao esta mais na lista de espera ativa.'
              else 'Este cliente ja possui um novo agendamento ou nao esta mais elegivel para retorno.'
            end,
            atualizado_em = now()
        where id = v_item.id;

        insert into public.secretaria_atividades (
          clinica_id, profissional_id, plano_id, cliente_id, tipo, dados, criado_por
        )
        values (
          p_clinica_id,
          p_profissional_id,
          v_plan.id,
          v_item.cliente_id,
          'CANDIDATO_INVALIDADO',
          jsonb_build_object(
            'item_id', v_item.id,
            'origem', v_item.origem,
            'motivo', case
              when v_item.origem = 'lista_espera' then 'Este cliente ja nao esta mais na lista de espera ativa.'
              else 'Este cliente ja possui um novo agendamento ou nao esta mais elegivel para retorno.'
            end
          ),
          auth.uid()
        );
        v_invalidated := v_invalidated + 1;
      end if;
    end if;
  end loop;

  if v_agenda_mudou or v_invalidated > 0 then
    insert into public.secretaria_atividades (
      clinica_id, profissional_id, plano_id, tipo, dados, criado_por
    )
    values (
      p_clinica_id,
      p_profissional_id,
      v_plan.id,
      'PLANO_ATUALIZADO',
      jsonb_build_object(
        'agenda_mudou', v_agenda_mudou,
        'dia_merece_atencao', v_radar.merece_atencao,
        'itens_invalidados', v_invalidated
      ),
      auth.uid()
    );
  end if;

  return jsonb_build_object(
    'plano', private.secretaria_plano_json(v_plan.id),
    'agenda_mudou', v_agenda_mudou,
    'dia_merece_atencao', v_radar.merece_atencao,
    'itens_invalidados', v_invalidated,
    'oportunidades', coalesce(v_day.oportunidades, '[]'::jsonb),
    'mensagem', case
      when not v_radar.merece_atencao then 'A agenda mudou desde que este plano foi preparado.'
      when v_invalidated > 0 then 'Alguns clientes nao estao mais elegiveis. Revise o plano.'
      when v_agenda_mudou then 'A agenda foi recalculada. Revise o plano antes de aprovar.'
      else 'O plano continua atualizado.'
    end
  );
end;
$function$;

create or replace function public.atualizar_secretaria_plano(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_plano_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
declare
  v_plan public.secretaria_planos_acao%rowtype;
  v_capacity record;
  v_radar record;
  v_day record;
  v_item record;
  v_candidate jsonb;
  v_candidate_exists boolean;
  v_selected_count integer;
  v_invalidated integer := 0;
  v_added integer := 0;
  v_agenda_mudou boolean;
  v_ordem integer;
begin
  perform private.validar_secretaria_contexto(p_clinica_id, p_profissional_id);

  select * into v_plan
  from public.secretaria_planos_acao p
  where p.id = p_plano_id
    and p.clinica_id = p_clinica_id
    and p.profissional_id = p_profissional_id
  for update;

  if v_plan.id is null then
    raise exception 'Plano nao encontrado.';
  end if;

  if v_plan.status <> 'RASCUNHO' then
    return jsonb_build_object(
      'plano', private.secretaria_plano_json(v_plan.id),
      'atualizado', false,
      'mensagem', 'Somente planos em revisao podem ser atualizados.'
    );
  end if;

  select c.* into v_capacity
  from public.calcular_capacidade_comercial_periodo(
    p_clinica_id, p_profissional_id, v_plan.data_alvo, v_plan.data_alvo
  ) c
  where c.data = v_plan.data_alvo;

  select r.* into v_radar
  from public.calcular_radar_ocupacao_periodo(
    p_clinica_id, p_profissional_id, v_plan.data_alvo, v_plan.data_alvo
  ) r
  where r.data = v_plan.data_alvo;

  select o.* into v_day
  from public.calcular_oportunidades_comerciais_periodo(
    p_clinica_id, p_profissional_id, v_plan.data_alvo, v_plan.data_alvo
  ) o
  where o.data = v_plan.data_alvo;

  if v_capacity.data is null or v_radar.data is null or v_day.data is null then
    raise exception 'Nao foi possivel recalcular a agenda para este plano.';
  end if;

  v_agenda_mudou :=
    v_plan.capacidade_minutos_snapshot is distinct from v_radar.capacidade_minutos
    or v_plan.ocupado_minutos_snapshot is distinct from v_radar.ocupado_minutos
    or v_plan.livre_minutos_snapshot is distinct from v_radar.livre_minutos
    or v_plan.ocupacao_percentual_snapshot is distinct from v_radar.ocupacao_percentual
    or v_plan.classificacao_snapshot is distinct from v_radar.classificacao
    or v_plan.fonte_disponibilidade_snapshot is distinct from v_radar.fonte_disponibilidade;

  if not v_radar.merece_atencao or coalesce(v_day.total_oportunidades, 0) = 0 then
    return jsonb_build_object(
      'plano', private.secretaria_plano_json(v_plan.id),
      'atualizado', false,
      'agenda_mudou', true,
      'dia_merece_atencao', v_radar.merece_atencao,
      'oportunidades', coalesce(v_day.oportunidades, '[]'::jsonb),
      'mensagem', case
        when not v_radar.merece_atencao then 'A agenda mudou e este dia nao precisa mais de atencao.'
        else 'Ainda nao encontrei clientes compativeis para atualizar este plano.'
      end
    );
  end if;

  for v_item in
    select i.*
    from public.secretaria_plano_itens i
    where i.plano_id = v_plan.id
      and i.status = 'SELECIONADO'
    for update
  loop
    v_candidate_exists := exists (
      select 1
      from jsonb_array_elements(coalesce(v_day.oportunidades, '[]'::jsonb)) as elements(candidate)
      where elements.candidate->>'cliente_id' = v_item.cliente_id::text
        and elements.candidate->>'servico_id' = v_item.servico_id::text
        and elements.candidate->>'origem' = v_item.origem
        and (
          v_item.origem = 'retorno'
          or elements.candidate->>'id' = v_item.oportunidade_id_snapshot
        )
    );

    if not v_candidate_exists then
      update public.secretaria_plano_itens
      set status = 'INVALIDO',
          motivo_invalidacao = case
            when v_item.origem = 'lista_espera' then 'Este cliente ja nao esta mais na lista de espera ativa.'
            else 'Este cliente ja possui um novo agendamento ou nao esta mais elegivel para retorno.'
          end,
          atualizado_em = now()
      where id = v_item.id;
      insert into public.secretaria_atividades (
        clinica_id, profissional_id, plano_id, cliente_id, tipo, dados, criado_por
      )
      values (
        p_clinica_id, p_profissional_id, v_plan.id, v_item.cliente_id,
        'CANDIDATO_INVALIDADO',
        jsonb_build_object('item_id', v_item.id, 'origem', v_item.origem),
        auth.uid()
      );
      v_invalidated := v_invalidated + 1;
    end if;
  end loop;

  select count(*)::integer into v_selected_count
  from public.secretaria_plano_itens i
  where i.plano_id = v_plan.id
    and i.status = 'SELECIONADO';

  for v_candidate in
    select ranked.candidate
    from (
      select elements.candidate,
             elements.ordinality,
             row_number() over (
               partition by elements.candidate->>'cliente_id'
               order by elements.ordinality
             ) as cliente_ordem
      from jsonb_array_elements(coalesce(v_day.oportunidades, '[]'::jsonb))
        with ordinality as elements(candidate, ordinality)
    ) ranked
    where ranked.cliente_ordem = 1
    order by ranked.ordinality
    limit (private.secretaria_max_candidatos_plano())
  loop
    exit when v_selected_count >= private.secretaria_max_candidatos_plano();

    if exists (
      select 1
      from public.secretaria_plano_itens i
      where i.plano_id = v_plan.id
        and i.cliente_id = (v_candidate->>'cliente_id')::uuid
        and i.status = 'REMOVIDO'
    ) then
      continue;
    end if;

    if exists (
      select 1
      from public.secretaria_plano_itens i
      where i.plano_id = v_plan.id
        and i.cliente_id = (v_candidate->>'cliente_id')::uuid
        and i.status = 'SELECIONADO'
    ) then
      continue;
    end if;

    if exists (
      select 1
      from public.secretaria_plano_itens i
      where i.plano_id = v_plan.id
        and i.oportunidade_id_snapshot = v_candidate->>'id'
    ) then
      continue;
    end if;

    select coalesce(max(i.ordem), 0) + 1
      into v_ordem
    from public.secretaria_plano_itens i
    where i.plano_id = v_plan.id;

    perform private.inserir_secretaria_plano_item(v_plan.id, v_candidate, v_ordem);
    v_selected_count := v_selected_count + 1;
    v_added := v_added + 1;
  end loop;

  update public.secretaria_planos_acao
  set capacidade_minutos_snapshot = v_day.capacidade_minutos,
      ocupado_minutos_snapshot = v_day.ocupado_minutos,
      livre_minutos_snapshot = v_day.livre_minutos,
      ocupacao_percentual_snapshot = v_day.ocupacao_percentual,
      classificacao_snapshot = v_day.classificacao,
      fonte_disponibilidade_snapshot = v_day.fonte_disponibilidade,
      total_oportunidades_snapshot = v_day.total_oportunidades,
      atualizado_em = now()
  where id = v_plan.id;

  insert into public.secretaria_atividades (
    clinica_id, profissional_id, plano_id, tipo, dados, criado_por
  )
  values (
    p_clinica_id,
    p_profissional_id,
    v_plan.id,
    'PLANO_ATUALIZADO',
    jsonb_build_object(
      'agenda_mudou', v_agenda_mudou,
      'itens_invalidados', v_invalidated,
      'itens_adicionados', v_added,
      'total_oportunidades', v_day.total_oportunidades
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'plano', private.secretaria_plano_json(v_plan.id),
    'atualizado', true,
    'agenda_mudou', v_agenda_mudou,
    'dia_merece_atencao', v_radar.merece_atencao,
    'itens_invalidados', v_invalidated,
    'itens_adicionados', v_added,
    'oportunidades', coalesce(v_day.oportunidades, '[]'::jsonb),
    'mensagem', 'O plano foi atualizado com os dados atuais da agenda.'
  );
end;
$function$;

create or replace function public.remover_secretaria_plano_item(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_plano_id uuid,
  p_item_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
declare
  v_plan public.secretaria_planos_acao%rowtype;
  v_item public.secretaria_plano_itens%rowtype;
begin
  perform private.validar_secretaria_contexto(p_clinica_id, p_profissional_id);

  select * into v_plan
  from public.secretaria_planos_acao p
  where p.id = p_plano_id
    and p.clinica_id = p_clinica_id
    and p.profissional_id = p_profissional_id
  for update;

  if v_plan.id is null then
    raise exception 'Plano nao encontrado.';
  end if;

  if v_plan.status <> 'RASCUNHO' then
    raise exception 'Somente planos em revisao podem ser alterados.';
  end if;

  select * into v_item
  from public.secretaria_plano_itens i
  where i.id = p_item_id
    and i.plano_id = v_plan.id
    and i.status = 'SELECIONADO'
  for update;

  if v_item.id is null then
    raise exception 'Candidato nao encontrado ou ja removido.';
  end if;

  update public.secretaria_plano_itens
  set status = 'REMOVIDO', atualizado_em = now()
  where id = v_item.id;

  insert into public.secretaria_atividades (
    clinica_id, profissional_id, plano_id, cliente_id, tipo, dados, criado_por
  )
  values (
    p_clinica_id,
    p_profissional_id,
    v_plan.id,
    v_item.cliente_id,
    'CANDIDATO_REMOVIDO',
    jsonb_build_object(
      'item_id', v_item.id,
      'origem', v_item.origem,
      'oportunidade_id', v_item.oportunidade_id_snapshot
    ),
    auth.uid()
  );

  return private.secretaria_plano_json(v_plan.id);
end;
$function$;

create or replace function public.adicionar_secretaria_plano_item(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_plano_id uuid,
  p_oportunidade_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
declare
  v_plan public.secretaria_planos_acao%rowtype;
  v_radar record;
  v_day record;
  v_candidate jsonb;
  v_selected_count integer;
  v_item_id uuid;
  v_ordem integer;
begin
  perform private.validar_secretaria_contexto(p_clinica_id, p_profissional_id);

  select * into v_plan
  from public.secretaria_planos_acao p
  where p.id = p_plano_id
    and p.clinica_id = p_clinica_id
    and p.profissional_id = p_profissional_id
  for update;

  if v_plan.id is null then
    raise exception 'Plano nao encontrado.';
  end if;

  if v_plan.status <> 'RASCUNHO' then
    raise exception 'Somente planos em revisao podem ser alterados.';
  end if;

  select r.* into v_radar
  from public.calcular_radar_ocupacao_periodo(
    p_clinica_id, p_profissional_id, v_plan.data_alvo, v_plan.data_alvo
  ) r
  where r.data = v_plan.data_alvo;

  select o.* into v_day
  from public.calcular_oportunidades_comerciais_periodo(
    p_clinica_id, p_profissional_id, v_plan.data_alvo, v_plan.data_alvo
  ) o
  where o.data = v_plan.data_alvo;

  if v_radar.data is null or v_day.data is null or not v_radar.merece_atencao then
    raise exception 'A agenda mudou e este dia nao precisa mais de atencao.';
  end if;

  select elements.candidate
    into v_candidate
  from jsonb_array_elements(coalesce(v_day.oportunidades, '[]'::jsonb)) as elements(candidate)
  where elements.candidate->>'id' = p_oportunidade_id
  limit 1;

  if v_candidate is null then
    raise exception 'Esta oportunidade nao esta mais disponivel.';
  end if;

  if exists (
    select 1
    from public.secretaria_plano_itens i
    where i.plano_id = v_plan.id
      and i.cliente_id = (v_candidate->>'cliente_id')::uuid
      and i.status = 'SELECIONADO'
  ) then
    raise exception 'Este cliente ja esta selecionado no plano.';
  end if;

  select count(*)::integer into v_selected_count
  from public.secretaria_plano_itens i
  where i.plano_id = v_plan.id
    and i.status = 'SELECIONADO';

  if v_selected_count >= private.secretaria_max_candidatos_plano() then
    raise exception 'O plano pode ter no maximo % clientes selecionados.', private.secretaria_max_candidatos_plano();
  end if;

  select coalesce(max(i.ordem), 0) + 1
    into v_ordem
  from public.secretaria_plano_itens i
  where i.plano_id = v_plan.id;

  v_item_id := private.inserir_secretaria_plano_item(v_plan.id, v_candidate, v_ordem);

  insert into public.secretaria_atividades (
    clinica_id, profissional_id, plano_id, cliente_id, tipo, dados, criado_por
  )
  values (
    p_clinica_id,
    p_profissional_id,
    v_plan.id,
    (v_candidate->>'cliente_id')::uuid,
    'PLANO_ATUALIZADO',
    jsonb_build_object(
      'acao', 'candidato_adicionado',
      'item_id', v_item_id,
      'oportunidade_id', p_oportunidade_id,
      'origem', v_candidate->>'origem'
    ),
    auth.uid()
  );

  return private.secretaria_plano_json(v_plan.id);
end;
$function$;

create or replace function public.aprovar_secretaria_plano(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_plano_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
declare
  v_plan public.secretaria_planos_acao%rowtype;
  v_capacity record;
  v_radar record;
  v_day record;
  v_item record;
  v_candidate_exists boolean;
  v_agenda_mudou boolean;
  v_invalidated integer := 0;
  v_selected_count integer;
begin
  perform private.validar_secretaria_contexto(p_clinica_id, p_profissional_id);

  select * into v_plan
  from public.secretaria_planos_acao p
  where p.id = p_plano_id
    and p.clinica_id = p_clinica_id
    and p.profissional_id = p_profissional_id
  for update;

  if v_plan.id is null then
    raise exception 'Plano nao encontrado.';
  end if;

  if v_plan.status = 'APROVADO' then
    return jsonb_build_object(
      'aprovado', true,
      'agenda_mudou', false,
      'plano', private.secretaria_plano_json(v_plan.id),
      'mensagem', 'Plano aprovado. Os clientes ainda nao foram contatados.'
    );
  end if;

  if v_plan.status <> 'RASCUNHO' then
    raise exception 'Este plano nao pode mais ser aprovado.';
  end if;

  select c.* into v_capacity
  from public.calcular_capacidade_comercial_periodo(
    p_clinica_id, p_profissional_id, v_plan.data_alvo, v_plan.data_alvo
  ) c
  where c.data = v_plan.data_alvo;

  select r.* into v_radar
  from public.calcular_radar_ocupacao_periodo(
    p_clinica_id, p_profissional_id, v_plan.data_alvo, v_plan.data_alvo
  ) r
  where r.data = v_plan.data_alvo;

  select o.* into v_day
  from public.calcular_oportunidades_comerciais_periodo(
    p_clinica_id, p_profissional_id, v_plan.data_alvo, v_plan.data_alvo
  ) o
  where o.data = v_plan.data_alvo;

  if v_capacity.data is null or v_radar.data is null or v_day.data is null then
    raise exception 'Nao foi possivel recalcular a agenda para aprovar este plano.';
  end if;

  v_agenda_mudou :=
    v_plan.capacidade_minutos_snapshot is distinct from v_radar.capacidade_minutos
    or v_plan.ocupado_minutos_snapshot is distinct from v_radar.ocupado_minutos
    or v_plan.livre_minutos_snapshot is distinct from v_radar.livre_minutos
    or v_plan.ocupacao_percentual_snapshot is distinct from v_radar.ocupacao_percentual
    or v_plan.classificacao_snapshot is distinct from v_radar.classificacao
    or v_plan.fonte_disponibilidade_snapshot is distinct from v_radar.fonte_disponibilidade;

  for v_item in
    select i.*
    from public.secretaria_plano_itens i
    where i.plano_id = v_plan.id
      and i.status = 'SELECIONADO'
    for update
  loop
    v_candidate_exists := exists (
      select 1
      from jsonb_array_elements(coalesce(v_day.oportunidades, '[]'::jsonb)) as elements(candidate)
      where elements.candidate->>'cliente_id' = v_item.cliente_id::text
        and elements.candidate->>'servico_id' = v_item.servico_id::text
        and elements.candidate->>'origem' = v_item.origem
        and (
          v_item.origem = 'retorno'
          or elements.candidate->>'id' = v_item.oportunidade_id_snapshot
        )
    );

    if not v_candidate_exists then
      update public.secretaria_plano_itens
      set status = 'INVALIDO',
          motivo_invalidacao = case
            when v_item.origem = 'lista_espera' then 'Este cliente ja nao esta mais na lista de espera ativa.'
            else 'Este cliente ja possui um novo agendamento ou nao esta mais elegivel para retorno.'
          end,
          atualizado_em = now()
      where id = v_item.id;
      insert into public.secretaria_atividades (
        clinica_id, profissional_id, plano_id, cliente_id, tipo, dados, criado_por
      )
      values (
        p_clinica_id, p_profissional_id, v_plan.id, v_item.cliente_id,
        'CANDIDATO_INVALIDADO',
        jsonb_build_object('item_id', v_item.id, 'origem', v_item.origem),
        auth.uid()
      );
      v_invalidated := v_invalidated + 1;
    end if;
  end loop;

  if not v_radar.merece_atencao or v_agenda_mudou then
    insert into public.secretaria_atividades (
      clinica_id, profissional_id, plano_id, tipo, dados, criado_por
    )
    values (
      p_clinica_id,
      p_profissional_id,
      v_plan.id,
      'PLANO_ATUALIZADO',
      jsonb_build_object(
        'agenda_mudou', true,
        'dia_merece_atencao', v_radar.merece_atencao,
        'itens_invalidados', v_invalidated
      ),
      auth.uid()
    );

    return jsonb_build_object(
      'aprovado', false,
      'agenda_mudou', true,
      'dia_merece_atencao', v_radar.merece_atencao,
      'itens_invalidados', v_invalidated,
      'plano', private.secretaria_plano_json(v_plan.id),
      'oportunidades', coalesce(v_day.oportunidades, '[]'::jsonb),
      'mensagem', case
        when not v_radar.merece_atencao then 'A agenda mudou desde que este plano foi preparado. Sua secretaria recalculou a situacao.'
        else 'A agenda mudou desde que este plano foi preparado. Revise ou atualize o plano.'
      end
    );
  end if;

  if v_invalidated > 0 then
    return jsonb_build_object(
      'aprovado', false,
      'agenda_mudou', false,
      'dia_merece_atencao', true,
      'itens_invalidados', v_invalidated,
      'plano', private.secretaria_plano_json(v_plan.id),
      'oportunidades', coalesce(v_day.oportunidades, '[]'::jsonb),
      'mensagem', 'Alguns clientes nao estao mais elegiveis. Revise o plano antes de aprovar.'
    );
  end if;

  select count(*)::integer into v_selected_count
  from public.secretaria_plano_itens i
  where i.plano_id = v_plan.id
    and i.status = 'SELECIONADO';

  if v_selected_count = 0 then
    return jsonb_build_object(
      'aprovado', false,
      'agenda_mudou', false,
      'dia_merece_atencao', true,
      'itens_invalidados', 0,
      'plano', private.secretaria_plano_json(v_plan.id),
      'mensagem', 'Selecione ao menos um cliente para aprovar o plano.'
    );
  end if;

  update public.secretaria_planos_acao
  set status = 'APROVADO',
      aprovado_em = now(),
      aprovado_por = auth.uid(),
      atualizado_em = now()
  where id = v_plan.id;

  insert into public.secretaria_atividades (
    clinica_id, profissional_id, plano_id, tipo, dados, criado_por
  )
  values (
    p_clinica_id,
    p_profissional_id,
    v_plan.id,
    'PLANO_APROVADO',
    jsonb_build_object(
      'itens_selecionados', v_selected_count,
      'mensagem', 'Os clientes ainda nao foram contatados.'
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'aprovado', true,
    'agenda_mudou', false,
    'dia_merece_atencao', true,
    'itens_invalidados', 0,
    'plano', private.secretaria_plano_json(v_plan.id),
    'mensagem', 'Plano aprovado. Os clientes ainda nao foram contatados.'
  );
end;
$function$;

create or replace function public.cancelar_secretaria_plano(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_plano_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $function$
declare
  v_plan public.secretaria_planos_acao%rowtype;
begin
  perform private.validar_secretaria_contexto(p_clinica_id, p_profissional_id);

  select * into v_plan
  from public.secretaria_planos_acao p
  where p.id = p_plano_id
    and p.clinica_id = p_clinica_id
    and p.profissional_id = p_profissional_id
  for update;

  if v_plan.id is null then
    raise exception 'Plano nao encontrado.';
  end if;

  if v_plan.status = 'CANCELADO' then
    return private.secretaria_plano_json(v_plan.id);
  end if;

  update public.secretaria_planos_acao
  set status = 'CANCELADO',
      cancelado_em = now(),
      cancelado_por = auth.uid(),
      atualizado_em = now()
  where id = v_plan.id;

  insert into public.secretaria_atividades (
    clinica_id, profissional_id, plano_id, tipo, dados, criado_por
  )
  values (
    p_clinica_id,
    p_profissional_id,
    v_plan.id,
    'PLANO_CANCELADO',
    jsonb_build_object('status_anterior', v_plan.status),
    auth.uid()
  );

  return private.secretaria_plano_json(v_plan.id);
end;
$function$;

revoke all on function private.validar_secretaria_contexto(uuid, uuid) from public, anon;
grant execute on function private.validar_secretaria_contexto(uuid, uuid) to authenticated;
revoke all on function private.inserir_secretaria_plano_item(uuid, jsonb, integer) from public, anon;
grant execute on function private.inserir_secretaria_plano_item(uuid, jsonb, integer) to authenticated;
revoke all on function private.secretaria_max_candidatos_plano() from public, anon;
grant execute on function private.secretaria_max_candidatos_plano() to authenticated;
revoke all on function private.secretaria_plano_json(uuid) from public, anon;
grant execute on function private.secretaria_plano_json(uuid) to authenticated;

revoke all on function public.listar_secretaria_planos_acao_periodo(uuid, uuid, date, date) from public, anon;
grant execute on function public.listar_secretaria_planos_acao_periodo(uuid, uuid, date, date) to authenticated;
revoke all on function public.buscar_secretaria_plano_acao(uuid, uuid, uuid) from public, anon;
grant execute on function public.buscar_secretaria_plano_acao(uuid, uuid, uuid) to authenticated;
revoke all on function public.preparar_secretaria_plano(uuid, uuid, date) from public, anon;
grant execute on function public.preparar_secretaria_plano(uuid, uuid, date) to authenticated;
revoke all on function public.revalidar_secretaria_plano(uuid, uuid, uuid) from public, anon;
grant execute on function public.revalidar_secretaria_plano(uuid, uuid, uuid) to authenticated;
revoke all on function public.atualizar_secretaria_plano(uuid, uuid, uuid) from public, anon;
grant execute on function public.atualizar_secretaria_plano(uuid, uuid, uuid) to authenticated;
revoke all on function public.remover_secretaria_plano_item(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.remover_secretaria_plano_item(uuid, uuid, uuid, uuid) to authenticated;
revoke all on function public.adicionar_secretaria_plano_item(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.adicionar_secretaria_plano_item(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.aprovar_secretaria_plano(uuid, uuid, uuid) from public, anon;
grant execute on function public.aprovar_secretaria_plano(uuid, uuid, uuid) to authenticated;
revoke all on function public.cancelar_secretaria_plano(uuid, uuid, uuid) from public, anon;
grant execute on function public.cancelar_secretaria_plano(uuid, uuid, uuid) to authenticated;
