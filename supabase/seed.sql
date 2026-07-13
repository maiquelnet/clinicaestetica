-- Seed inicial do painel administrativo.
-- Rode depois de criar o usuario em Supabase Auth.
-- Depois substitua <AUTH_USER_ID> no bloco final e execute apenas esse bloco de vinculo.

begin;

with clinic as (
  insert into public.clinicas (
    id,
    nome,
    nome_publico,
    email,
    cidade,
    estado,
    fuso_horario,
    ativo
  )
  values (
    '11111111-1111-4111-8111-111111111111',
    'Thais Schneider Estética',
    'Thais Schneider Estética',
    'tcschneiderster@gmail.com',
    'Porto Alegre',
    'RS',
    'America/Sao_Paulo',
    true
  )
  on conflict (id) do update set
    nome = excluded.nome,
    nome_publico = excluded.nome_publico,
    email = excluded.email,
    cidade = excluded.cidade,
    estado = excluded.estado,
    fuso_horario = excluded.fuso_horario,
    ativo = true,
    atualizado_em = now()
  returning id
),
seed_services(slug, categoria, nome, descricao, duracao_minutos, valor, preco_sob_consulta, observacao_preco) as (
  values
    ('depilacao_sobrancelha', 'Depilação', 'Sobrancelha', 'Depilação e acabamento para limpeza do desenho natural das sobrancelhas.', 30, 35::numeric, false, null),
    ('depilacao_buco_nariz', 'Depilação', 'Buço/Nariz', 'Remoção rápida de pelos no buço ou nariz.', 15, 10::numeric, false, null),
    ('depilacao_rosto_completo', 'Depilação', 'Rosto completo', 'Depilação facial completa para acabamento uniforme.', 45, 50::numeric, false, null),
    ('depilacao_axila', 'Depilação', 'Axila', 'Depilação de axilas com atendimento rápido e cuidadoso.', 20, 15::numeric, false, null),
    ('depilacao_virilha', 'Depilação', 'Virilha', 'Depilação de virilha com técnica cuidadosa.', 30, 50::numeric, false, null),
    ('depilacao_meia_perna', 'Depilação', '1/2 perna', 'Depilação de meia perna.', 30, 37::numeric, false, null),
    ('depilacao_perna_inteira', 'Depilação', 'Perna inteira', 'Depilação completa das pernas.', 45, 50::numeric, false, null),
    ('depilacao_completa', 'Depilação', 'Completa', 'Pacote de depilação completa conforme combinação no atendimento.', 90, 140::numeric, false, null),
    ('procedimentos_pacote_5_sessoes', 'Procedimentos', 'Pacote de 5 sessões', 'Pacote promocional para sequência de procedimentos estéticos.', 60, 400::numeric, false, 'Pacote de 5 sessões.'),
    ('procedimentos_peeling_diamante', 'Procedimentos', 'Peeling diamante', 'Procedimento para renovação superficial, textura e luminosidade da pele.', 60, 100::numeric, false, null),
    ('procedimentos_plasma_lifting', 'Procedimentos', 'Plasma lifting', 'Procedimento estético voltado para firmeza e revitalização da pele.', 60, 100::numeric, false, null),
    ('procedimentos_jato_plasma', 'Procedimentos', 'Jato de plasma', 'Procedimento definido após avaliação individual.', 60, null::numeric, true, 'Valor mediante avaliação.'),
    ('procedimentos_corrente_russa_radiofrequencia', 'Procedimentos', 'Corrente russa/radiofrequência', 'Procedimento corporal para estímulo, firmeza e cuidado estético.', 60, 100::numeric, false, null),
    ('procedimentos_endermoterapia', 'Procedimentos', 'Endermoterapia', 'Procedimento corporal com manobras mecânicas para cuidado estético.', 60, 100::numeric, false, null),
    ('procedimentos_vacuoterapia', 'Procedimentos', 'Vacuoterapia', 'Procedimento corporal com sucção controlada para cuidado estético.', 60, 100::numeric, false, null),
    ('procedimentos_pump_up', 'Procedimentos', 'Pump up', 'Procedimento corporal para estímulo e valorização do contorno.', 60, 80::numeric, false, null),
    ('micropigmentacao_sobrancelhas', 'Micropigmentação', 'Micropigmentação de sobrancelhas', 'Técnica para valorizar o desenho das sobrancelhas com acabamento delicado.', 120, 550::numeric, false, 'ou 2x R$ 300,00 / 3x R$ 210,00'),
    ('maquiagem_sem_cilios', 'Maquiagem', 'Sem aplicação de cílios', 'Maquiagem para eventos e ocasiões especiais, sem aplicação de cílios.', 90, 90::numeric, false, null),
    ('maquiagem_com_cilios', 'Maquiagem', 'Com aplicação de cílios', 'Maquiagem para eventos e ocasiões especiais, com aplicação de cílios.', 105, 100::numeric, false, null)
),
inserted_services as (
  insert into public.servicos (
    clinica_id,
    nome,
    categoria,
    descricao,
    duracao_minutos,
    preco_sob_consulta,
    observacao_preco,
    ativo
  )
  select
    clinic.id,
    seed_services.nome,
    seed_services.categoria,
    seed_services.descricao,
    seed_services.duracao_minutos,
    seed_services.preco_sob_consulta,
    seed_services.observacao_preco,
    true
  from seed_services
  cross join clinic
  where not exists (
    select 1
    from public.servicos existing
    where existing.clinica_id = clinic.id
      and lower(existing.nome) = lower(seed_services.nome)
      and coalesce(existing.categoria, '') = seed_services.categoria
      and existing.arquivado_em is null
  )
  returning id, clinica_id, nome
),
all_seed_services as (
  select servicos.id, servicos.clinica_id, servicos.nome, seed_services.valor, seed_services.preco_sob_consulta
  from public.servicos
  join seed_services on lower(seed_services.nome) = lower(servicos.nome)
  join clinic on clinic.id = servicos.clinica_id
)
insert into public.precos_servicos (clinica_id, servico_id, valor, inicio_validade)
select clinica_id, id, valor, current_date
from all_seed_services
where preco_sob_consulta = false
  and valor is not null
  and not exists (
    select 1
    from public.precos_servicos prices
    where prices.servico_id = all_seed_services.id
      and prices.fim_validade is null
  );

