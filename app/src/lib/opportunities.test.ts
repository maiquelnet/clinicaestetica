import { strict as assert } from 'node:assert'
import test from 'node:test'

type Window = { inicio: number; fim: number }
type Client = { id: string; ativo: boolean; intervalo_retorno_dias: number | null }
type Service = { id: string; nome: string; duracao_minutos: number; intervalo_retorno_dias: number | null; ativo: boolean }
type Appointment = { id: string; cliente_id: string; servico_id: string; data: string; status: string }
type Waitlist = { id: string; cliente_id: string; servico_id: string; status: string; prioridade: number; profissional_id: string | null; data_preferida: string | null; periodo_preferido: string | null; inicio: number | null; fim: number | null }

const professional = 'professional'
const client = (id: string, interval: number | null = null, ativo = true): Client => ({ id, ativo, intervalo_retorno_dias: interval })
const service = (id: string, interval: number | null = null, duration = 60, ativo = true): Service => ({ id, nome: id, duracao_minutos: duration, intervalo_retorno_dias: interval, ativo })

function dayDifference(later: string, earlier: string) {
  return Math.round((Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / 86_400_000)
}

function periodWindow(value: string | null): Window | null {
  if (!value) return null
  if (value === 'manha') return { inicio: 0, fim: 720 }
  if (value === 'tarde') return { inicio: 720, fim: 1080 }
  if (value === 'noite') return { inicio: 1080, fim: 1440 }
  return null
}

function compatibleWindows(windows: Window[], duration: number, preferred: { inicio: number | null; fim: number | null; periodo: string | null } = { inicio: null, fim: null, periodo: null }) {
  const period = periodWindow(preferred.periodo)
  return windows.map((window) => ({
    inicio: Math.max(window.inicio, preferred.inicio ?? 0, period?.inicio ?? 0),
    fim: Math.min(window.fim, preferred.fim ?? 1440, period?.fim ?? 1440),
  })).filter((window) => window.fim - window.inicio >= duration)
}

type Opportunity = { cliente_id: string; servico_id: string; origem: 'lista_espera' | 'retorno'; atraso: number | null; janelas: Window[] }

function opportunitiesForDay(
  data: string,
  radar: { merece_atencao: boolean; possui_capacidade: boolean; windows: Window[] },
  clients: Client[],
  services: Service[],
  appointments: Appointment[],
  waitlist: Waitlist[],
): Opportunity[] {
  if (!radar.merece_atencao || !radar.possui_capacidade) return []
  const activeClients = clients.filter((item) => item.ativo)
  const activeServices = services.filter((item) => item.ativo && item.duracao_minutos > 0)
  const result: Opportunity[] = []

  for (const entry of waitlist) {
    const selectedClient = activeClients.find((item) => item.id === entry.cliente_id)
    const selectedService = activeServices.find((item) => item.id === entry.servico_id)
    if (!selectedClient || !selectedService || entry.status !== 'em_espera') continue
    if (entry.profissional_id && entry.profissional_id !== professional) continue
    if (entry.data_preferida && entry.data_preferida !== data) continue
    const windows = compatibleWindows(radar.windows, selectedService.duracao_minutos, { inicio: entry.inicio, fim: entry.fim, periodo: entry.periodo_preferido })
    if (windows.length) result.push({ cliente_id: entry.cliente_id, servico_id: entry.servico_id, origem: 'lista_espera', atraso: null, janelas: windows })
  }

  const grouped = new Map<string, Appointment[]>()
  for (const appointment of appointments.filter((item) => item.status === 'concluido' && dayDifference(data, item.data) > 0)) {
    const key = `${appointment.cliente_id}:${appointment.servico_id}`
    grouped.set(key, [...(grouped.get(key) || []), appointment])
  }
  for (const [key, history] of grouped) {
    const [clientId, serviceId] = key.split(':')
    const selectedClient = activeClients.find((item) => item.id === clientId)
    const selectedService = activeServices.find((item) => item.id === serviceId)
    const latest = [...history].sort((a, b) => b.data.localeCompare(a.data))[0]
    if (!selectedClient || !selectedService || !latest) continue
    const interval = selectedClient.intervalo_retorno_dias ?? selectedService.intervalo_retorno_dias
    if (interval === null) continue
    if (appointments.some((item) => item.cliente_id === clientId && item.servico_id === serviceId && ['agendado', 'confirmado', 'em_atendimento'].includes(item.status) && item.data > data)) continue
    const due = new Date(`${latest.data}T12:00:00Z`)
    due.setUTCDate(due.getUTCDate() + interval)
    const dueDate = due.toISOString().slice(0, 10)
    if (dueDate > data) continue
    const windows = compatibleWindows(radar.windows, selectedService.duracao_minutos)
    if (windows.length) result.push({ cliente_id: clientId, servico_id: serviceId, origem: 'retorno', atraso: dayDifference(data, dueDate), janelas: windows })
  }
  return result.sort((a, b) => (a.origem === b.origem ? (b.atraso ?? -1) - (a.atraso ?? -1) : a.origem === 'lista_espera' ? -1 : 1))
}

const attentionRadar = { merece_atencao: true, possui_capacidade: true, windows: [{ inicio: 840, fim: 1020 }] }

test('lista de espera compatível vira oportunidade', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza')], [], [{ id: 'wait', cliente_id: 'ana', servico_id: 'limpeza', status: 'em_espera', prioridade: 1, profissional_id: null, data_preferida: null, periodo_preferido: 'tarde', inicio: null, fim: null }])
  assert.equal(result.length, 1)
  assert.equal(result[0]?.origem, 'lista_espera')
})

