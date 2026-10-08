import { addDays, differenceInCalendarDays, endOfMonth, startOfWeek } from 'date-fns'
import type { ScheduleBlockRecurrence, ScheduleBlockType } from './types'

export const BLOCK_TYPE_LABELS: Record<ScheduleBlockType, string> = {
  particular: 'Compromisso particular',
  externo: 'Serviço externo',
  administrativo: 'Administrativo',
  intervalo: 'Intervalo',
  outro: 'Outro',
}

export type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom'

export type ScheduleBlockDraft = {
  tipo: ScheduleBlockType
  titulo: string
  inicio_em: string
  fim_em: string
  dia_inteiro: boolean
  repetition: RecurrencePreset
  recurrence: ScheduleBlockRecurrence | null
}

export type BlockOccurrence = {
  start: Date
  end: Date
  occurrenceNumber: number
}

const NEVER_HORIZON_DAYS = 365
const MAX_OCCURRENCES = 366

export const DEFAULT_RECURRENCE: ScheduleBlockRecurrence = {
  unit: 'week',
  interval: 1,
  weekdays: [],
  ends: 'never',
  endDate: null,
  occurrenceCount: null,
}

export function recurrenceForPreset(preset: RecurrencePreset, start: Date): ScheduleBlockRecurrence | null {
  if (preset === 'none') return null
  if (preset === 'daily') return { ...DEFAULT_RECURRENCE, unit: 'day', weekdays: [] }
  if (preset === 'weekly') return { ...DEFAULT_RECURRENCE, unit: 'week', weekdays: [start.getDay()] }
  if (preset === 'monthly') return { ...DEFAULT_RECURRENCE, unit: 'month', weekdays: [] }
  return { ...DEFAULT_RECURRENCE, weekdays: [start.getDay()] }
}

export function presetForRecurrence(recurrence: ScheduleBlockRecurrence | null): RecurrencePreset {
  if (!recurrence) return 'none'
  if (recurrence.unit === 'day' && recurrence.interval === 1) return 'daily'
  if (recurrence.unit === 'week' && recurrence.interval === 1 && recurrence.weekdays.length <= 1) return 'weekly'
  if (recurrence.unit === 'month' && recurrence.interval === 1) return 'monthly'
  return 'custom'
}

function addMonthsClamped(date: Date, amount: number) {
  const result = new Date(date)
  const day = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + amount)
  result.setDate(Math.min(day, endOfMonth(result).getDate()))
  return result
}

function isWithinEnd(date: Date, recurrence: ScheduleBlockRecurrence, start: Date, occurrenceNumber: number) {
  if (recurrence.ends === 'occurrences') {
    return occurrenceNumber <= Math.max(1, Number(recurrence.occurrenceCount || 1))
  }
  if (recurrence.ends === 'date' && recurrence.endDate) {
    const endDate = new Date(`${recurrence.endDate}T23:59:59`)
    return date <= endDate
  }
  return date <= addDays(start, NEVER_HORIZON_DAYS)
}

export function buildBlockOccurrences(start: Date, end: Date, recurrence: ScheduleBlockRecurrence | null): BlockOccurrence[] {
  const duration = Math.max(15 * 60_000, end.getTime() - start.getTime())
  if (!recurrence) return [{ start: new Date(start), end: new Date(start.getTime() + duration), occurrenceNumber: 1 }]

  const occurrences: BlockOccurrence[] = []
  const push = (date: Date) => {
    if (date < start || !isWithinEnd(date, recurrence, start, occurrences.length + 1)) return false
    occurrences.push({ start: date, end: new Date(date.getTime() + duration), occurrenceNumber: occurrences.length + 1 })
    return occurrences.length >= MAX_OCCURRENCES
  }

  if (recurrence.unit === 'day') {
    for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
      const date = addDays(start, index * Math.max(1, recurrence.interval))
      if (!isWithinEnd(date, recurrence, start, index + 1)) break
      if (push(date)) break
    }
    return occurrences
  }

  if (recurrence.unit === 'month') {
    for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
      const date = addMonthsClamped(start, index * Math.max(1, recurrence.interval))
      if (!isWithinEnd(date, recurrence, start, index + 1)) break
      if (push(date)) break
    }
    return occurrences
  }

  const weekdays = recurrence.weekdays.length ? recurrence.weekdays : [start.getDay()]
  const anchorWeek = startOfWeek(start, { weekStartsOn: 1 })
  for (let index = 0; index <= NEVER_HORIZON_DAYS && occurrences.length < MAX_OCCURRENCES; index += 1) {
    const date = addDays(start, index)
    const weekStart = startOfWeek(date, { weekStartsOn: 1 })
    const weekNumber = Math.floor(differenceInCalendarDays(weekStart, anchorWeek) / 7)
    if (weekNumber % Math.max(1, recurrence.interval) !== 0 || !weekdays.includes(date.getDay())) continue
    if (!isWithinEnd(date, recurrence, start, occurrences.length + 1)) break
    if (push(date)) break
  }
  return occurrences
}
