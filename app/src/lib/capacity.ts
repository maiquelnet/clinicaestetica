export type RadarClassification =
  | 'SEM_CAPACIDADE'
  | 'AGENDA_COM_OPORTUNIDADES'
  | 'AINDA_HA_DISPONIBILIDADE'
  | 'POUCA_DISPONIBILIDADE'
  | 'BOA_OCUPACAO'
  | 'QUASE_COMPLETA'

export const radarClassificationLabels: Record<RadarClassification, string> = {
  SEM_CAPACIDADE: 'Agenda indisponível',
  AGENDA_COM_OPORTUNIDADES: 'Agenda com oportunidades',
  AINDA_HA_DISPONIBILIDADE: 'Ainda há disponibilidade',
  POUCA_DISPONIBILIDADE: 'Pouca disponibilidade restante',
  BOA_OCUPACAO: 'Boa ocupação',
  QUASE_COMPLETA: 'Agenda quase completa',
}

export type CommercialWindow = {
  inicio_em: string
  fim_em: string
  inicio: string
  fim: string
}

export type RadarDay = {
  data: string
  profissional_id: string
  capacidade_minutos: number
  ocupado_minutos: number
  livre_minutos: number
  bloqueado_minutos: number
  ocupacao_percentual: number | null
  possui_capacidade: boolean
  periodos_livres: CommercialWindow[]
  fonte_disponibilidade: 'excecao' | 'semanal'
  classificacao: RadarClassification
  merece_atencao: boolean
}

export type CommercialCapacityDay = Omit<RadarDay, 'classificacao' | 'merece_atencao'>

export type Opportunity = {
  id: string
  cliente_id: string
  cliente_nome: string
  telefone: string
  servico_id: string
  servico_nome: string
  duracao_minutos: number
  origem: 'lista_espera' | 'retorno'
  motivo: string
  retorno_devido_em: string | null
  atraso_retorno_dias: number | null
  janelas_compativeis: CommercialWindow[]
  whatsapp_opt_in_status: string
  aceita_marketing: boolean
  ultima_mensagem_em: string | null
}

export type OpportunityDay = RadarDay & {
  oportunidades: Opportunity[]
  total_oportunidades: number
  lista_espera_count: number
  retorno_count: number
  clientes_unicos_count: number
}

export type RadarSummary = {
  total_dias: number
  dias_com_capacidade: number
  dias_indisponiveis: number
  dias_merecem_atencao: number
  datas_merecem_atencao: string[]
}

export type CapacityRpcRow = {
  data: string
  profissional_id: string
  capacidade_minutos: number | string
  ocupado_minutos: number | string
  livre_minutos: number | string
  bloqueado_minutos: number | string
  ocupacao_percentual: number | string | null
  possui_capacidade: boolean
  periodos_livres: unknown
  fonte_disponibilidade: string
  classificacao?: string
  merece_atencao?: boolean
}

