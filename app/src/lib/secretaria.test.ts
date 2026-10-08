import { strict as assert } from 'node:assert'
import test from 'node:test'
import type { Opportunity } from './capacity.ts'
import { MAX_CANDIDATOS_PLANO, normalizePlanSummaries, selectDeterministicPlanCandidates } from './secretaria.ts'

function opportunity(id: string, clienteId: string, origem: 'lista_espera' | 'retorno' = 'lista_espera'): Opportunity {
  return {
    id,
    cliente_id: clienteId,
    cliente_nome: clienteId,
    telefone: '5511999999999',
    servico_id: 'service-1',
    servico_nome: 'Serviço',
    duracao_minutos: 60,
    origem,
    motivo: 'Compatível com a janela livre.',
    retorno_devido_em: null,
    atraso_retorno_dias: null,
    janelas_compativeis: [{ inicio_em: '2026-09-10T13:00:00Z', fim_em: '2026-09-10T14:00:00Z', inicio: '10:00', fim: '11:00' }],
    whatsapp_opt_in_status: 'opted_in',
    aceita_marketing: true,
    ultima_mensagem_em: null,
  }
}

test('seleção determinística preserva a ordem canônica e limita a cinco clientes', () => {
  const result = selectDeterministicPlanCandidates([
    opportunity('wait-1', 'client-1'),
    opportunity('wait-2', 'client-2'),
    opportunity('return-1', 'client-1', 'retorno'),
    opportunity('wait-3', 'client-3'),
    opportunity('wait-4', 'client-4'),
    opportunity('wait-5', 'client-5'),
    opportunity('wait-6', 'client-6'),
  ])

  assert.equal(MAX_CANDIDATOS_PLANO, 5)
  assert.deepEqual(result.map((item) => item.id), ['wait-1', 'wait-2', 'wait-3', 'wait-4', 'wait-5'])
  assert.equal(new Set(result.map((item) => item.cliente_id)).size, 5)
})

test('seleção retorna todos os candidatos quando há menos de cinco clientes', () => {
  const result = selectDeterministicPlanCandidates([
    opportunity('wait-1', 'client-1'),
    opportunity('return-2', 'client-2', 'retorno'),
  ])
  assert.deepEqual(result.map((item) => item.id), ['wait-1', 'return-2'])
})

test('normalizador aceita a lista de planos persistidos e preserva os estados válidos', () => {
  const summaries = normalizePlanSummaries([{
    id: 'plan-1',
    data_alvo: '2026-09-10',
    status: 'RASCUNHO',
    capacidade_minutos_snapshot: 480,
    ocupado_minutos_snapshot: 120,
    livre_minutos_snapshot: 360,
    ocupacao_percentual_snapshot: 25,
    classificacao_snapshot: 'AGENDA_COM_OPORTUNIDADES',
    total_oportunidades_snapshot: 7,
    itens_selecionados: 5,
    atualizado_em: '2026-09-07T12:00:00Z',
  }, {
    id: 'plan-2',
    data_alvo: '2026-09-11',
    status: 'APROVADO',
    capacidade_minutos_snapshot: 300,
    ocupado_minutos_snapshot: 180,
    livre_minutos_snapshot: 120,
    ocupacao_percentual_snapshot: '60',
    classificacao_snapshot: 'AINDA_HA_DISPONIBILIDADE',
    total_oportunidades_snapshot: 2,
    itens_selecionados: 2,
    atualizado_em: '2026-09-07T12:00:00Z',
  }])

  assert.deepEqual(summaries.map((item) => item.status), ['RASCUNHO', 'APROVADO'])
  assert.equal(summaries[1]?.ocupacao_percentual_snapshot, 60)
})
