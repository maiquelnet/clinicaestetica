-- Fases 3, 4 e 5: capacidade comercial, Radar e oportunidades sob demanda.
-- A capacidade e o Radar sao calculados a partir dos dados atuais; nenhum
-- resultado e persistido e nenhuma funcao executa contato, reserva ou agenda.

create index if not exists agendamentos_capacidade_periodo_idx
  on public.agendamentos (clinica_id, profissional_id, inicio_em, fim_em)
  where arquivado_em is null;

create index if not exists bloqueios_capacidade_periodo_idx
  on public.bloqueios_agenda (clinica_id, profissional_id, inicio_em, fim_em);

create index if not exists lista_espera_oportunidades_idx
  on public.lista_espera (clinica_id, status, arquivado_em, prioridade, criado_em);

create index if not exists agendamentos_retorno_historico_idx
  on public.agendamentos (clinica_id, cliente_id, servico_id, inicio_em desc)
  where arquivado_em is null and status = 'concluido';

create or replace function private.calcular_capacidade_comercial_periodo_impl(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  data date,
  profissional_id uuid,
  capacidade_minutos integer,
  ocupado_minutos integer,
  livre_minutos integer,
  bloqueado_minutos integer,
  ocupacao_percentual numeric,
  possui_capacidade boolean,
  periodos_livres jsonb,
  fonte_disponibilidade text
)
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

  if p_data_inicio is null or p_data_fim is null or p_data_fim < p_data_inicio then
    raise exception 'Informe um periodo de datas valido.';
  end if;

  if p_data_fim - p_data_inicio > 62 then
    raise exception 'O periodo maximo para esta consulta e de 63 dias.';
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

  return query
  with dias as (
    select serie::date as data
    from generate_series(
      p_data_inicio::timestamp,
      p_data_fim::timestamp,
      interval '1 day'
    ) as serie
  ),
  limites_dia as (
    select
      d.data,
      (d.data::timestamp at time zone v_timezone) as inicio_dia,
      ((d.data + 1)::timestamp at time zone v_timezone) as fim_dia
    from dias d
  ),
  excecoes as (
    select
      d.data,
      ex.id,
      ex.nao_atende
    from dias d
    left join public.disponibilidade_excecoes ex
      on ex.clinica_id = p_clinica_id
     and ex.profissional_id = p_profissional_id
     and ex.data = d.data
  ),
  disponibilidade_base as (
    select
      d.data,
      'excecao'::text as fonte,
      ep.inicio,
      ep.fim
    from dias d
    join public.disponibilidade_excecoes ex
      on ex.clinica_id = p_clinica_id
     and ex.profissional_id = p_profissional_id
     and ex.data = d.data
     and ex.nao_atende = false
    join public.disponibilidade_excecao_periodos ep
      on ep.clinica_id = p_clinica_id
     and ep.excecao_id = ex.id

    union all

    select
      d.data,
      'semanal'::text as fonte,
      ws.inicio,
      ws.fim
    from dias d
    join public.disponibilidade_semanal ws
      on ws.clinica_id = p_clinica_id
     and ws.profissional_id = p_profissional_id
     and ws.dia_semana = extract(dow from d.data)::smallint
    where not exists (
      select 1
      from public.disponibilidade_excecoes ex
      where ex.clinica_id = p_clinica_id
        and ex.profissional_id = p_profissional_id
        and ex.data = d.data
    )
  ),
  base_ranges as (
    select
      db.data,
      range_agg(
        tstzrange(
          (db.data::timestamp + db.inicio) at time zone v_timezone,
          (db.data::timestamp + db.fim) at time zone v_timezone,
          '[)'
        )
      ) as periodos
    from disponibilidade_base db
    group by db.data
  ),
  bloqueios as (
    select
      ld.data,
      tstzrange(
        greatest(b.inicio_em, ld.inicio_dia),
        least(b.fim_em, ld.fim_dia),
        '[)'
      ) as periodo
    from limites_dia ld
    join public.bloqueios_agenda b
      on b.clinica_id = p_clinica_id
     and (b.profissional_id is null or b.profissional_id = p_profissional_id)
     and b.inicio_em < ld.fim_dia
     and b.fim_em > ld.inicio_dia
     and b.inicio_em < b.fim_em
  ),
  bloqueios_unidos as (
    select b.data, range_agg(b.periodo) as periodos
    from bloqueios b
    where not isempty(b.periodo)
    group by b.data
  ),
  faixas as (
    select
      ld.data,
      coalesce(br.periodos, '{}'::tstzmultirange) as base,
      coalesce(bu.periodos, '{}'::tstzmultirange) as bloqueios,
      coalesce(br.periodos, '{}'::tstzmultirange)
        - coalesce(bu.periodos, '{}'::tstzmultirange) as capacidade
    from limites_dia ld
    left join base_ranges br on br.data = ld.data
    left join bloqueios_unidos bu on bu.data = ld.data
  ),
  livres as (
    select f.data, u.periodo
    from faixas f
    cross join lateral unnest(f.capacidade) as u(periodo)
  ),
  ocupacoes as (
    select
      l.data,
      tstzrange(
        greatest(a.inicio_em, lower(l.periodo)),
        least(a.fim_em, upper(l.periodo)),
        '[)'
      ) as periodo
    from livres l
    join limites_dia ld on ld.data = l.data
    join public.agendamentos a
      on a.clinica_id = p_clinica_id
     and (a.profissional_id is null or a.profissional_id = p_profissional_id)
     and a.status <> 'cancelado'
     and a.arquivado_em is null
     and a.inicio_em < upper(l.periodo)
     and a.fim_em > lower(l.periodo)
     and a.inicio_em < ld.fim_dia
     and a.fim_em > ld.inicio_dia
  ),
  ocupacoes_unidas as (
    select o.data, range_agg(o.periodo) as periodos
    from ocupacoes o
    where not isempty(o.periodo)
    group by o.data
  ),
  metricas as (
    select
      f.data,
      coalesce((
        select round(sum(extract(epoch from (upper(x.periodo) - lower(x.periodo))) / 60))::integer
        from unnest(f.capacidade) as x(periodo)
      ), 0) as capacidade_minutos,
      coalesce((
        select round(sum(extract(epoch from (upper(x.periodo) - lower(x.periodo))) / 60))::integer
        from unnest(coalesce(ou.periodos, '{}'::tstzmultirange)) as x(periodo)
      ), 0) as ocupado_minutos,
      coalesce((
        select round(sum(extract(epoch from (upper(x.periodo) - lower(x.periodo))) / 60))::integer
        from unnest(f.base - f.capacidade) as x(periodo)
      ), 0) as bloqueado_minutos
    from faixas f
    left join ocupacoes_unidas ou on ou.data = f.data
  )
  select
    m.data,
    p_profissional_id,
    m.capacidade_minutos,
    m.ocupado_minutos,
    greatest(0, m.capacidade_minutos - m.ocupado_minutos),
    m.bloqueado_minutos,
    case
      when m.capacidade_minutos > 0
        then round((m.ocupado_minutos::numeric * 100) / m.capacidade_minutos, 2)
      else null::numeric
    end,
    m.capacidade_minutos > 0,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'inicio_em', lower(l.periodo),
          'fim_em', upper(l.periodo),
          'inicio', to_char(lower(l.periodo) at time zone v_timezone, 'HH24:MI'),
          'fim', to_char(upper(l.periodo) at time zone v_timezone, 'HH24:MI')
        )
        order by lower(l.periodo)
      )
      from livres l
      where l.data = m.data
    ), '[]'::jsonb),
    case
      when e.id is not null then 'excecao'
      else 'semanal'
    end
  from metricas m
  join excecoes e on e.data = m.data
  order by m.data;
