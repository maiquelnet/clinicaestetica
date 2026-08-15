export type TreatmentFrequency = 'diario' | 'semanal' | 'mensal' | 'intervalo'
export type TreatmentItemSituation = 'planejado' | 'aguardando_reagendamento' | 'cancelado_plano'

export type ScheduleGeneratorInput = {
  startDate: string
  time: string
  total: number
  durationMinutes: number
  frequency: TreatmentFrequency
  intervalDays?: number | null
  includeSaturday: boolean
  includeSunday: boolean
}

export type TreatmentOccurrence = {
  number: number
  startLocal: string
  endLocal: string
  adjusted: boolean
  preserved?: boolean
  itemId?: string | null | undefined
  appointmentId?: string | null | undefined
  situation?: TreatmentItemSituation
}

export type ExistingTreatmentOccurrence = {
  number: number
  startLocal: string
  endLocal: string
  manual: boolean
  situation: TreatmentItemSituation
  itemId?: string | null | undefined
  appointmentId?: string | null | undefined
  archived?: boolean
}

const pad = (value: number) => String(value).padStart(2, '0')

function parseDate(date: string) {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

function parseLocalDateTime(value: string) {
  const [date = '1970-01-01', time = '00:00'] = value.split('T')
  const result = parseDate(date)
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  result.setHours(hours, minutes, 0, 0)
  return result
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatLocalDateTime(date: Date) {
  return `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function addCalendarDays(date: Date, amount: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

function addCalendarMonths(date: Date, amount: number) {
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + amount, 1, 12)
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 12).getDate()
  targetMonth.setDate(Math.min(date.getDate(), lastDay))
  return targetMonth
}

function isAllowed(date: Date, includeSaturday: boolean, includeSunday: boolean) {
  if (date.getDay() === 6) return includeSaturday
  if (date.getDay() === 0) return includeSunday
  return true
}

function nearestAllowedDate(
  date: Date,
  includeSaturday: boolean,
  includeSunday: boolean,
  targetMonth?: number,
) {
  if (isAllowed(date, includeSaturday, includeSunday)) return date
  for (let distance = 1; distance <= 7; distance += 1) {
    const later = addCalendarDays(date, distance)
    if ((targetMonth == null || later.getMonth() === targetMonth) && isAllowed(later, includeSaturday, includeSunday)) {
      return later
    }
    const earlier = addCalendarDays(date, -distance)
    if ((targetMonth == null || earlier.getMonth() === targetMonth) && isAllowed(earlier, includeSaturday, includeSunday)) {
      return earlier
    }
  }
  throw new Error('Não foi possível encontrar uma data permitida.')
}

function nextAllowedAfter(date: Date, includeSaturday: boolean, includeSunday: boolean) {
  let candidate = addCalendarDays(date, 1)
  while (!isAllowed(candidate, includeSaturday, includeSunday)) candidate = addCalendarDays(candidate, 1)
  return candidate
}

export function generateTreatmentSchedule(input: ScheduleGeneratorInput): TreatmentOccurrence[] {
  if (!input.startDate || !input.time) return []
  if (!Number.isInteger(input.total) || input.total < 1) return []
  if (input.frequency === 'intervalo' && (!input.intervalDays || input.intervalDays < 1)) return []

  const baseDate = parseDate(input.startDate)
  const [hours = 0, minutes = 0] = input.time.split(':').map(Number)
  const occurrences: TreatmentOccurrence[] = []
  let previous: Date | null = null

  for (let index = 0; index < input.total; index += 1) {
    let rawDate: Date
    if (input.frequency === 'mensal') rawDate = addCalendarMonths(baseDate, index)
    else if (input.frequency === 'semanal') rawDate = addCalendarDays(baseDate, index * 7)
    else if (input.frequency === 'intervalo') rawDate = addCalendarDays(baseDate, index * (input.intervalDays || 1))
    else if (index === 0) rawDate = baseDate
    else rawDate = addCalendarDays(previous!, 1)

    let date: Date = input.frequency === 'diario' && index > 0
      ? nextAllowedAfter(previous!, input.includeSaturday, input.includeSunday)
      : nearestAllowedDate(
          rawDate,
          input.includeSaturday,
          input.includeSunday,
          input.frequency === 'mensal' ? rawDate.getMonth() : undefined,
        )

    if (previous && date <= previous) {
      date = nextAllowedAfter(previous, input.includeSaturday, input.includeSunday)
    }

    const adjusted = formatDate(date) !== formatDate(rawDate)
    const start = new Date(date)
    start.setHours(hours, minutes, 0, 0)
    const end = new Date(start.getTime() + input.durationMinutes * 60_000)
    occurrences.push({
      number: index + 1,
      startLocal: formatLocalDateTime(start),
      endLocal: formatLocalDateTime(end),
      adjusted,
      preserved: false,
      situation: 'planejado',
    })
    previous = date
  }

  return occurrences
}

export function mergePreservedOccurrences(
  generated: TreatmentOccurrence[],
  existing: ExistingTreatmentOccurrence[],
  today = formatDate(new Date()),
) {
  const existingByNumber = new Map(existing.filter((item) => !item.archived).map((item) => [item.number, item]))
  return generated.map((occurrence) => {
    const current = existingByNumber.get(occurrence.number)
    if (!current) return occurrence
    const isPast = current.startLocal.slice(0, 10) < today
    const preserved = isPast || current.manual || current.situation === 'aguardando_reagendamento'
    if (!preserved) {
      return { ...occurrence, itemId: current.itemId, appointmentId: current.appointmentId }
    }
    return {
      number: current.number,
      startLocal: current.startLocal,
      endLocal: current.endLocal,
      adjusted: current.manual,
      preserved: true,
      itemId: current.itemId,
      appointmentId: current.appointmentId,
      situation: current.situation,
    }
  })
}

export function countRemainingOccurrences(
  items: ExistingTreatmentOccurrence[],
  today = formatDate(new Date()),
) {
  return items.filter((item) => {
    if (item.archived || item.situation === 'cancelado_plano') return false
    if (item.situation === 'aguardando_reagendamento') return true
    return item.startLocal.slice(0, 10) >= today
  }).length
}

export function toLocalDateTime(value: string) {
  return formatLocalDateTime(new Date(value))
}

export function localDateTimeToIso(value: string) {
  return parseLocalDateTime(value).toISOString()
}

export function todayLocalDate() {
  return formatDate(new Date())
}