export type OpportunityRpcRow = CapacityRpcRow & {
  oportunidades: unknown
  total_oportunidades: number | string
  lista_espera_count: number | string
  retorno_count: number | string
  clientes_unicos_count: number | string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
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

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Contrato inválido: ${field}.`)
  return value
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function classificationValue(value: unknown): RadarClassification {
  if (typeof value === 'string' && value in radarClassificationLabels) return value as RadarClassification
  throw new Error('Contrato inválido: classificacao.')
}

function sourceValue(value: unknown): 'excecao' | 'semanal' {
  if (value === 'excecao' || value === 'semanal') return value
  throw new Error('Contrato inválido: fonte_disponibilidade.')
}

function parseWindow(value: unknown): CommercialWindow {
  const record = asRecord(value)
  if (!record) throw new Error('Contrato inválido: janela comercial.')
  return {
    inicio_em: stringValue(record.inicio_em, 'periodos_livres.inicio_em'),
    fim_em: stringValue(record.fim_em, 'periodos_livres.fim_em'),
    inicio: stringValue(record.inicio, 'periodos_livres.inicio'),
    fim: stringValue(record.fim, 'periodos_livres.fim'),
  }
}

function parseWindows(value: unknown): CommercialWindow[] {
  if (!Array.isArray(value)) throw new Error('Contrato inválido: periodos_livres.')
  return value.map(parseWindow)
}

export function normalizeCapacityDay(row: CapacityRpcRow): CommercialCapacityDay {
  return {
    data: stringValue(row.data, 'data'),
    profissional_id: stringValue(row.profissional_id, 'profissional_id'),
    capacidade_minutos: numberValue(row.capacidade_minutos, 'capacidade_minutos'),
    ocupado_minutos: numberValue(row.ocupado_minutos, 'ocupado_minutos'),
    livre_minutos: numberValue(row.livre_minutos, 'livre_minutos'),
    bloqueado_minutos: numberValue(row.bloqueado_minutos, 'bloqueado_minutos'),
    ocupacao_percentual: nullableNumberValue(row.ocupacao_percentual, 'ocupacao_percentual'),
    possui_capacidade: row.possui_capacidade,
    periodos_livres: parseWindows(row.periodos_livres),
    fonte_disponibilidade: sourceValue(row.fonte_disponibilidade),
  }
}

export function normalizeRadarDay(row: CapacityRpcRow): RadarDay {
  const capacity = normalizeCapacityDay(row)
  return {
    ...capacity,
    classificacao: classificationValue(row.classificacao),
    merece_atencao: row.merece_atencao === true,
  }
}

function parseOpportunity(value: unknown): Opportunity {
  const record = asRecord(value)
  if (!record) throw new Error('Contrato inválido: oportunidade.')
  const origin = record.origem === 'lista_espera' || record.origem === 'retorno' ? record.origem : null
  if (!origin) throw new Error('Contrato inválido: oportunidade.origem.')
  return {
    id: stringValue(record.id, 'oportunidade.id'),
    cliente_id: stringValue(record.cliente_id, 'oportunidade.cliente_id'),
    cliente_nome: stringValue(record.cliente_nome, 'oportunidade.cliente_nome'),
    telefone: stringValue(record.telefone, 'oportunidade.telefone'),
    servico_id: stringValue(record.servico_id, 'oportunidade.servico_id'),
    servico_nome: stringValue(record.servico_nome, 'oportunidade.servico_nome'),
    duracao_minutos: numberValue(record.duracao_minutos, 'oportunidade.duracao_minutos'),
    origem: origin,
    motivo: stringValue(record.motivo, 'oportunidade.motivo'),
    retorno_devido_em: nullableStringValue(record.retorno_devido_em),
    atraso_retorno_dias: nullableNumberValue(record.atraso_retorno_dias, 'oportunidade.atraso_retorno_dias'),
    janelas_compativeis: parseWindows(record.janelas_compativeis),
    whatsapp_opt_in_status: stringValue(record.whatsapp_opt_in_status, 'oportunidade.whatsapp_opt_in_status'),
    aceita_marketing: record.aceita_marketing === true,
    ultima_mensagem_em: nullableStringValue(record.ultima_mensagem_em),
  }
}

export function normalizeOpportunityDay(row: OpportunityRpcRow): OpportunityDay {
  const radar = normalizeRadarDay(row)
  if (!Array.isArray(row.oportunidades)) throw new Error('Contrato inválido: oportunidades.')
  return {
    ...radar,
    oportunidades: row.oportunidades.map(parseOpportunity),
    total_oportunidades: numberValue(row.total_oportunidades, 'total_oportunidades'),
    lista_espera_count: numberValue(row.lista_espera_count, 'lista_espera_count'),
    retorno_count: numberValue(row.retorno_count, 'retorno_count'),
    clientes_unicos_count: numberValue(row.clientes_unicos_count, 'clientes_unicos_count'),
  }
}

export function summarizeRadar(days: RadarDay[]): RadarSummary {
  const attentionDays = days.filter((day) => day.merece_atencao)
  return {
    total_dias: days.length,
    dias_com_capacidade: days.filter((day) => day.possui_capacidade).length,
    dias_indisponiveis: days.filter((day) => !day.possui_capacidade).length,
    dias_merecem_atencao: attentionDays.length,
    datas_merecem_atencao: attentionDays.map((day) => day.data),
  }
}

function datePart(value: Date, timeZone: string, part: 'year' | 'month' | 'day'): string {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  return formatted.find((item) => item.type === part)?.value || ''
}

export function clinicDateToday(timeZone: string, now = new Date()): string {
  return clinicDateForInstant(now, timeZone)
}

export function clinicDateForInstant(value: string | Date, timeZone: string): string {
  const instant = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(instant.getTime())) throw new Error('Data inválida.')
  const year = datePart(instant, timeZone, 'year')
  const month = datePart(instant, timeZone, 'month')
  const day = datePart(instant, timeZone, 'day')
  if (!year || !month || !day) throw new Error('Não foi possível determinar a data da clínica.')
  return `${year}-${month}-${day}`
}

export function addIsoDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) throw new Error('Data inválida.')
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function nextSevenClinicDates(timeZone: string, now = new Date()): { inicio: string; fim: string } {
  const today = clinicDateToday(timeZone, now)
  return { inicio: addIsoDays(today, 1), fim: addIsoDays(today, 7) }
}