end;
$function$;

create or replace function public.calcular_capacidade_comercial_periodo(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  data date,
  profissional_id uuid,
  capacidade_minutos integer,
  ocupado_minutos integer,
  livre_minutos integer,
  bloqueado_minutos integer,
  ocupacao_percentual numeric,
  possui_capacidade boolean,
  periodos_livres jsonb,
  fonte_disponibilidade text
)
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select *
  from private.calcular_capacidade_comercial_periodo_impl(
    p_clinica_id,
    p_profissional_id,
    p_data_inicio,
    p_data_fim
  );
$function$;

create or replace function private.calcular_radar_ocupacao_periodo_impl(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  data date,
  profissional_id uuid,
  capacidade_minutos integer,
  ocupado_minutos integer,
  livre_minutos integer,
  bloqueado_minutos integer,
  ocupacao_percentual numeric,
  possui_capacidade boolean,
  periodos_livres jsonb,
  fonte_disponibilidade text,
  classificacao text,
  merece_atencao boolean
)
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select
    c.*,
    case
      when not c.possui_capacidade then 'SEM_CAPACIDADE'
      when c.ocupacao_percentual < 40 and c.livre_minutos >= 120 then 'AGENDA_COM_OPORTUNIDADES'
      when c.ocupacao_percentual >= 40 and c.ocupacao_percentual < 65 and c.livre_minutos >= 120 then 'AINDA_HA_DISPONIBILIDADE'
      when c.ocupacao_percentual < 65 and c.livre_minutos < 120 then 'POUCA_DISPONIBILIDADE'
      when c.ocupacao_percentual < 85 then 'BOA_OCUPACAO'
      else 'QUASE_COMPLETA'
    end,
    (
      c.possui_capacidade
      and c.ocupacao_percentual is not null
      and c.ocupacao_percentual < 65
      and c.livre_minutos >= 120
    )
  from private.calcular_capacidade_comercial_periodo_impl(
    p_clinica_id,
    p_profissional_id,
    p_data_inicio,
    p_data_fim
  ) c
  order by c.data;