test('lista de espera incompatível pela duração não aparece', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza', null, 240)], [], [{ id: 'wait', cliente_id: 'ana', servico_id: 'limpeza', status: 'em_espera', prioridade: 1, profissional_id: null, data_preferida: null, periodo_preferido: null, inicio: null, fim: null }])
  assert.equal(result.length, 0)
})

test('preferência de data incompatível é respeitada', () => {
  const entry: Waitlist = { id: 'wait', cliente_id: 'ana', servico_id: 'limpeza', status: 'em_espera', prioridade: 1, profissional_id: null, data_preferida: '2026-09-11', periodo_preferido: null, inicio: null, fim: null }
  assert.equal(opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza')], [], [entry]).length, 0)
})

test('preferência de período incompatível é respeitada', () => {
  const entry: Waitlist = { id: 'wait', cliente_id: 'ana', servico_id: 'limpeza', status: 'em_espera', prioridade: 1, profissional_id: null, data_preferida: null, periodo_preferido: 'manha', inicio: null, fim: null }
  assert.equal(opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza')], [], [entry]).length, 0)
})

test('preferência explícita de início e fim recorta a janela', () => {
  const entry: Waitlist = { id: 'wait', cliente_id: 'ana', servico_id: 'limpeza', status: 'em_espera', prioridade: 1, profissional_id: null, data_preferida: null, periodo_preferido: null, inicio: 900, fim: 960 }
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza')], [], [entry])
  assert.deepEqual(result[0]?.janelas, [{ inicio: 900, fim: 960 }])
})

test('profissional específico incompatível é ignorado', () => {
  const entry: Waitlist = { id: 'wait', cliente_id: 'ana', servico_id: 'limpeza', status: 'em_espera', prioridade: 1, profissional_id: 'other', data_preferida: null, periodo_preferido: null, inicio: null, fim: null }
  assert.equal(opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza')], [], [entry]).length, 0)
})

test('entrada cancelada não é fonte ativa', () => {
  const entry: Waitlist = { id: 'wait', cliente_id: 'ana', servico_id: 'limpeza', status: 'cancelado', prioridade: 1, profissional_id: null, data_preferida: null, periodo_preferido: null, inicio: null, fim: null }
  assert.equal(opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza')], [], [entry]).length, 0)
})

test('retorno vencido é elegível', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza', 30)], [{ id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' }], [])
  assert.equal(result[0]?.origem, 'retorno')
  assert.equal(result[0]?.atraso, 10)
})

test('retorno exatamente devido na data é elegível', () => {
  const result = opportunitiesForDay('2026-08-31', attentionRadar, [client('ana')], [service('limpeza', 30)], [{ id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' }], [])
  assert.equal(result[0]?.atraso, 0)
})

test('retorno ainda futuro não é antecipado', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza', 30)], [{ id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-25', status: 'concluido' }], [])
  assert.equal(result.length, 0)
})

