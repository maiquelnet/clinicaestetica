import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countRemainingOccurrences,
  generateTreatmentSchedule,
  mergePreservedOccurrences,
  type ExistingTreatmentOccurrence,
} from './treatment-schedule.ts'

const base = {
  startDate: '2026-08-14',
  time: '09:00',
  total: 4,
  durationMinutes: 60,
  includeSaturday: false,
  includeSunday: false,
} as const

test('recorrência diária usa dias úteis por padrão', () => {
  const dates = generateTreatmentSchedule({ ...base, frequency: 'diario' }).map((item) => item.startLocal.slice(0, 10))
  assert.deepEqual(dates, ['2026-08-14', '2026-08-17', '2026-08-18', '2026-08-19'])
})

test('sábado e domingo podem ser considerados de forma independente', () => {
  const saturday = generateTreatmentSchedule({ ...base, total: 3, frequency: 'diario', includeSaturday: true })
  assert.deepEqual(saturday.map((item) => item.startLocal.slice(0, 10)), ['2026-08-14', '2026-08-15', '2026-08-17'])
  const sunday = generateTreatmentSchedule({ ...base, total: 3, frequency: 'diario', includeSunday: true })
  assert.deepEqual(sunday.map((item) => item.startLocal.slice(0, 10)), ['2026-08-14', '2026-08-16', '2026-08-17'])
})

test('empate em dia excluído escolhe a data posterior', () => {
  const [occurrence] = generateTreatmentSchedule({ ...base, startDate: '2026-08-15', total: 1, frequency: 'semanal', includeSunday: true })
  assert.equal(occurrence!.startLocal.slice(0, 10), '2026-08-16')
  assert.equal(occurrence!.adjusted, true)
})

test('recorrência mensal respeita o último dia do mês', () => {
  const dates = generateTreatmentSchedule({
    ...base,
    startDate: '2027-01-31',
    total: 3,
    frequency: 'mensal',
    includeSunday: true,
  }).map((item) => item.startLocal.slice(0, 10))
  assert.deepEqual(dates, ['2027-01-31', '2027-02-28', '2027-03-31'])
})

test('intervalo personalizado mantém espaçamento e ajusta fim de semana', () => {
  const dates = generateTreatmentSchedule({ ...base, total: 3, frequency: 'intervalo', intervalDays: 3 })
    .map((item) => item.startLocal.slice(0, 10))
  assert.deepEqual(dates, ['2026-08-14', '2026-08-17', '2026-08-20'])
})

test('recálculo preserva passado, ajuste manual e cancelamento aguardando reagendamento', () => {
  const generated = generateTreatmentSchedule({ ...base, frequency: 'semanal' })
  const existing: ExistingTreatmentOccurrence[] = [
    { number: 1, startLocal: '2026-08-01T09:00', endLocal: '2026-08-01T10:00', manual: false, situation: 'planejado' },
    { number: 2, startLocal: '2026-08-25T11:00', endLocal: '2026-08-25T12:00', manual: true, situation: 'planejado' },
    { number: 3, startLocal: '2026-08-10T09:00', endLocal: '2026-08-10T10:00', manual: true, situation: 'aguardando_reagendamento' },
    { number: 4, startLocal: '2026-09-05T09:00', endLocal: '2026-09-05T10:00', manual: false, situation: 'planejado' },
  ]
  const merged = mergePreservedOccurrences(generated, existing, '2026-08-14')
  assert.equal(merged[0]!.startLocal, existing[0]!.startLocal)
  assert.equal(merged[1]!.startLocal, existing[1]!.startLocal)
  assert.equal(merged[2]!.startLocal, existing[2]!.startLocal)
  assert.notEqual(merged[3]!.startLocal, existing[3]!.startLocal)
})

test('contagem mantém cancelamento individual e ignora passado e cancelamento do plano', () => {
  const items: ExistingTreatmentOccurrence[] = [
    { number: 1, startLocal: '2026-08-13T09:00', endLocal: '2026-08-13T10:00', manual: false, situation: 'planejado' },
    { number: 2, startLocal: '2026-08-14T09:00', endLocal: '2026-08-14T10:00', manual: false, situation: 'planejado' },
    { number: 3, startLocal: '2026-08-01T09:00', endLocal: '2026-08-01T10:00', manual: true, situation: 'aguardando_reagendamento' },
    { number: 4, startLocal: '2026-08-20T09:00', endLocal: '2026-08-20T10:00', manual: false, situation: 'cancelado_plano' },
  ]
  assert.equal(countRemainingOccurrences(items, '2026-08-14'), 2)
})