$function$;

create or replace function public.calcular_radar_ocupacao_periodo(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  data date,
  profissional_id uuid,
  capacidade_minutos integer,
  ocupado_minutos integer,
  livre_minutos integer,
  bloqueado_minutos integer,
  ocupacao_percentual numeric,
  possui_capacidade boolean,
  periodos_livres jsonb,
  fonte_disponibilidade text,
  classificacao text,
  merece_atencao boolean
)
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select *
  from private.calcular_radar_ocupacao_periodo_impl(
    p_clinica_id,
    p_profissional_id,
    p_data_inicio,
    p_data_fim
  );
$function$;

create or replace function private.calcular_oportunidades_comerciais_periodo_impl(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  data date,
  profissional_id uuid,
  capacidade_minutos integer,
  ocupado_minutos integer,
  livre_minutos integer,
  ocupacao_percentual numeric,
  possui_capacidade boolean,
  periodos_livres jsonb,
  fonte_disponibilidade text,
  classificacao text,
  merece_atencao boolean,
  oportunidades jsonb,
  total_oportunidades integer,
  lista_espera_count integer,
  retorno_count integer,
  clientes_unicos_count integer
)
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

  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso negado para a clinica informada.';
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

  return query
  with radar as (
    select *
    from private.calcular_radar_ocupacao_periodo_impl(
      p_clinica_id,
      p_profissional_id,
      p_data_inicio,
      p_data_fim
    )
  ),
  radar_atencao as (
    select r.*
    from radar r
    where r.merece_atencao = true
  ),
  janelas_radar as (
    select
      r.data,
      r.profissional_id,
      r.capacidade_minutos,
      r.ocupado_minutos,
      r.livre_minutos,
      r.ocupacao_percentual,
      r.possui_capacidade,
      r.periodos_livres,
      r.fonte_disponibilidade,
      r.classificacao,
      r.merece_atencao,
      (w.inicio_em)::timestamptz as inicio_em,
      (w.fim_em)::timestamptz as fim_em,
      w.inicio,
      w.fim
    from radar_atencao r
    cross join lateral jsonb_to_recordset(r.periodos_livres) as w(
      inicio_em text,
      fim_em text,
      inicio text,
      fim text
    )
  ),
  espera_janelas as (
    select
      jr.data,
      l.id::text as origem_id,
      l.cliente_id,
      c.nome as cliente_nome,
      c.telefone,
      c.whatsapp_opt_in_status,
      c.aceita_marketing,
      s.id as servico_id,
      s.nome as servico_nome,
      s.duracao_minutos,
      'lista_espera'::text as origem,
      'Esta na lista de espera.'::text as motivo,
      null::date as retorno_devido_em,
      null::integer as atraso_retorno_dias,
      jsonb_build_object(
        'inicio_em', greatest(
          jr.inicio_em,
          coalesce(l.inicio_desejado_em, (jr.data::timestamp at time zone v_timezone))
        ),
        'fim_em', least(
          jr.fim_em,
          coalesce(l.fim_desejado_em, ((jr.data + 1)::timestamp at time zone v_timezone))
        ),
        'inicio', to_char(greatest(
          jr.inicio_em,
          coalesce(l.inicio_desejado_em, (jr.data::timestamp at time zone v_timezone))
        ) at time zone v_timezone, 'HH24:MI'),
        'fim', to_char(least(
          jr.fim_em,
          coalesce(l.fim_desejado_em, ((jr.data + 1)::timestamp at time zone v_timezone))
        ) at time zone v_timezone, 'HH24:MI')
      ) as janela,
      l.prioridade,
      l.criado_em,
      null::timestamptz as ultimo_atendimento_em,
      coalesce(msg.ultima_mensagem_em, null::timestamptz) as ultima_mensagem_em
    from janelas_radar jr
    join public.lista_espera l
      on l.clinica_id = p_clinica_id
     and l.status = 'em_espera'
     and l.arquivado_em is null
     and (l.profissional_id is null or l.profissional_id = p_profissional_id)
     and (l.data_preferida is null or l.data_preferida = jr.data)
    join public.clientes c
      on c.id = l.cliente_id
     and c.clinica_id = p_clinica_id
     and c.ativo = true
     and c.arquivado_em is null
    join public.servicos s
      on s.id = l.servico_id
     and s.clinica_id = p_clinica_id
     and s.ativo = true
     and s.arquivado_em is null
     and s.duracao_minutos > 0
    left join lateral (
      select max(coalesce(lm.enviado_em, lm.criado_em)) as ultima_mensagem_em
      from public.logs_mensagens lm
      where lm.clinica_id = p_clinica_id
        and lm.cliente_id = c.id
    ) msg on true
    where greatest(
        jr.inicio_em,
        coalesce(l.inicio_desejado_em, (jr.data::timestamp at time zone v_timezone))
      ) < least(
        jr.fim_em,
        coalesce(l.fim_desejado_em, ((jr.data + 1)::timestamp at time zone v_timezone))
      )
      and extract(epoch from (
        least(
          jr.fim_em,
          coalesce(l.fim_desejado_em, ((jr.data + 1)::timestamp at time zone v_timezone))
        ) - greatest(
          jr.inicio_em,
          coalesce(l.inicio_desejado_em, (jr.data::timestamp at time zone v_timezone))
        )
      )) / 60 >= s.duracao_minutos
      and (
        l.periodo_preferido is null
        or translate(lower(l.periodo_preferido), 'áàãâéêíóôõúç', 'aaaaeeiooouc') in ('manha', 'morning')
           and greatest(
             extract(hour from (greatest(jr.inicio_em, coalesce(l.inicio_desejado_em, (jr.data::timestamp at time zone v_timezone))) at time zone v_timezone)) * 60,
             0
           ) < 720
           and least(
             extract(hour from (least(jr.fim_em, coalesce(l.fim_desejado_em, ((jr.data + 1)::timestamp at time zone v_timezone))) at time zone v_timezone)) * 60,
             1440
           ) > 0
        or translate(lower(l.periodo_preferido), 'áàãâéêíóôõúç', 'aaaaeeiooouc') in ('tarde', 'afternoon')
           and greatest(
             extract(hour from (greatest(jr.inicio_em, coalesce(l.inicio_desejado_em, (jr.data::timestamp at time zone v_timezone))) at time zone v_timezone)) * 60,
             0
           ) < 1080
           and least(
             extract(hour from (least(jr.fim_em, coalesce(l.fim_desejado_em, ((jr.data + 1)::timestamp at time zone v_timezone))) at time zone v_timezone)) * 60,
             1440
           ) > 720
        or translate(lower(l.periodo_preferido), 'áàãâéêíóôõúç', 'aaaaeeiooouc') in ('noite', 'night', 'evening')
           and greatest(
             extract(hour from (greatest(jr.inicio_em, coalesce(l.inicio_desejado_em, (jr.data::timestamp at time zone v_timezone))) at time zone v_timezone)) * 60,
             0
           ) < 1440
           and least(
             extract(hour from (least(jr.fim_em, coalesce(l.fim_desejado_em, ((jr.data + 1)::timestamp at time zone v_timezone))) at time zone v_timezone)) * 60,
             1440
           ) > 1080
      )
  ),
  espera as (
    select
      ej.data,
      ej.origem_id,
      ej.cliente_id,
      ej.cliente_nome,
      ej.telefone,
      ej.whatsapp_opt_in_status,
      ej.aceita_marketing,
      ej.servico_id,
      ej.servico_nome,
      ej.duracao_minutos,
      ej.origem,
      ej.motivo,
      ej.retorno_devido_em,
      ej.atraso_retorno_dias,
      jsonb_agg(ej.janela order by ej.janela->>'inicio_em') as janelas_compativeis,
      ej.prioridade,
      ej.criado_em,
      ej.ultimo_atendimento_em,
      ej.ultima_mensagem_em,
      1 as origem_ordem
    from espera_janelas ej
    group by
      ej.data, ej.origem_id, ej.cliente_id, ej.cliente_nome, ej.telefone,
      ej.whatsapp_opt_in_status, ej.aceita_marketing, ej.servico_id,
      ej.servico_nome, ej.duracao_minutos, ej.origem, ej.motivo,
      ej.retorno_devido_em, ej.atraso_retorno_dias, ej.prioridade,
      ej.criado_em, ej.ultimo_atendimento_em, ej.ultima_mensagem_em
  ),
  atendimentos_validos as (
    select
      a.id,
      a.cliente_id,
      a.servico_id,
      a.inicio_em,
      row_number() over (
        partition by a.cliente_id, a.servico_id
        order by a.inicio_em desc, a.id desc
      ) as ordem
    from public.agendamentos a
    join public.clientes c
      on c.id = a.cliente_id
     and c.clinica_id = p_clinica_id
     and c.ativo = true
     and c.arquivado_em is null
    join public.servicos s
      on s.id = a.servico_id
     and s.clinica_id = p_clinica_id
     and s.ativo = true
     and s.arquivado_em is null
    where a.clinica_id = p_clinica_id
      and a.servico_id is not null
      and a.status = 'concluido'
      and a.arquivado_em is null
      and a.inicio_em < now()
  ),
  retornos_base as (
    select
      av.cliente_id,
      av.servico_id,
      av.inicio_em as ultimo_atendimento_em,
      c.nome as cliente_nome,
      c.telefone,
      c.whatsapp_opt_in_status,
      c.aceita_marketing,
      c.intervalo_retorno_dias as intervalo_cliente,
      s.nome as servico_nome,
      s.duracao_minutos,
      s.intervalo_retorno_dias as intervalo_servico,
      ((av.inicio_em at time zone v_timezone)::date
        + coalesce(c.intervalo_retorno_dias, s.intervalo_retorno_dias)) as retorno_devido_em,
      msg.ultima_mensagem_em
    from atendimentos_validos av
    join public.clientes c on c.id = av.cliente_id
    join public.servicos s on s.id = av.servico_id
    left join lateral (
      select max(coalesce(lm.enviado_em, lm.criado_em)) as ultima_mensagem_em
      from public.logs_mensagens lm
      where lm.clinica_id = p_clinica_id
        and lm.cliente_id = av.cliente_id
    ) msg on true
    where av.ordem = 1
      and coalesce(c.intervalo_retorno_dias, s.intervalo_retorno_dias) is not null
      and not exists (
        select 1
        from public.agendamentos futuro
        where futuro.clinica_id = p_clinica_id
          and futuro.cliente_id = av.cliente_id
          and futuro.servico_id = av.servico_id
          and futuro.status in ('agendado', 'confirmado', 'em_atendimento')
          and futuro.arquivado_em is null
          and futuro.inicio_em > now()
      )
  ),
  retorno_janelas as (
    select
      jr.data,
      rb.cliente_id,
      rb.cliente_nome,
      rb.telefone,
      rb.whatsapp_opt_in_status,
      rb.aceita_marketing,
      rb.servico_id,
      rb.servico_nome,
      rb.duracao_minutos,
      'retorno'::text as origem,
      case
        when rb.retorno_devido_em = jr.data then 'Retorno recomendado para hoje.'
        else 'Retorno recomendado ha ' || (jr.data - rb.retorno_devido_em)::text || ' dias.'
      end as motivo,
      rb.retorno_devido_em,
      (jr.data - rb.retorno_devido_em)::integer as atraso_retorno_dias,
      jsonb_build_object(
        'inicio_em', jr.inicio_em,
        'fim_em', jr.fim_em,
        'inicio', jr.inicio,
        'fim', jr.fim
      ) as janela,
      999999 as prioridade,
      rb.ultimo_atendimento_em,
      rb.ultima_mensagem_em
    from janelas_radar jr
    join retornos_base rb
      on rb.retorno_devido_em <= jr.data
    where extract(epoch from (jr.fim_em - jr.inicio_em)) / 60 >= rb.duracao_minutos
  ),
  retornos as (
    select
      rj.data,
      md5(rj.cliente_id::text || ':' || rj.servico_id::text) as origem_id,
      rj.cliente_id,
      rj.cliente_nome,
      rj.telefone,
      rj.whatsapp_opt_in_status,
      rj.aceita_marketing,
      rj.servico_id,
      rj.servico_nome,
      rj.duracao_minutos,
      rj.origem,
      rj.motivo,
      rj.retorno_devido_em,
      rj.atraso_retorno_dias,
      jsonb_agg(rj.janela order by rj.janela->>'inicio_em') as janelas_compativeis,
      rj.prioridade,
      rj.ultimo_atendimento_em as criado_em,
      rj.ultimo_atendimento_em,
      rj.ultima_mensagem_em,
      2 as origem_ordem
    from retorno_janelas rj
    group by
      rj.data, rj.cliente_id, rj.cliente_nome, rj.telefone,
      rj.whatsapp_opt_in_status, rj.aceita_marketing, rj.servico_id,
      rj.servico_nome, rj.duracao_minutos, rj.origem, rj.motivo,
      rj.retorno_devido_em, rj.atraso_retorno_dias, rj.prioridade,
      rj.ultimo_atendimento_em, rj.ultima_mensagem_em
  ),
  candidatos as (
    select * from espera
    union all
    select * from retornos
  ),
  por_dia as (
    select
      c.data,
      jsonb_agg(
        jsonb_build_object(
          'id', c.origem_id,
          'cliente_id', c.cliente_id,
          'cliente_nome', c.cliente_nome,
          'telefone', c.telefone,
          'servico_id', c.servico_id,
          'servico_nome', c.servico_nome,
          'duracao_minutos', c.duracao_minutos,
          'origem', c.origem,
          'motivo', c.motivo,
          'retorno_devido_em', c.retorno_devido_em,
          'atraso_retorno_dias', c.atraso_retorno_dias,
          'janelas_compativeis', c.janelas_compativeis,
          'whatsapp_opt_in_status', c.whatsapp_opt_in_status,
          'aceita_marketing', c.aceita_marketing,
          'ultima_mensagem_em', c.ultima_mensagem_em
        )
        order by
          c.origem_ordem,
          c.prioridade,
          c.atraso_retorno_dias desc nulls last,
          c.ultimo_atendimento_em asc nulls last,
          lower(c.cliente_nome),
          c.cliente_id,
          c.servico_id
      ) as oportunidades,
      count(*)::integer as total_oportunidades,
      count(*) filter (where c.origem = 'lista_espera')::integer as lista_espera_count,
      count(*) filter (where c.origem = 'retorno')::integer as retorno_count,
      count(distinct c.cliente_id)::integer as clientes_unicos_count
    from candidatos c
    group by c.data
  )
  select
    r.data,
    r.profissional_id,
    r.capacidade_minutos,
    r.ocupado_minutos,
    r.livre_minutos,
    r.ocupacao_percentual,
    r.possui_capacidade,
    r.periodos_livres,
    r.fonte_disponibilidade,
    r.classificacao,
    r.merece_atencao,
    coalesce(pd.oportunidades, '[]'::jsonb),
    coalesce(pd.total_oportunidades, 0),
    coalesce(pd.lista_espera_count, 0),
    coalesce(pd.retorno_count, 0),
    coalesce(pd.clientes_unicos_count, 0)
  from radar r
  left join por_dia pd on pd.data = r.data
  order by r.data;