with templates(tipo, nome, texto, regra_gatilho, quantidade, unidade, direcao, janela_alerta_dias, prioridade) as (
  values
    ('confirmacao_agendamento', 'Confirmação de agendamento', 'Olá, {nome}! Seu horário na Thais Schneider Estética está confirmado para {data} às {hora}, para {servico}. Qualquer ajuste, me avise por aqui.', 'agendamento_criado', 0, 'horas', 'depois', null, 1),
    ('lembrete_agendamento', 'Lembrete de agendamento', 'Olá, {nome}! Passando para lembrar do seu horário na Thais Schneider Estética: {data} às {hora}, para {servico}. Te espero!', 'inicio_agendamento', 8, 'horas', 'antes', null, 2),
    ('pos_atendimento', 'Pós-atendimento crítico', 'Olá, {nome}! Tudo bem depois do seu atendimento? Se notar qualquer sensibilidade diferente, me chama por aqui.', 'inicio_agendamento', 2, 'horas', 'depois', null, 3),
    ('pedido_avaliacao', 'Pedido de avaliação', 'Olá, {nome}! Foi um prazer te atender. Se puder, deixe sua avaliação por aqui: {link_avaliacao_google}', 'inicio_agendamento', 2, 'horas', 'depois', null, 4),
    ('aniversario', 'Aniversário', 'Olá, {nome}! Passando para te desejar um feliz aniversário e um novo ciclo lindo.', 'aniversario', 0, 'dias', 'depois', 7, 5),
    ('lembrete_retorno', 'Lembrete de retorno', 'Olá, {nome}! Já faz um tempinho do seu último atendimento. Quer ver um novo horário para cuidar de você?', 'ultimo_agendamento', 20, 'dias', 'depois', null, 6),
    ('promocao_campanha', 'Promoção / campanha', 'Olá, {nome}! Tenho uma condição especial disponível para {campanha}. Me chama para saber mais.', 'manual', null, null, null, null, 9)
),
clinic as (
  select id from public.clinicas where id = '11111111-1111-4111-8111-111111111111'
),
inserted_templates as (
  insert into public.modelos_mensagens (clinica_id, tipo, nome, texto, ativo, prioridade)
  select clinic.id, templates.tipo, templates.nome, templates.texto, true, templates.prioridade
  from templates
  cross join clinic
  on conflict (clinica_id, tipo) do nothing
  returning id, clinica_id, tipo
)
insert into public.regras_mensagens (
  clinica_id,
  modelo_mensagem_id,
  gatilho,
  quantidade,
  unidade,
  direcao,
  janela_alerta_dias,
  canal_padrao,
  ativo
)
select
  clinic.id,
  modelos_mensagens.id,
  templates.regra_gatilho,
  templates.quantidade,
  templates.unidade,
  templates.direcao,
  templates.janela_alerta_dias,
  'whatsapp_manual',
  true
from templates
cross join clinic
join public.modelos_mensagens
  on modelos_mensagens.clinica_id = clinic.id
 and modelos_mensagens.tipo = templates.tipo
where not exists (
  select 1
  from public.regras_mensagens regras
  where regras.modelo_mensagem_id = modelos_mensagens.id
);

commit;

-- Vinculo manual do administrador:
-- 1. Crie/confirme o usuario em Authentication > Users.
-- 2. Copie o UUID do usuario.
-- 3. Troque <AUTH_USER_ID> e execute:
--
-- insert into public.perfis (id, nome, email, ativo)
-- values ('<AUTH_USER_ID>', 'Thais Schneider', 'tcschneiderster@gmail.com', true)
-- on conflict (id) do update set
--   nome = excluded.nome,
--   email = excluded.email,
--   ativo = true,
--   atualizado_em = now();
--
-- insert into public.usuarios_clinicas (clinica_id, perfil_id, papel, ativo)
-- values ('11111111-1111-4111-8111-111111111111', '<AUTH_USER_ID>', 'proprietario', true)
-- on conflict (clinica_id, perfil_id) do update set
--   papel = 'proprietario',
--   ativo = true,
--   atualizado_em = now();
