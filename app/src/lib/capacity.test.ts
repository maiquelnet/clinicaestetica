import { strict as assert } from 'node:assert'
import test from 'node:test'
import { addIsoDays, nextSevenClinicDates, normalizeRadarDay, summarizeRadar, type RadarDay } from './capacity.ts'

type Interval = { inicio: number; fim: number }

function unite(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.inicio - b.inicio || a.fim - b.fim)
  const result: Interval[] = []
  for (const interval of sorted) {
    const previous = result.at(-1)
    if (!previous || interval.inicio > previous.fim) result.push({ ...interval })
    else previous.fim = Math.max(previous.fim, interval.fim)
  }
  return result
}

function subtract(base: Interval[], blocked: Interval[]): Interval[] {
  const result: Interval[] = []
  for (const source of base) {
    let cursor = source.inicio
    for (const block of unite(blocked)) {
      if (block.fim <= cursor || block.inicio >= source.fim) continue
      if (block.inicio > cursor) result.push({ inicio: cursor, fim: Math.min(block.inicio, source.fim) })
      cursor = Math.max(cursor, block.fim)
      if (cursor >= source.fim) break
    }
    if (cursor < source.fim) result.push({ inicio: cursor, fim: source.fim })
  }
  return result.filter((interval) => interval.fim > interval.inicio)
}

function minutes(intervals: Interval[]) {
  return unite(intervals).reduce((total, interval) => total + interval.fim - interval.inicio, 0)
}

function referenceCapacity(base: Interval[], blocked: Interval[], appointments: Array<Interval & { status?: string }>) {
  const commercial = subtract(base, blocked)
  const occupied = minutes(commercial.flatMap((available) => appointments
    .filter((appointment) => appointment.status !== 'cancelado')
    .map((appointment) => ({
      inicio: Math.max(available.inicio, appointment.inicio),
      fim: Math.min(available.fim, appointment.fim),
    }))
    .filter((interval) => interval.fim > interval.inicio)))
  const capacity = minutes(commercial)
  return {
    capacity,
    occupied,
    free: Math.max(0, capacity - occupied),
    percentage: capacity ? Math.round((occupied * 100 / capacity) * 100) / 100 : null,
    commercial,
  }
}

function radarState(capacity: number, occupied: number) {
  const free = Math.max(0, capacity - occupied)
  const percentage = capacity ? Math.round((occupied * 100 / capacity) * 100) / 100 : null
  const attention = capacity > 0 && percentage !== null && percentage < 65 && free >= 120
  let classification = 'SEM_CAPACIDADE'
  if (capacity > 0 && percentage !== null) {
    if (percentage < 40 && free >= 120) classification = 'AGENDA_COM_OPORTUNIDADES'
    else if (percentage >= 40 && percentage < 65 && free >= 120) classification = 'AINDA_HA_DISPONIBILIDADE'
    else if (percentage < 65 && free < 120) classification = 'POUCA_DISPONIBILIDADE'
    else if (percentage < 85) classification = 'BOA_OCUPACAO'
    else classification = 'QUASE_COMPLETA'
  }
  return { free, percentage, attention, classification }
}

test('semanal normal soma dois periodos separados', () => {
  assert.deepEqual(referenceCapacity([{ inicio: 0, fim: 240 }, { inicio: 300, fim: 600 }], [], []).capacity, 540)
})

test('dia sem disponibilidade semanal fica sem capacidade', () => {
  assert.deepEqual(referenceCapacity([], [], []), { capacity: 0, occupied: 0, free: 0, percentage: null, commercial: [] })
})

test('excecao reduz o horario e substitui o semanal', () => {
  const exception = [{ inicio: 120, fim: 300 }]
  assert.equal(referenceCapacity(exception, [], []).capacity, 180)
})

test('excecao pode aumentar um dia normalmente fechado', () => {
  const exception = [{ inicio: 60, fim: 300 }]
  assert.equal(referenceCapacity(exception, [], []).capacity, 240)
})

test('excecao nao atende produz capacidade zero', () => {
  assert.equal(referenceCapacity([], [], []).capacity, 0)
})

test('bloqueio parcial desconta somente a interseccao', () => {
  assert.equal(referenceCapacity([{ inicio: 0, fim: 600 }], [{ inicio: 120, fim: 240 }], []).capacity, 480)
})

test('bloqueios sobrepostos nao sao descontados duas vezes', () => {
  assert.equal(referenceCapacity([{ inicio: 0, fim: 600 }], [{ inicio: 120, fim: 240 }, { inicio: 180, fim: 300 }], []).capacity, 420)
})

test('bloqueio fora da disponibilidade nao reduz capacidade', () => {
  assert.equal(referenceCapacity([{ inicio: 0, fim: 120 }], [{ inicio: 180, fim: 300 }], []).capacity, 120)
})

