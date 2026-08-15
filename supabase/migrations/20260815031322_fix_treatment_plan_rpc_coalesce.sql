create or replace function public.salvar_plano_tratamento_com_cronograma(
  p_plano_id uuid,
  p_clinica_id uuid,
  p_cliente_id uuid,
  p_servico_id uuid,
  p_nome text,
  p_total_sessoes integer,
  p_valor_total numeric,
  p_valor_sessao numeric,
  p_status text,
  p_inicio_em date,
  p_horario_preferencial time,
  p_frequencia text,
  p_intervalo_dias integer,
  p_considerar_sabado boolean,
  p_considerar_domingo boolean,
  p_observacoes text,
  p_ocorrencias jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plano public.planos_tratamento%rowtype;
  v_item public.itens_plano_tratamento%rowtype;
  v_plano_id uuid;
  v_profissional_id uuid;
  v_agendamento_id uuid;
  v_timezone text;
  v_hoje date;
  v_ocorrencia record;
  v_conflito record;
  v_preservado boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessao expirada. Entre novamente no sistema.';
  end if;

  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso negado para a clinica informada.';
  end if;

  if not exists (
    select 1
    from public.usuarios_clinicas
    where clinica_id = p_clinica_id
      and perfil_id = (select auth.uid())
      and ativo = true
  ) then
    raise exception 'Seu usuario nao possui associacao profissional ativa nesta clinica.';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente_id and clinica_id = p_clinica_id) then
    raise exception 'Cliente nao encontrado nesta clinica.';
  end if;

  if not exists (
    select 1 from public.servicos
    where id = p_servico_id and clinica_id = p_clinica_id
      and ativo = true and arquivado_em is null
  ) then
    raise exception 'Servico ativo nao encontrado nesta clinica.';
  end if;

  if pg_catalog.btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Informe o nome do plano.';
  end if;

  if p_total_sessoes is null or p_total_sessoes < 1 then
    raise exception 'O plano precisa ter ao menos um atendimento.';
  end if;

  if p_status not in ('em_andamento', 'concluido', 'cancelado') then
    raise exception 'Status de plano invalido.';
  end if;

  if p_frequencia not in ('diario', 'semanal', 'mensal', 'intervalo') then
    raise exception 'Frequencia de tratamento invalida.';
  end if;

  if p_frequencia = 'intervalo' and coalesce(p_intervalo_dias, 0) < 1 then
    raise exception 'Informe um intervalo de dias valido.';
  end if;

  if p_inicio_em is null or p_horario_preferencial is null then
    raise exception 'Informe a data inicial e o horario do tratamento.';
  end if;

  select coalesce(fuso_horario, 'America/Sao_Paulo')
    into v_timezone
  from public.clinicas
  where id = p_clinica_id;
  v_hoje := pg_catalog.timezone(v_timezone, pg_catalog.now())::date;

  if p_plano_id is not null then
    select * into v_plano
    from public.planos_tratamento
    where id = p_plano_id and clinica_id = p_clinica_id and arquivado_em is null
    for update;

    if v_plano.id is null then
      raise exception 'Plano de tratamento nao encontrado.';
    end if;

    v_plano_id := v_plano.id;
    v_profissional_id := coalesce(v_plano.profissional_id, (select auth.uid()));
    if exists (
      select 1
      from public.itens_plano_tratamento
      where plano_tratamento_id = v_plano_id
        and numero_sessao > p_total_sessoes
        and arquivado_em is null
        and (
          ajuste_manual
          or situacao = 'aguardando_reagendamento'
          or (inicio_previsto_em at time zone v_timezone)::date < v_hoje
        )
    ) then
      raise exception 'O total nao pode remover atendimentos passados, ajustados ou aguardando reagendamento.';
    end if;

    update public.planos_tratamento
    set cliente_id = p_cliente_id,
        servico_id = p_servico_id,
        nome = pg_catalog.btrim(p_nome),
        titulo = pg_catalog.btrim(p_nome),
        total_sessoes = p_total_sessoes,
        valor_total = coalesce(p_valor_total, 0),
        valor_sessao = coalesce(p_valor_sessao, 0),
        status = p_status,
        inicio_em = p_inicio_em,
        frequencia = p_frequencia,
        intervalo_dias = case when p_frequencia = 'intervalo' then p_intervalo_dias else null end,
        horario_preferencial = p_horario_preferencial,
        considerar_sabado = coalesce(p_considerar_sabado, false),
        considerar_domingo = coalesce(p_considerar_domingo, false),
        profissional_id = v_profissional_id,
        observacoes = nullif(pg_catalog.btrim(p_observacoes), ''),
        atualizado_em = pg_catalog.now()
    where id = v_plano_id;
  else
    v_profissional_id := (select auth.uid());

    insert into public.planos_tratamento (
      clinica_id, cliente_id, servico_id, profissional_id, nome, titulo,
      total_sessoes, sessoes_realizadas, valor_total, valor_sessao, status,
      inicio_em, frequencia, intervalo_dias, horario_preferencial,
      considerar_sabado, considerar_domingo, observacoes
    ) values (
      p_clinica_id, p_cliente_id, p_servico_id, v_profissional_id,
      pg_catalog.btrim(p_nome), pg_catalog.btrim(p_nome), p_total_sessoes, 0,
      coalesce(p_valor_total, 0), coalesce(p_valor_sessao, 0), p_status,
      p_inicio_em, p_frequencia,
      case when p_frequencia = 'intervalo' then p_intervalo_dias else null end,
      p_horario_preferencial, coalesce(p_considerar_sabado, false),
      coalesce(p_considerar_domingo, false), nullif(pg_catalog.btrim(p_observacoes), '')
    ) returning id into v_plano_id;
  end if;

  perform pg_catalog.set_config('app.tratamento_cronograma', '1', true);

  if p_status in ('concluido', 'cancelado') then
    update public.agendamentos a
    set status = 'cancelado', atualizado_em = pg_catalog.now()
    from public.itens_plano_tratamento i
    where i.plano_tratamento_id = v_plano_id
      and i.agendamento_id = a.id
      and i.arquivado_em is null
      and (a.inicio_em at time zone v_timezone)::date >= v_hoje
      and a.status not in ('cancelado', 'concluido');

    update public.itens_plano_tratamento
    set situacao = 'cancelado_plano', atualizado_em = pg_catalog.now()
    where plano_tratamento_id = v_plano_id
      and arquivado_em is null
      and (inicio_previsto_em is null or (inicio_previsto_em at time zone v_timezone)::date >= v_hoje);

    update public.planos_tratamento
    set fim_previsto_em = null, atualizado_em = pg_catalog.now()
    where id = v_plano_id;

    return pg_catalog.jsonb_build_object('plano_id', v_plano_id, 'profissional_id', v_profissional_id);
  end if;

  if p_ocorrencias is null or pg_catalog.jsonb_typeof(p_ocorrencias) <> 'array' then
    raise exception 'Cronograma de atendimentos invalido.';
  end if;

  if pg_catalog.jsonb_array_length(p_ocorrencias) <> p_total_sessoes then
    raise exception 'O cronograma precisa conter exatamente % atendimentos.', p_total_sessoes;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_ocorrencias)
      as o(numero_sessao integer, inicio_em timestamptz, fim_em timestamptz, ajuste_manual boolean)
    group by o.numero_sessao
    having o.numero_sessao is null
      or o.numero_sessao < 1
      or o.numero_sessao > p_total_sessoes
      or pg_catalog.count(*) > 1
  ) then
    raise exception 'O cronograma possui numeros de atendimento invalidos ou repetidos.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_ocorrencias)
      as o(numero_sessao integer, inicio_em timestamptz, fim_em timestamptz, ajuste_manual boolean)
    where o.inicio_em is null or o.fim_em is null or o.fim_em <= o.inicio_em
  ) then
    raise exception 'O cronograma possui um periodo de atendimento invalido.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_ocorrencias)
      as a(numero_sessao integer, inicio_em timestamptz, fim_em timestamptz, ajuste_manual boolean)
    join pg_catalog.jsonb_to_recordset(p_ocorrencias)
      as b(numero_sessao integer, inicio_em timestamptz, fim_em timestamptz, ajuste_manual boolean)
      on a.numero_sessao < b.numero_sessao
     and a.inicio_em < b.fim_em
     and a.fim_em > b.inicio_em
  ) then
    raise exception 'Existem atendimentos sobrepostos dentro do proprio cronograma.';
  end if;

  select a.id, a.inicio_em, c.nome as cliente_nome
    into v_conflito
  from public.agendamentos a
  left join public.clientes c on c.id = a.cliente_id
  where a.clinica_id = p_clinica_id
    and a.arquivado_em is null
    and a.status not in ('cancelado', 'concluido')
    and not exists (
      select 1 from public.itens_plano_tratamento i
      where i.plano_tratamento_id = v_plano_id and i.agendamento_id = a.id
    )
    and exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_ocorrencias)
        as o(numero_sessao integer, inicio_em timestamptz, fim_em timestamptz, ajuste_manual boolean)
      where o.inicio_em < a.fim_em and o.fim_em > a.inicio_em
    )
  limit 1;

  if v_conflito.id is not null then
    raise exception 'Conflito com %, as %.',
      coalesce(v_conflito.cliente_nome, 'agendamento'),
      pg_catalog.to_char(v_conflito.inicio_em at time zone v_timezone, 'DD/MM/YYYY HH24:MI');
  end if;

  v_conflito := null;
  select b.id, b.inicio_em, b.titulo as cliente_nome
    into v_conflito
  from public.bloqueios_agenda b
  where b.clinica_id = p_clinica_id
    and exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_ocorrencias)
        as o(numero_sessao integer, inicio_em timestamptz, fim_em timestamptz, ajuste_manual boolean)
      where o.inicio_em < b.fim_em and o.fim_em > b.inicio_em
    )
  limit 1;

  if v_conflito.id is not null then
    raise exception 'Conflito com bloqueio %, as %.',
      coalesce(v_conflito.cliente_nome, 'da agenda'),
      pg_catalog.to_char(v_conflito.inicio_em at time zone v_timezone, 'DD/MM/YYYY HH24:MI');
  end if;

  for v_ocorrencia in
    select *
    from pg_catalog.jsonb_to_recordset(p_ocorrencias)
      as o(numero_sessao integer, inicio_em timestamptz, fim_em timestamptz, ajuste_manual boolean)
    order by numero_sessao
  loop
    v_item := null;
    select * into v_item
    from public.itens_plano_tratamento
    where plano_tratamento_id = v_plano_id
      and numero_sessao = v_ocorrencia.numero_sessao
    for update;

    v_preservado := v_item.id is not null and (
      v_item.ajuste_manual
      or v_item.situacao = 'aguardando_reagendamento'
      or (v_item.inicio_previsto_em at time zone v_timezone)::date < v_hoje
    );

    if v_preservado then
      if v_item.inicio_previsto_em is distinct from v_ocorrencia.inicio_em
        or v_item.fim_previsto_em is distinct from v_ocorrencia.fim_em then
        raise exception 'O atendimento % esta preservado e nao pode ser recalculado pelo plano.', v_ocorrencia.numero_sessao;
      end if;
      continue;
    end if;

    v_agendamento_id := v_item.agendamento_id;
    if v_agendamento_id is null then
      insert into public.agendamentos (
        clinica_id, cliente_id, servico_id, profissional_id, inicio_em, fim_em,
        status, valor_aplicado, observacoes
      ) values (
        p_clinica_id, p_cliente_id, p_servico_id, v_profissional_id,
        v_ocorrencia.inicio_em, v_ocorrencia.fim_em, 'agendado',
        coalesce(p_valor_sessao, 0),
        pg_catalog.format('Tratamento: %s - Atendimento %s/%s', pg_catalog.btrim(p_nome), v_ocorrencia.numero_sessao, p_total_sessoes)
      ) returning id into v_agendamento_id;
    else
      update public.agendamentos
      set cliente_id = p_cliente_id,
          servico_id = p_servico_id,
          profissional_id = v_profissional_id,
          inicio_em = v_ocorrencia.inicio_em,
          fim_em = v_ocorrencia.fim_em,
          status = 'agendado',
          valor_aplicado = coalesce(p_valor_sessao, 0),
          observacoes = pg_catalog.format('Tratamento: %s - Atendimento %s/%s', pg_catalog.btrim(p_nome), v_ocorrencia.numero_sessao, p_total_sessoes),
          atualizado_em = pg_catalog.now()
      where id = v_agendamento_id and clinica_id = p_clinica_id;
    end if;

    insert into public.itens_plano_tratamento (
      clinica_id, plano_tratamento_id, servico_id, descricao, quantidade_sessoes,
      intervalo_dias, ordem, agendamento_id, numero_sessao, status,
      inicio_previsto_em, fim_previsto_em, ajuste_manual, situacao, arquivado_em
    ) values (
      p_clinica_id, v_plano_id, p_servico_id,
      pg_catalog.format('Atendimento %s/%s', v_ocorrencia.numero_sessao, p_total_sessoes),
      1, case when p_frequencia = 'intervalo' then p_intervalo_dias else null end,
      v_ocorrencia.numero_sessao, v_agendamento_id, v_ocorrencia.numero_sessao,
      'pendente', v_ocorrencia.inicio_em, v_ocorrencia.fim_em,
      coalesce(v_ocorrencia.ajuste_manual, false), 'planejado', null
    )
    on conflict (plano_tratamento_id, numero_sessao) where numero_sessao is not null
    do update set
      servico_id = excluded.servico_id,
      descricao = excluded.descricao,
      intervalo_dias = excluded.intervalo_dias,
      ordem = excluded.ordem,
      agendamento_id = excluded.agendamento_id,
      status = excluded.status,
      inicio_previsto_em = excluded.inicio_previsto_em,
      fim_previsto_em = excluded.fim_previsto_em,
      ajuste_manual = excluded.ajuste_manual,
      situacao = excluded.situacao,
      arquivado_em = null,
      atualizado_em = pg_catalog.now();
  end loop;

  update public.agendamentos a
  set status = 'cancelado', atualizado_em = pg_catalog.now()
  from public.itens_plano_tratamento i
  where i.plano_tratamento_id = v_plano_id
    and i.numero_sessao > p_total_sessoes
    and i.agendamento_id = a.id
    and a.status not in ('cancelado', 'concluido');

  update public.itens_plano_tratamento
  set situacao = 'cancelado_plano', arquivado_em = pg_catalog.now(), atualizado_em = pg_catalog.now()
  where plano_tratamento_id = v_plano_id
    and numero_sessao > p_total_sessoes
    and arquivado_em is null;

  update public.planos_tratamento
  set fim_previsto_em = (
        select pg_catalog.max((inicio_previsto_em at time zone v_timezone)::date)
        from public.itens_plano_tratamento
        where plano_tratamento_id = v_plano_id
          and arquivado_em is null
          and situacao <> 'cancelado_plano'
      ),
      atualizado_em = pg_catalog.now()
  where id = v_plano_id;

  return pg_catalog.jsonb_build_object('plano_id', v_plano_id, 'profissional_id', v_profissional_id);
end;
$$;
