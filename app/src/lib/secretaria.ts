import type { CommercialWindow, Opportunity } from './capacity'

export const MAX_CANDIDATOS_PLANO = 5

export type ActionPlanStatus = 'RASCUNHO' | 'APROVADO' | 'CANCELADO'
export type ActionPlanItemStatus = 'SELECIONADO' | 'REMOVIDO' | 'INVALIDO'
export type SecretariaActivityType =
  | 'PLANO_CRIADO'
  | 'PLANO_ATUALIZADO'
  | 'PLANO_APROVADO'
  | 'PLANO_CANCELADO'
  | 'CANDIDATO_REMOVIDO'
  | 'CANDIDATO_INVALIDADO'

export type ActionPlanItem = {
  id: string
  plano_id: string
  cliente_id: string
  cliente_nome: string
  telefone: string
  whatsapp_opt_in_status: string
  aceita_marketing: boolean
  servico_id: string
  servico_nome: string
  origem: 'lista_espera' | 'retorno'
  oportunidade_id_snapshot: string
  lista_espera_id: string | null
  motivo: string
  duracao_minutos: number
  retorno_devido_em: string | null
  atraso_retorno_dias: number | null
  janelas_compativeis: CommercialWindow[]
  ordem: number
  status: ActionPlanItemStatus
  motivo_invalidacao: string | null
  criado_em: string
  atualizado_em: string
}

export type ActionPlan = {
  id: string
  clinica_id: string
  profissional_id: string
  data_alvo: string
  status: ActionPlanStatus
  capacidade_minutos_snapshot: number
  ocupado_minutos_snapshot: number
  livre_minutos_snapshot: number
  ocupacao_percentual_snapshot: number | null
  classificacao_snapshot: string
  fonte_disponibilidade_snapshot: 'semanal' | 'excecao'
  total_oportunidades_snapshot: number
  criado_em: string
  atualizado_em: string
  aprovado_em: string | null
  aprovado_por: string | null
  cancelado_em: string | null
  cancelado_por: string | null
  criado_por: string
  itens_selecionados: number
  itens: ActionPlanItem[]
}

export type ActionPlanSummary = {
  id: string
  data_alvo: string
  status: ActionPlanStatus
  capacidade_minutos_snapshot: number
  ocupado_minutos_snapshot: number
  livre_minutos_snapshot: number
  ocupacao_percentual_snapshot: number | null
  classificacao_snapshot: string
  total_oportunidades_snapshot: number
  itens_selecionados: number
  atualizado_em: string
}

export type PlanValidationResult = {
  plano: ActionPlan
  agenda_mudou: boolean
  dia_merece_atencao: boolean
  itens_invalidados: number
  mensagem: string
}

export type PlanUpdateResult = PlanValidationResult & {
  atualizado: boolean
  itens_adicionados: number
}

export type PlanApprovalResult = {
  aprovado: boolean
  agenda_mudou: boolean
  dia_merece_atencao: boolean
  itens_invalidados: number
  plano: ActionPlan
  mensagem: string
}