test('atendimento totalmente fora da disponibilidade nao ocupa', () => {
  assert.equal(referenceCapacity([{ inicio: 0, fim: 120 }], [], [{ inicio: 180, fim: 240 }]).occupied, 0)
})

test('atendimento parcialmente dentro conta somente a interseccao', () => {
  assert.equal(referenceCapacity([{ inicio: 60, fim: 180 }], [], [{ inicio: 0, fim: 120 }]).occupied, 60)
})

test('atendimentos sobrepostos contam uma unica vez', () => {
  assert.equal(referenceCapacity([{ inicio: 0, fim: 300 }], [], [{ inicio: 0, fim: 120 }, { inicio: 60, fim: 180 }]).occupied, 180)
})

test('atendimento cancelado nao ocupa', () => {
  assert.equal(referenceCapacity([{ inicio: 0, fim: 300 }], [], [{ inicio: 0, fim: 120, status: 'cancelado' }]).occupied, 0)
})

test('ocupacao abaixo de 65 com 120 minutos livres merece atencao', () => {
  assert.deepEqual(radarState(300, 180), { free: 120, percentage: 60, attention: true, classification: 'AINDA_HA_DISPONIBILIDADE' })
})

test('ocupacao exatamente 65 nao merece atencao', () => {
  assert.equal(radarState(400, 260).attention, false)
})

test('ocupacao abaixo de 65 com 119 minutos livres nao merece atencao', () => {
  assert.equal(radarState(299, 180).attention, false)
})

test('capacidade zero nunca vira percentual zero', () => {
  assert.deepEqual(radarState(0, 0), { free: 0, percentage: null, attention: false, classification: 'SEM_CAPACIDADE' })
})

test('classificacoes visuais permanecem deterministicas', () => {
  assert.equal(radarState(480, 120).classification, 'AGENDA_COM_OPORTUNIDADES')
  assert.equal(radarState(360, 180).classification, 'AINDA_HA_DISPONIBILIDADE')
  assert.equal(radarState(480, 360).classification, 'BOA_OCUPACAO')
  assert.equal(radarState(420, 378).classification, 'QUASE_COMPLETA')
  assert.equal(radarState(60, 0).classification, 'POUCA_DISPONIBILIDADE')
})

test('adicao de datas mantem o horizonte sem enumerar horarios', () => {
  assert.equal(addIsoDays('2026-09-07', 7), '2026-09-14')
  assert.deepEqual(nextSevenClinicDates('America/Sao_Paulo', new Date('2026-09-08T02:30:00Z')), { inicio: '2026-09-08', fim: '2026-09-14' })
})

test('Radar usa o contrato server-side sem recalcular classificacao no consumidor', () => {
  const day = normalizeRadarDay({
    data: '2026-09-08',
    profissional_id: 'professional',
    capacidade_minutos: '400',
    ocupado_minutos: 259,
    livre_minutos: 141,
    bloqueado_minutos: 0,
    ocupacao_percentual: '64.75',
    possui_capacidade: true,
    periodos_livres: [{ inicio_em: '2026-09-08T11:00:00Z', fim_em: '2026-09-08T13:00:00Z', inicio: '08:00', fim: '10:00' }],
    fonte_disponibilidade: 'semanal',
    classificacao: 'AINDA_HA_DISPONIBILIDADE',
    merece_atencao: true,
  })
  assert.equal(day.merece_atencao, true)
  assert.equal(day.classificacao, 'AINDA_HA_DISPONIBILIDADE')
})

test('resumo do Radar conta dias com capacidade, indisponiveis e atencao', () => {
  const makeDay = (date: string, capacity: boolean, attention: boolean): RadarDay => ({
    data: date,
    profissional_id: 'professional',
    capacidade_minutos: capacity ? 480 : 0,
    ocupado_minutos: 120,
    livre_minutos: capacity ? 360 : 0,
    bloqueado_minutos: 0,
    ocupacao_percentual: capacity ? 25 : null,
    possui_capacidade: capacity,
    periodos_livres: [],
    fonte_disponibilidade: 'semanal',
    classificacao: capacity ? 'AGENDA_COM_OPORTUNIDADES' : 'SEM_CAPACIDADE',
    merece_atencao: attention,
  })
  assert.deepEqual(summarizeRadar([
    makeDay('2026-09-08', true, true),
    makeDay('2026-09-09', false, false),
    makeDay('2026-09-10', true, false),
  ]), {
    total_dias: 3,
    dias_com_capacidade: 2,
    dias_indisponiveis: 1,
    dias_merecem_atencao: 1,
    datas_merecem_atencao: ['2026-09-08'],
  })
})
