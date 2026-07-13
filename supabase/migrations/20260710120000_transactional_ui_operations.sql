create or replace function public.salvar_agendamento(
  p_agendamento_id uuid,
  p_clinica_id uuid,
  p_cliente_id uuid,
  p_servico_id uuid,
  p_profissional_id uuid,
  p_inicio_em timestamptz,
  p_fim_em timestamptz,
  p_valor_aplicado numeric,
  p_status text,
  p_observacoes text
)
returns uuid
language plpgsql
as $$
declare
  v_agendamento_id uuid;
  v_conflict record;
begin
  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso negado para a clinica informada.';
  end if;

  if p_fim_em <= p_inicio_em then
    raise exception 'O horario final precisa ser depois do inicio.';
  end if;

  select id, inicio_em, clientes.nome as cliente_nome
    into v_conflict
  from public.agendamentos
  left join public.clientes on clientes.id = agendamentos.cliente_id
  where agendamentos.clinica_id = p_clinica_id
    and agendamentos.arquivado_em is null
    and agendamentos.status not in ('cancelado', 'concluido')
    and (p_agendamento_id is null or agendamentos.id <> p_agendamento_id)
    and p_inicio_em < agendamentos.fim_em
    and p_fim_em > agendamentos.inicio_em
  limit 1;

  if v_conflict.id is not null then
    raise exception 'Conflito com %, as %.', coalesce(v_conflict.cliente_nome, 'agendamento'), to_char(v_conflict.inicio_em at time zone 'America/Sao_Paulo', 'HH24:MI');
  end if;

  if p_agendamento_id is null then
    insert into public.agendamentos (
      clinica_id,
      cliente_id,
      servico_id,
      profissional_id,
      inicio_em,
      fim_em,
      valor_aplicado,
      status,
      observacoes
    )
    values (
      p_clinica_id,
      p_cliente_id,
      p_servico_id,
      p_profissional_id,
      p_inicio_em,
      p_fim_em,
      p_valor_aplicado,
      p_status,
      nullif(trim(p_observacoes), '')
    )
    returning id into v_agendamento_id;
  else
    update public.agendamentos
    set cliente_id = p_cliente_id,
        servico_id = p_servico_id,
        profissional_id = p_profissional_id,
        inicio_em = p_inicio_em,
        fim_em = p_fim_em,
        valor_aplicado = p_valor_aplicado,
        status = p_status,
        observacoes = nullif(trim(p_observacoes), ''),
        atualizado_em = now()
    where id = p_agendamento_id
      and clinica_id = p_clinica_id
    returning id into v_agendamento_id;

    if v_agendamento_id is null then
      raise exception 'Agendamento nao encontrado.';
    end if;
  end if;

  return v_agendamento_id;
end;
$$;