test('intervalo definido na cliente tem prioridade', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana', 60)], [service('limpeza', 30)], [{ id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-07-01', status: 'concluido' }], [])
  assert.equal(result[0]?.atraso, 11)
})

test('intervalo do serviço é usado quando cliente não sobrescreve', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza', 30)], [{ id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' }], [])
  assert.equal(result.length, 1)
})

test('sem intervalo de cliente e serviço não há retorno', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza')], [{ id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' }], [])
  assert.equal(result.length, 0)
})

test('agendamento futuro ativo do mesmo serviço suprime retorno', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza', 30)], [
    { id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' },
    { id: 'future', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-09-15', status: 'confirmado' },
  ], [])
  assert.equal(result.length, 0)
})

test('agendamento futuro cancelado não suprime retorno', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza', 30)], [
    { id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' },
    { id: 'future', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-09-15', status: 'cancelado' },
  ], [])
  assert.equal(result.length, 1)
})

test('cliente inativo não é retornado', () => {
  assert.equal(opportunitiesForDay('2026-09-10', attentionRadar, [client('ana', null, false)], [service('limpeza', 30)], [{ id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' }], []).length, 0)
})

test('atendimento cancelado não cria histórico de retorno', () => {
  assert.equal(opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza', 30)], [{ id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'cancelado' }], []).length, 0)
})

test('vários atendimentos do mesmo serviço geram apenas uma oportunidade', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza', 30)], [
    { id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-07-01', status: 'concluido' },
    { id: 'latest', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' },
  ], [])
  assert.equal(result.length, 1)
})

test('históricos de serviços diferentes podem gerar duas oportunidades', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana')], [service('limpeza', 30), service('design', 30)], [
    { id: 'one', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' },
    { id: 'two', cliente_id: 'ana', servico_id: 'design', data: '2026-08-01', status: 'concluido' },
  ], [])
  assert.equal(result.length, 2)
})

test('serviço só precisa caber integralmente em uma janela', () => {
  const result = opportunitiesForDay('2026-09-10', { ...attentionRadar, windows: [{ inicio: 840, fim: 870 }, { inicio: 900, fim: 1020 }] }, [client('ana')], [service('limpeza', 30, 60)], [{ id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' }], [])
  assert.deepEqual(result[0]?.janelas, [{ inicio: 900, fim: 1020 }])
})

test('dia sem atenção não consulta fontes', () => {
  assert.equal(opportunitiesForDay('2026-09-10', { ...attentionRadar, merece_atencao: false }, [client('ana')], [service('limpeza', 30)], [{ id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' }], []).length, 0)
})

test('dia sem capacidade não gera oportunidades', () => {
  assert.equal(opportunitiesForDay('2026-09-10', { ...attentionRadar, possui_capacidade: false }, [client('ana')], [service('limpeza', 30)], [{ id: 'old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' }], []).length, 0)
})

test('lista de espera aparece antes do retorno', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana'), client('bia')], [service('limpeza', 30)], [{ id: 'old', cliente_id: 'bia', servico_id: 'limpeza', data: '2026-07-01', status: 'concluido' }], [{ id: 'wait', cliente_id: 'ana', servico_id: 'limpeza', status: 'em_espera', prioridade: 1, profissional_id: null, data_preferida: null, periodo_preferido: null, inicio: null, fim: null }])
  assert.deepEqual(result.map((item) => item.origem), ['lista_espera', 'retorno'])
})

test('retornos ordenam pelo maior atraso primeiro', () => {
  const result = opportunitiesForDay('2026-09-10', attentionRadar, [client('ana'), client('bia')], [service('limpeza', 30)], [
    { id: 'ana-old', cliente_id: 'ana', servico_id: 'limpeza', data: '2026-06-01', status: 'concluido' },
    { id: 'bia-old', cliente_id: 'bia', servico_id: 'limpeza', data: '2026-08-01', status: 'concluido' },
  ], [])
  assert.deepEqual(result.map((item) => item.cliente_id), ['ana', 'bia'])
})
