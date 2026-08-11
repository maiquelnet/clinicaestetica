create or replace function public.salvar_modelo_mensagem_e_regra(
  p_clinica_id uuid,
  p_modelo_id uuid default null,
  p_regra_id uuid default null,
  p_tipo text default '',
  p_nome text default '',
  p_texto text default '',
  p_modelo_ativo boolean default true,
  p_prioridade integer default 9,
  p_whatsapp_template_name text default null,
  p_whatsapp_template_language text default 'pt_BR',
  p_gatilho text default 'manual',
  p_quantidade integer default null,
  p_unidade text default null,
  p_direcao text default null,
  p_janela_alerta_dias integer default null,
  p_canal_padrao text default 'whatsapp_manual',
  p_automacao_iniciada_em timestamptz default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_modelo_id uuid;
  v_regra_id uuid;
begin
  if p_modelo_id is null then
    insert into public.modelos_mensagens (clinica_id, tipo, nome, texto, ativo, prioridade, whatsapp_template_name, whatsapp_template_language)
    values (p_clinica_id, p_tipo, p_nome, p_texto, p_modelo_ativo, p_prioridade, nullif(p_whatsapp_template_name, ''), coalesce(nullif(p_whatsapp_template_language, ''), 'pt_BR'))
    returning id into v_modelo_id;
  else
    update public.modelos_mensagens
      set tipo = p_tipo, nome = p_nome, texto = p_texto, ativo = p_modelo_ativo, prioridade = p_prioridade,
          whatsapp_template_name = nullif(p_whatsapp_template_name, ''),
          whatsapp_template_language = coalesce(nullif(p_whatsapp_template_language, ''), 'pt_BR'),
          atualizado_em = now()
      where id = p_modelo_id and clinica_id = p_clinica_id
      returning id into v_modelo_id;
  end if;

  if v_modelo_id is null then raise exception 'Modelo de mensagem nao encontrado para esta clinica.'; end if;

  if p_regra_id is null then
    insert into public.regras_mensagens (clinica_id, modelo_mensagem_id, gatilho, quantidade, unidade, direcao, janela_alerta_dias, canal_padrao, automacao_iniciada_em, ativo)
    values (p_clinica_id, v_modelo_id, p_gatilho, p_quantidade, p_unidade, p_direcao, p_janela_alerta_dias, p_canal_padrao, p_automacao_iniciada_em, p_modelo_ativo)
    returning id into v_regra_id;
  else
    update public.regras_mensagens
      set gatilho = p_gatilho, quantidade = p_quantidade, unidade = p_unidade, direcao = p_direcao,
          janela_alerta_dias = p_janela_alerta_dias, canal_padrao = p_canal_padrao,
          automacao_iniciada_em = p_automacao_iniciada_em, ativo = p_modelo_ativo, atualizado_em = now()
      where id = p_regra_id and clinica_id = p_clinica_id
      returning id into v_regra_id;
  end if;

  return jsonb_build_object('modelo_id', v_modelo_id, 'regra_id', v_regra_id);
end;
$$;
