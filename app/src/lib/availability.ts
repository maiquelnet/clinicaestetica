export const WEEKDAYS = [
  { value: 0, label: 'Domingo', shortLabel: 'DOM' },
  { value: 1, label: 'Segunda-feira', shortLabel: 'SEG' },
  { value: 2, label: 'Terça-feira', shortLabel: 'TER' },
  { value: 3, label: 'Quarta-feira', shortLabel: 'QUA' },
  { value: 4, label: 'Quinta-feira', shortLabel: 'QUI' },
  { value: 5, label: 'Sexta-feira', shortLabel: 'SEX' },
  { value: 6, label: 'Sábado', shortLabel: 'SÁB' },
] as const

export type AvailabilityPeriod = {
  id?: string
  clinica_id?: string
  profissional_id?: string
  dia_semana: number
  inicio: string
  fim: string
  criado_em?: string
  atualizado_em?: string
}

export type AvailabilityDraft = Record<number, AvailabilityPeriod[]>

export type AvailabilityExceptionRecord = {
  id: string
  clinica_id: string
  profissional_id: string
  data: string
  nao_atende: boolean
  periodos: AvailabilityPeriod[]
}

export const suggestedAvailability: AvailabilityDraft = {
  0: [],
  1: [{ dia_semana: 1, inicio: '08:00', fim: '12:00' }, { dia_semana: 1, inicio: '13:00', fim: '18:00' }],
  2: [{ dia_semana: 2, inicio: '08:00', fim: '12:00' }, { dia_semana: 2, inicio: '13:00', fim: '18:00' }],
  3: [{ dia_semana: 3, inicio: '08:00', fim: '12:00' }, { dia_semana: 3, inicio: '13:00', fim: '18:00' }],
  4: [{ dia_semana: 4, inicio: '08:00', fim: '12:00' }, { dia_semana: 4, inicio: '13:00', fim: '18:00' }],
  5: [{ dia_semana: 5, inicio: '08:00', fim: '12:00' }, { dia_semana: 5, inicio: '13:00', fim: '18:00' }],
  6: [],
}

export function cloneAvailability(source: AvailabilityDraft): AvailabilityDraft {
  return Object.fromEntries(WEEKDAYS.map(({ value }) => [value, (source[value] || []).map((period) => ({ ...period }))])) as AvailabilityDraft
}

export function emptyAvailability(): AvailabilityDraft {
  return cloneAvailability({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] })
}

export function draftFromRows(rows: AvailabilityPeriod[]): AvailabilityDraft {
  const draft = emptyAvailability()
  for (const row of rows) draft[row.dia_semana] = [...(draft[row.dia_semana] || []), { ...row, inicio: row.inicio.slice(0, 5), fim: row.fim.slice(0, 5) }]
  for (const day of WEEKDAYS) draft[day.value]?.sort((a, b) => a.inicio.localeCompare(b.inicio))
  return draft
}

export function availabilityRows(draft: AvailabilityDraft): Array<Pick<AvailabilityPeriod, 'dia_semana' | 'inicio' | 'fim'>> {
  return WEEKDAYS.flatMap(({ value }) => (draft[value] || []).map(({ dia_semana, inicio, fim }) => ({ dia_semana, inicio, fim })))
}

export function validateAvailability(draft: AvailabilityDraft): string | null {
  for (const day of WEEKDAYS) {
    const error = validatePeriods(draft[day.value] || [], day.label)
    if (error) return error
  }
  return null
}

export function validatePeriods(periods: AvailabilityPeriod[], label = 'Este dia'): string | null {
  const sorted = [...periods].sort((a, b) => a.inicio.localeCompare(b.inicio))
  for (const period of sorted) {
    if (!period.inicio || !period.fim || period.fim <= period.inicio) return `${label}: o horário final deve ser depois do início.`
  }
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1]!.fim > sorted[index]!.inicio) return `${label}: os períodos não podem se sobrepor.`
  }
  return null
}

export function validateAvailabilityException(exception: Pick<AvailabilityExceptionRecord, 'nao_atende' | 'periodos'>): string | null {
  if (exception.nao_atende && exception.periodos.length) return 'Uma exceção de dia inteiro não pode possuir períodos.'
  if (!exception.nao_atende && !exception.periodos.length) return 'Informe ao menos um período ou marque que não atenderá neste dia.'
  return exception.nao_atende ? null : validatePeriods(exception.periodos, 'Exceção')
}

export function findAvailabilityException(exceptions: AvailabilityExceptionRecord[], clinicId: string, professionalId: string, date: string) {
  return exceptions.find((exception) => exception.clinica_id === clinicId && exception.profissional_id === professionalId && exception.data === date)
}

/** Selects the commercial base for a date without subtracting blocks or calculating occupancy. */
export function baseAvailabilityForDate(weekly: AvailabilityDraft, exceptions: AvailabilityExceptionRecord[], clinicId: string, professionalId: string, date: string): AvailabilityPeriod[] {
  const exception = findAvailabilityException(exceptions, clinicId, professionalId, date)
  if (exception) return exception.nao_atende ? [] : exception.periodos.map((period) => ({ ...period }))
  const weekday = new Date(`${date}T12:00:00`).getDay()
  return (weekly[weekday] || []).map((period) => ({ ...period }))
}

export function copyAvailabilityToDays(draft: AvailabilityDraft, sourceDay: number, targetDays: number[]): AvailabilityDraft {
  const next = cloneAvailability(draft)
  const source = (draft[sourceDay] || []).map(({ id: _id, criado_em: _created, atualizado_em: _updated, ...period }) => ({ ...period, dia_semana: sourceDay }))
  for (const targetDay of targetDays) next[targetDay] = source.map((period) => ({ ...period, dia_semana: targetDay }))
  return next
}
