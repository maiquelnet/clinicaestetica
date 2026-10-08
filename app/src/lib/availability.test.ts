import assert from 'node:assert/strict'
import test from 'node:test'
import { availabilityRows, baseAvailabilityForDate, copyAvailabilityToDays, draftFromRows, emptyAvailability, findAvailabilityException, validateAvailability, validateAvailabilityException, type AvailabilityDraft, type AvailabilityExceptionRecord } from './availability.ts'

function draft(periods: AvailabilityDraft['1'] = []): AvailabilityDraft {
  const value = emptyAvailability()
  value[1] = periods
  return value
}

test('aceita dois períodos separados no mesmo dia', () => {
  assert.equal(validateAvailability(draft([{ dia_semana: 1, inicio: '08:00', fim: '12:00' }, { dia_semana: 1, inicio: '13:00', fim: '18:00' }])), null)
})

test('dia sem períodos representa ausência de disponibilidade', () => {
  const value = emptyAvailability()
  assert.deepEqual(value[2], [])
  assert.deepEqual(availabilityRows(value), [])
})

test('rejeita fim menor ou igual ao início', () => {
  assert.match(validateAvailability(draft([{ dia_semana: 1, inicio: '12:00', fim: '12:00' }])), /final deve ser depois/)
  assert.match(validateAvailability(draft([{ dia_semana: 1, inicio: '13:00', fim: '12:00' }])), /final deve ser depois/)
})

test('rejeita períodos sobrepostos', () => {
  assert.match(validateAvailability(draft([{ dia_semana: 1, inicio: '08:00', fim: '12:00' }, { dia_semana: 1, inicio: '11:00', fim: '14:00' }])), /não podem se sobrepor/)
})

test('copia períodos para outros dias sem manter ids', () => {
  const source = draft([{ id: 'existing', dia_semana: 1, inicio: '08:00', fim: '12:00' }])
  const copied = copyAvailabilityToDays(source, 1, [2, 5])
  assert.deepEqual(copied[2], [{ dia_semana: 2, inicio: '08:00', fim: '12:00' }])
  assert.deepEqual(copied[5], [{ dia_semana: 5, inicio: '08:00', fim: '12:00' }])
  assert.equal(copied[1]![0]!.id, 'existing')
})

test('recupera linhas agrupadas por dia', () => {
  const result = draftFromRows([{ dia_semana: 2, inicio: '13:00', fim: '18:00' }, { dia_semana: 2, inicio: '08:00', fim: '12:00' }])
  assert.deepEqual(result[2]?.map((period) => period.inicio), ['08:00', '13:00'])
})

function exception(overrides: Partial<AvailabilityExceptionRecord> = {}): AvailabilityExceptionRecord {
  return { id: 'exception-1', clinica_id: 'clinic-a', profissional_id: 'professional-a', data: '2026-09-14', nao_atende: false, periodos: [{ dia_semana: 1, inicio: '10:00', fim: '15:00' }], ...overrides }
}

function addUniqueException(list: AvailabilityExceptionRecord[], item: AvailabilityExceptionRecord) {
  if (findAvailabilityException(list, item.clinica_id, item.profissional_id, item.data)) throw new Error('Já existe uma exceção para esta data.')
  return [...list, item]
}

test('exceção pode reduzir o horário e substitui o semanal', () => {
  const weekly = draft([{ dia_semana: 1, inicio: '08:00', fim: '12:00' }, { dia_semana: 1, inicio: '13:00', fim: '18:00' }])
  const result = baseAvailabilityForDate(weekly, [exception()], 'clinic-a', 'professional-a', '2026-09-14')
  assert.deepEqual(result.map((period) => [period.inicio, period.fim]), [['10:00', '15:00']])
})