end;
$function$;

create or replace function public.calcular_oportunidades_comerciais_periodo(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  data date,
  profissional_id uuid,
  capacidade_minutos integer,
  ocupado_minutos integer,
  livre_minutos integer,
  ocupacao_percentual numeric,
  possui_capacidade boolean,
  periodos_livres jsonb,
  fonte_disponibilidade text,
  classificacao text,
  merece_atencao boolean,
  oportunidades jsonb,
  total_oportunidades integer,
  lista_espera_count integer,
  retorno_count integer,
  clientes_unicos_count integer
)
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select *
  from private.calcular_oportunidades_comerciais_periodo_impl(
    p_clinica_id,
    p_profissional_id,
    p_data_inicio,
    p_data_fim
  );
$function$;

revoke all on function private.calcular_capacidade_comercial_periodo_impl(uuid, uuid, date, date) from public, anon;
grant execute on function private.calcular_capacidade_comercial_periodo_impl(uuid, uuid, date, date) to authenticated;
revoke all on function private.calcular_radar_ocupacao_periodo_impl(uuid, uuid, date, date) from public, anon;
grant execute on function private.calcular_radar_ocupacao_periodo_impl(uuid, uuid, date, date) to authenticated;
revoke all on function private.calcular_oportunidades_comerciais_periodo_impl(uuid, uuid, date, date) from public, anon;
grant execute on function private.calcular_oportunidades_comerciais_periodo_impl(uuid, uuid, date, date) to authenticated;

revoke all on function public.calcular_capacidade_comercial_periodo(uuid, uuid, date, date) from public, anon;
grant execute on function public.calcular_capacidade_comercial_periodo(uuid, uuid, date, date) to authenticated;
revoke all on function public.calcular_radar_ocupacao_periodo(uuid, uuid, date, date) from public, anon;
grant execute on function public.calcular_radar_ocupacao_periodo(uuid, uuid, date, date) to authenticated;
revoke all on function public.calcular_oportunidades_comerciais_periodo(uuid, uuid, date, date) from public, anon;
grant execute on function public.calcular_oportunidades_comerciais_periodo(uuid, uuid, date, date) to authenticated;