create or replace function public.confirmar_lista_espera(
  p_lista_espera_id uuid,
  p_profissional_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_entry public.lista_espera%rowtype;
  v_service public.servicos%rowtype;
  v_price numeric := 0;
  v_agendamento_id uuid;
  v_conflict record;
begin
  select *
    into v_entry
  from public.lista_espera
  where id = p_lista_espera_id
    and arquivado_em is null
  for update;

  if v_entry.id is null then
    raise exception 'Reserva nao encontrada.';
  end if;

  if not private.usuario_tem_acesso_clinica(v_entry.clinica_id) then
    raise exception 'Acesso negado para a clinica informada.';
  end if;

  if v_entry.status <> 'em_espera' then
    raise exception 'A reserva nao esta em espera.';
  end if;

  if v_entry.fim_desejado_em <= v_entry.inicio_desejado_em then
    raise exception 'O horario final precisa ser depois do inicio.';
  end if;

  select id, inicio_em, clientes.nome as cliente_nome
    into v_conflict
  from public.agendamentos
  left join public.clientes on clientes.id = agendamentos.cliente_id
  where agendamentos.clinica_id = v_entry.clinica_id
    and agendamentos.arquivado_em is null
    and agendamentos.status not in ('cancelado', 'concluido')
    and v_entry.inicio_desejado_em < agendamentos.fim_em
    and v_entry.fim_desejado_em > agendamentos.inicio_em
  limit 1;

  if v_conflict.id is not null then
    raise exception 'Conflito com % em %.', coalesce(v_conflict.cliente_nome, 'agendamento'), to_char(v_conflict.inicio_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  end if;

  if v_entry.servico_id is not null then
    select *
      into v_service
    from public.servicos
    where id = v_entry.servico_id;

    select coalesce(valor, 0)
      into v_price
    from public.precos_servicos
    where servico_id = v_entry.servico_id
      and fim_validade is null
    order by inicio_validade desc
    limit 1;
  end if;

  insert into public.agendamentos (
    clinica_id,
    cliente_id,
    servico_id,
    profissional_id,
    inicio_em,
    fim_em,
    status,
    valor_aplicado,
    observacoes
  )
  values (
    v_entry.clinica_id,
    v_entry.cliente_id,
    v_entry.servico_id,
    p_profissional_id,
    v_entry.inicio_desejado_em,
    v_entry.fim_desejado_em,
    'agendado',
    coalesce(v_price, 0),
    v_entry.observacoes
  )
  returning id into v_agendamento_id;

  update public.lista_espera
  set status = 'confirmado',
      agendamento_id = v_agendamento_id,
      atualizado_em = now()
  where id = v_entry.id;

  return v_agendamento_id;
end;
$$;

create or replace function public.salvar_servico_com_preco(
  p_servico_id uuid,
  p_clinica_id uuid,
  p_nome text,
  p_categoria text,
  p_descricao text,
  p_duracao_minutos integer,
  p_intervalo_retorno_dias integer,
  p_preco_sob_consulta boolean,
  p_observacao_preco text,
  p_ativo boolean,
  p_valor numeric,
  p_inicio_validade date
)
returns uuid
language plpgsql
as $$
declare
  v_servico_id uuid;
  v_current numeric;
begin
  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso negado para a clinica informada.';
  end if;

  if nullif(trim(p_nome), '') is null then
    raise exception 'Informe o nome.';
  end if;

  if p_duracao_minutos <= 0 then
    raise exception 'A duracao precisa ser maior que zero.';
  end if;

  if p_servico_id is null then
    insert into public.servicos (
      clinica_id,
      nome,
      categoria,
      descricao,
      duracao_minutos,
      intervalo_retorno_dias,
      preco_sob_consulta,
      observacao_preco,
      ativo
    )
    values (
      p_clinica_id,
      trim(p_nome),
      nullif(trim(p_categoria), ''),
      nullif(trim(p_descricao), ''),
      p_duracao_minutos,
      p_intervalo_retorno_dias,
      p_preco_sob_consulta,
      nullif(trim(p_observacao_preco), ''),
      p_ativo
    )
    returning id into v_servico_id;
  else
    update public.servicos
    set nome = trim(p_nome),
        categoria = nullif(trim(p_categoria), ''),
        descricao = nullif(trim(p_descricao), ''),
        duracao_minutos = p_duracao_minutos,
        intervalo_retorno_dias = p_intervalo_retorno_dias,
        preco_sob_consulta = p_preco_sob_consulta,
        observacao_preco = nullif(trim(p_observacao_preco), ''),
        ativo = p_ativo,
        atualizado_em = now()
    where id = p_servico_id
      and clinica_id = p_clinica_id
    returning id into v_servico_id;

    if v_servico_id is null then
      raise exception 'Servico nao encontrado.';
    end if;
  end if;

  select valor
    into v_current
  from public.precos_servicos
  where servico_id = v_servico_id
    and fim_validade is null
  order by inicio_validade desc
  limit 1;

  if p_preco_sob_consulta then
    update public.precos_servicos
    set fim_validade = p_inicio_validade
    where servico_id = v_servico_id
      and fim_validade is null;
  elsif p_valor is not null and (v_current is null or v_current <> p_valor) then
    update public.precos_servicos
    set fim_validade = p_inicio_validade
    where servico_id = v_servico_id
      and fim_validade is null;

    insert into public.precos_servicos (clinica_id, servico_id, valor, inicio_validade)
    values (p_clinica_id, v_servico_id, p_valor, p_inicio_validade);
  end if;

  return v_servico_id;
end;
$$;

create or replace function public.salvar_campanha_com_destinatarios(
  p_campanha_id uuid,
  p_clinica_id uuid,
  p_modelo_mensagem_id uuid,
  p_titulo text,
  p_mensagem text,
  p_publico text,
  p_status text,
  p_criado_por uuid
)
returns uuid
language plpgsql
as $$
declare
  v_campanha_id uuid;
begin
  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso negado para a clinica informada.';
  end if;

  if nullif(trim(p_titulo), '') is null or nullif(trim(p_mensagem), '') is null then
    raise exception 'Informe titulo e mensagem.';
  end if;

  if p_campanha_id is null then
    insert into public.campanhas (
      clinica_id,
      modelo_mensagem_id,
      titulo,
      mensagem,
      publico,
      status,
      criado_por
    )
    values (
      p_clinica_id,
      p_modelo_mensagem_id,
      trim(p_titulo),
      trim(p_mensagem),
      p_publico,
      p_status,
      p_criado_por
    )
    returning id into v_campanha_id;
  else
    update public.campanhas
    set modelo_mensagem_id = p_modelo_mensagem_id,
        titulo = trim(p_titulo),
        mensagem = trim(p_mensagem),
        publico = p_publico,
        status = p_status,
        atualizado_em = now()
    where id = p_campanha_id
      and clinica_id = p_clinica_id
    returning id into v_campanha_id;

    if v_campanha_id is null then
      raise exception 'Campanha nao encontrada.';
    end if;
  end if;

  insert into public.destinatarios_campanhas (
    clinica_id,
    campanha_id,
    cliente_id,
    texto,
    status,
    atualizado_em
  )
  select
    p_clinica_id,
    v_campanha_id,
    clientes.id,
    replace(trim(p_mensagem), '{nome}', clientes.nome),
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
    )
  on conflict (campanha_id, cliente_id) do update set
    texto = excluded.texto,
    atualizado_em = now();

  return v_campanha_id;
end;
$$;

grant execute on function public.salvar_agendamento(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, numeric, text, text) to authenticated;
grant execute on function public.confirmar_lista_espera(uuid, uuid) to authenticated;
grant execute on function public.salvar_servico_com_preco(uuid, uuid, text, text, text, integer, integer, boolean, text, boolean, numeric, date) to authenticated;
grant execute on function public.salvar_campanha_com_destinatarios(uuid, uuid, uuid, text, text, text, text, uuid) to authenticated;