test('exceção pode aumentar o horário', () => {
  const weekly = draft([{ dia_semana: 1, inicio: '08:00', fim: '18:00' }])
  const result = baseAvailabilityForDate(weekly, [exception({ periodos: [{ dia_semana: 1, inicio: '08:00', fim: '20:00' }] })], 'clinic-a', 'professional-a', '2026-09-14')
  assert.deepEqual(result.map((period) => [period.inicio, period.fim]), [['08:00', '20:00']])
})

test('exceção abre um dia normalmente fechado', () => {
  const weekly = emptyAvailability()
  const result = baseAvailabilityForDate(weekly, [exception({ data: '2026-09-19', periodos: [{ dia_semana: 6, inicio: '09:00', fim: '13:00' }] })], 'clinic-a', 'professional-a', '2026-09-19')
  assert.deepEqual(result.map((period) => [period.inicio, period.fim]), [['09:00', '13:00']])
})

test('exceção não atende retorna disponibilidade zero', () => {
  const weekly = draft([{ dia_semana: 1, inicio: '08:00', fim: '18:00' }])
  assert.deepEqual(baseAvailabilityForDate(weekly, [exception({ nao_atende: true, periodos: [] })], 'clinic-a', 'professional-a', '2026-09-14'), [])
})

test('recupera a exceção pelo profissional, clínica e data', () => {
  const saved = exception()
  assert.equal(findAvailabilityException([saved], 'clinic-a', 'professional-a', '2026-09-14'), saved)
  assert.equal(findAvailabilityException([saved], 'clinic-a', 'professional-a', '2026-09-15'), undefined)
})

test('editar exceção atualiza seus períodos', () => {
  const edited = exception({ periodos: [{ dia_semana: 1, inicio: '11:00', fim: '16:00' }] })
  const result = baseAvailabilityForDate(draft(), [edited], 'clinic-a', 'professional-a', '2026-09-14')
  assert.deepEqual(result.map((period) => [period.inicio, period.fim]), [['11:00', '16:00']])
})

test('excluir exceção faz a data voltar ao padrão semanal', () => {
  const weekly = draft([{ dia_semana: 1, inicio: '08:00', fim: '18:00' }])
  assert.deepEqual(baseAvailabilityForDate(weekly, [], 'clinic-a', 'professional-a', '2026-09-14').map((period) => [period.inicio, period.fim]), [['08:00', '18:00']])
})

test('impede duas exceções para o mesmo profissional e data', () => {
  const saved = [exception()]
  assert.throws(() => addUniqueException(saved, exception({ id: 'exception-2' })), /Já existe uma exceção/)
})

test('impede períodos sobrepostos na exceção', () => {
  assert.match(validateAvailabilityException({ nao_atende: false, periodos: [{ dia_semana: 1, inicio: '08:00', fim: '12:00' }, { dia_semana: 1, inicio: '11:00', fim: '14:00' }] }) || '', /não podem se sobrepor/)
})

test('impede fim menor ou igual ao início na exceção', () => {
  assert.match(validateAvailabilityException({ nao_atende: false, periodos: [{ dia_semana: 1, inicio: '12:00', fim: '12:00' }] }) || '', /final deve ser depois/)
})

test('isola exceções entre clínicas', () => {
  const weekly = draft([{ dia_semana: 1, inicio: '08:00', fim: '18:00' }])
  const saved = exception()
  const result = baseAvailabilityForDate(weekly, [saved], 'clinic-b', 'professional-a', '2026-09-14')
  assert.deepEqual(result.map((period) => [period.inicio, period.fim]), [['08:00', '18:00']])
})

test('alterar o semanal não modifica os períodos já salvos na exceção', () => {
  const saved = exception()
  const weekly = draft([{ dia_semana: 1, inicio: '08:00', fim: '18:00' }])
  weekly[1] = [{ dia_semana: 1, inicio: '09:00', fim: '17:00' }]
  const result = baseAvailabilityForDate(weekly, [saved], 'clinic-a', 'professional-a', '2026-09-14')
  assert.deepEqual(result.map((period) => [period.inicio, period.fim]), [['10:00', '15:00']])
})
