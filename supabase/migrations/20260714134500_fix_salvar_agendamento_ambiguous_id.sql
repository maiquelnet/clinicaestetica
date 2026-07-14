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

  select
    agendamentos.id,
    agendamentos.inicio_em,
    clientes.nome as cliente_nome
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
    where agendamentos.id = p_agendamento_id
      and agendamentos.clinica_id = p_clinica_id
    returning agendamentos.id into v_agendamento_id;

    if v_agendamento_id is null then
      raise exception 'Agendamento nao encontrado.';
    end if;
  end if;

  return v_agendamento_id;
end;
$$;

grant execute on function public.salvar_agendamento(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, numeric, text, text) to authenticated;
