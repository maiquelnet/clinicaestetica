alter table public.clientes
  add column if not exists intervalo_retorno_dias integer;

alter table public.servicos
  add column if not exists intervalo_retorno_dias integer;

alter table public.regras_mensagens
  add column if not exists janela_alerta_dias integer;

alter table public.clientes
  drop constraint if exists clientes_intervalo_retorno_dias_check,
  add constraint clientes_intervalo_retorno_dias_check
    check (intervalo_retorno_dias is null or intervalo_retorno_dias >= 0);

alter table public.servicos
  drop constraint if exists servicos_intervalo_retorno_dias_check,
  add constraint servicos_intervalo_retorno_dias_check
    check (intervalo_retorno_dias is null or intervalo_retorno_dias >= 0);

alter table public.regras_mensagens
  drop constraint if exists regras_mensagens_janela_alerta_dias_check,
  add constraint regras_mensagens_janela_alerta_dias_check
    check (janela_alerta_dias is null or janela_alerta_dias >= 0);

update public.regras_mensagens regras
set
  quantidade = 0,
  unidade = 'dias',
  direcao = 'depois',
  janela_alerta_dias = coalesce(regras.janela_alerta_dias, 7),
  atualizado_em = now()
from public.modelos_mensagens modelos
where modelos.id = regras.modelo_mensagem_id
  and modelos.tipo = 'aniversario';