export function selectDeterministicPlanCandidates(opportunities: Opportunity[]): Opportunity[] {
  const clients = new Set<string>()
  return opportunities.filter((opportunity) => {
    if (clients.has(opportunity.cliente_id) || clients.size >= MAX_CANDIDATOS_PLANO) return false
    clients.add(opportunity.cliente_id)
    return true
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Contrato inválido: ${field}.`)
  return value
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function numberValue(value: unknown, field: string): number {
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(result)) throw new Error(`Contrato inválido: ${field}.`)
  return result
}

function nullableNumberValue(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null
  return numberValue(value, field)
}

function planStatusValue(value: unknown): ActionPlanStatus {
  if (value === 'RASCUNHO' || value === 'APROVADO' || value === 'CANCELADO') return value
  throw new Error('Contrato inválido: plano.status.')
}

function itemStatusValue(value: unknown): ActionPlanItemStatus {
  if (value === 'SELECIONADO' || value === 'REMOVIDO' || value === 'INVALIDO') return value
  throw new Error('Contrato inválido: plano item.status.')
}

function originValue(value: unknown): 'lista_espera' | 'retorno' {
  if (value === 'lista_espera' || value === 'retorno') return value
  throw new Error('Contrato inválido: plano item.origem.')
}

function sourceValue(value: unknown): 'semanal' | 'excecao' {
  if (value === 'semanal' || value === 'excecao') return value
  throw new Error('Contrato inválido: plano.fonte_disponibilidade_snapshot.')
}

function windowsValue(value: unknown): CommercialWindow[] {
  if (!Array.isArray(value)) throw new Error('Contrato inválido: plano item.janelas_compativeis.')
  return value.map((item) => {
    const record = asRecord(item)
    if (!record) throw new Error('Contrato inválido: janela compatível.')
    return {
      inicio_em: stringValue(record.inicio_em, 'janela.inicio_em'),
      fim_em: stringValue(record.fim_em, 'janela.fim_em'),
      inicio: stringValue(record.inicio, 'janela.inicio'),
      fim: stringValue(record.fim, 'janela.fim'),
    }
  })
}

function normalizePlanItem(value: unknown): ActionPlanItem {
  const record = asRecord(value)
  if (!record) throw new Error('Contrato inválido: plano item.')
  return {
    id: stringValue(record.id, 'plano item.id'),
    plano_id: stringValue(record.plano_id, 'plano item.plano_id'),
    cliente_id: stringValue(record.cliente_id, 'plano item.cliente_id'),
    cliente_nome: stringValue(record.cliente_nome, 'plano item.cliente_nome'),
    telefone: stringValue(record.telefone, 'plano item.telefone'),
    whatsapp_opt_in_status: stringValue(record.whatsapp_opt_in_status, 'plano item.whatsapp_opt_in_status'),
    aceita_marketing: record.aceita_marketing === true,
    servico_id: stringValue(record.servico_id, 'plano item.servico_id'),
    servico_nome: stringValue(record.servico_nome, 'plano item.servico_nome'),
    origem: originValue(record.origem),
    oportunidade_id_snapshot: stringValue(record.oportunidade_id_snapshot, 'plano item.oportunidade_id_snapshot'),
    lista_espera_id: nullableStringValue(record.lista_espera_id),
    motivo: stringValue(record.motivo, 'plano item.motivo'),
    duracao_minutos: numberValue(record.duracao_minutos, 'plano item.duracao_minutos'),
    retorno_devido_em: nullableStringValue(record.retorno_devido_em),
    atraso_retorno_dias: nullableNumberValue(record.atraso_retorno_dias, 'plano item.atraso_retorno_dias'),
    janelas_compativeis: windowsValue(record.janelas_compativeis),
    ordem: numberValue(record.ordem, 'plano item.ordem'),
    status: itemStatusValue(record.status),
    motivo_invalidacao: nullableStringValue(record.motivo_invalidacao),
    criado_em: stringValue(record.criado_em, 'plano item.criado_em'),
    atualizado_em: stringValue(record.atualizado_em, 'plano item.atualizado_em'),
  }
}

export function normalizeActionPlan(value: unknown): ActionPlan {
  const record = asRecord(value)
  if (!record) throw new Error('Contrato inválido: plano.')
  if (!Array.isArray(record.itens)) throw new Error('Contrato inválido: plano.itens.')
  return {
    id: stringValue(record.id, 'plano.id'),
    clinica_id: stringValue(record.clinica_id, 'plano.clinica_id'),
    profissional_id: stringValue(record.profissional_id, 'plano.profissional_id'),
    data_alvo: stringValue(record.data_alvo, 'plano.data_alvo'),
    status: planStatusValue(record.status),
    capacidade_minutos_snapshot: numberValue(record.capacidade_minutos_snapshot, 'plano.capacidade_minutos_snapshot'),
    ocupado_minutos_snapshot: numberValue(record.ocupado_minutos_snapshot, 'plano.ocupado_minutos_snapshot'),
    livre_minutos_snapshot: numberValue(record.livre_minutos_snapshot, 'plano.livre_minutos_snapshot'),
    ocupacao_percentual_snapshot: nullableNumberValue(record.ocupacao_percentual_snapshot, 'plano.ocupacao_percentual_snapshot'),
    classificacao_snapshot: stringValue(record.classificacao_snapshot, 'plano.classificacao_snapshot'),
    fonte_disponibilidade_snapshot: sourceValue(record.fonte_disponibilidade_snapshot),
    total_oportunidades_snapshot: numberValue(record.total_oportunidades_snapshot, 'plano.total_oportunidades_snapshot'),
    criado_em: stringValue(record.criado_em, 'plano.criado_em'),
    atualizado_em: stringValue(record.atualizado_em, 'plano.atualizado_em'),
    aprovado_em: nullableStringValue(record.aprovado_em),
    aprovado_por: nullableStringValue(record.aprovado_por),
    cancelado_em: nullableStringValue(record.cancelado_em),
    cancelado_por: nullableStringValue(record.cancelado_por),
    criado_por: stringValue(record.criado_por, 'plano.criado_por'),
    itens_selecionados: numberValue(record.itens_selecionados, 'plano.itens_selecionados'),
    itens: record.itens.map(normalizePlanItem),
  }
}

export function normalizePlanSummary(value: unknown): ActionPlanSummary {
  const record = asRecord(value)
  if (!record) throw new Error('Contrato inválido: resumo do plano.')
  return {
    id: stringValue(record.id, 'resumo.id'),
    data_alvo: stringValue(record.data_alvo, 'resumo.data_alvo'),
    status: planStatusValue(record.status),
    capacidade_minutos_snapshot: numberValue(record.capacidade_minutos_snapshot, 'resumo.capacidade_minutos_snapshot'),
    ocupado_minutos_snapshot: numberValue(record.ocupado_minutos_snapshot, 'resumo.ocupado_minutos_snapshot'),
    livre_minutos_snapshot: numberValue(record.livre_minutos_snapshot, 'resumo.livre_minutos_snapshot'),
    ocupacao_percentual_snapshot: nullableNumberValue(record.ocupacao_percentual_snapshot, 'resumo.ocupacao_percentual_snapshot'),
    classificacao_snapshot: stringValue(record.classificacao_snapshot, 'resumo.classificacao_snapshot'),
    total_oportunidades_snapshot: numberValue(record.total_oportunidades_snapshot, 'resumo.total_oportunidades_snapshot'),
    itens_selecionados: numberValue(record.itens_selecionados, 'resumo.itens_selecionados'),
    atualizado_em: stringValue(record.atualizado_em, 'resumo.atualizado_em'),
  }
}

export function normalizePlanSummaries(value: unknown): ActionPlanSummary[] {
  if (!Array.isArray(value)) throw new Error('Contrato inválido: lista de planos.')
  return value.map(normalizePlanSummary)
}

function normalizePlanEnvelope(value: unknown): ActionPlan {
  const record = asRecord(value)
  if (!record) throw new Error('Contrato inválido: resposta do plano.')
  return normalizeActionPlan(record.plano ?? value)
}

export function normalizePlanValidation(value: unknown): PlanValidationResult {
  const record = asRecord(value)
  if (!record) throw new Error('Contrato inválido: revalidação do plano.')
  return {
    plano: normalizePlanEnvelope(record),
    agenda_mudou: record.agenda_mudou === true,
    dia_merece_atencao: record.dia_merece_atencao === true,
    itens_invalidados: numberValue(record.itens_invalidados ?? 0, 'itens_invalidados'),
    mensagem: stringValue(record.mensagem, 'mensagem'),
  }
}

export function normalizePlanUpdate(value: unknown): PlanUpdateResult {
  const record = asRecord(value)
  if (!record) throw new Error('Contrato inválido: atualização do plano.')
  return {
    ...normalizePlanValidation(record),
    atualizado: record.atualizado === true,
    itens_adicionados: numberValue(record.itens_adicionados ?? 0, 'itens_adicionados'),
  }
}

export function normalizePlanApproval(value: unknown): PlanApprovalResult {
  const record = asRecord(value)
  if (!record) throw new Error('Contrato inválido: aprovação do plano.')
  return {
    aprovado: record.aprovado === true,
    agenda_mudou: record.agenda_mudou === true,
    dia_merece_atencao: record.dia_merece_atencao === true,
    itens_invalidados: numberValue(record.itens_invalidados ?? 0, 'itens_invalidados'),
    plano: normalizePlanEnvelope(record),
    mensagem: stringValue(record.mensagem, 'mensagem'),
  }
}

export function planStatusLabel(status: ActionPlanStatus): string {
  if (status === 'APROVADO') return 'Plano aprovado'
  if (status === 'CANCELADO') return 'Plano cancelado'
  return 'Aguardando sua revisão'
}

export function planItemStatusLabel(status: ActionPlanItemStatus): string {
  if (status === 'REMOVIDO') return 'Removido do plano'
  if (status === 'INVALIDO') return 'Não está mais disponível'
  return 'Selecionado'
}
