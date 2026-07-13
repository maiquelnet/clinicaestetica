begin;

create temp table tmp_seed_services (
  slug text primary key,
  categoria text not null,
  nome text not null,
  descricao text,
  duracao_minutos integer not null,
  valor numeric,
  preco_sob_consulta boolean not null,
  observacao_preco text
) on commit drop;

insert into tmp_seed_services (slug, categoria, nome, descricao, duracao_minutos, valor, preco_sob_consulta, observacao_preco)
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
  ('maquiagem_com_cilios', 'Maquiagem', 'Com aplicação de cílios', 'Maquiagem para eventos e ocasiões especiais, com aplicação de cílios.', 105, 100::numeric, false, null);

insert into public.servicos (
  clinica_id,
  nome,
  categoria,
  descricao,
  duracao_minutos,
  preco_sob_consulta,
  observacao_preco,
  ativo,
  atualizado_em
)
select
  clinicas.id,
  seed.nome,
  seed.categoria,
  seed.descricao,
  seed.duracao_minutos,
  seed.preco_sob_consulta,
  seed.observacao_preco,
  true,
  now()
from tmp_seed_services seed
cross join public.clinicas
where clinicas.id = '11111111-1111-4111-8111-111111111111'
  and not exists (
    select 1
    from public.servicos existing
    where existing.clinica_id = clinicas.id
      and lower(existing.nome) = lower(seed.nome)
      and coalesce(lower(existing.categoria), '') = lower(seed.categoria)
      and existing.arquivado_em is null
  );

update public.servicos servicos
set
  descricao = seed.descricao,
  duracao_minutos = seed.duracao_minutos,
  preco_sob_consulta = seed.preco_sob_consulta,
  observacao_preco = seed.observacao_preco,
  ativo = true,
  atualizado_em = now()
from tmp_seed_services seed
where servicos.clinica_id = '11111111-1111-4111-8111-111111111111'
  and lower(servicos.nome) = lower(seed.nome)
  and coalesce(lower(servicos.categoria), '') = lower(seed.categoria)
  and servicos.arquivado_em is null;

update public.precos_servicos prices
set fim_validade = current_date
from public.servicos servicos
join tmp_seed_services seed
  on lower(seed.nome) = lower(servicos.nome)
 and lower(seed.categoria) = lower(coalesce(servicos.categoria, ''))
where prices.servico_id = servicos.id
  and servicos.clinica_id = '11111111-1111-4111-8111-111111111111'
  and prices.fim_validade is null
  and seed.preco_sob_consulta = false
  and seed.valor is not null
  and prices.valor <> seed.valor;

insert into public.precos_servicos (clinica_id, servico_id, valor, inicio_validade)
select servicos.clinica_id, servicos.id, seed.valor, current_date
from public.servicos servicos
join tmp_seed_services seed
  on lower(seed.nome) = lower(servicos.nome)
 and lower(seed.categoria) = lower(coalesce(servicos.categoria, ''))
where servicos.clinica_id = '11111111-1111-4111-8111-111111111111'
  and servicos.arquivado_em is null
  and seed.preco_sob_consulta = false
  and seed.valor is not null
  and not exists (
    select 1
    from public.precos_servicos prices
    where prices.servico_id = servicos.id
      and prices.fim_validade is null
      and prices.valor = seed.valor
  );

commit;
