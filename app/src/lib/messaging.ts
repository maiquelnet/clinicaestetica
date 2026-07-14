import { addDays, format, parseISO } from 'date-fns'
import { supabase } from './supabase'
import type {
  Appointment,
  Client,
  DismissedMessage,
  MessageLog,
  MessageRule,
  MessageTemplate,
  Service,
} from './types'

export const messagesQueryKey = (clinicId: string | null) => ['messages', clinicId] as const

export const messagingQueryOptions = (clinicId: string | null) => ({
  queryKey: messagesQueryKey(clinicId),
  enabled: Boolean(clinicId),
  queryFn: () => fetchMessagingData(clinicId!),
  staleTime: 60_000,
})

export type MessagingData = {
  clients: Client[]
  services: Service[]
  appointments: Appointment[]
  templates: MessageTemplate[]
  logs: MessageLog[]
  dismissed: DismissedMessage[]
}

export type MessageAlert = {
  id: string
  tipo: string
  tipoLabel: string
  clienteId: string
  clienteNome: string
  telefone: string
  agendamentoId: string | null
  modeloMensagemId: string
  servicoNome: string
  dataVencimento: string
  dataReferencia: string | null
  ciclo: string
  texto: string
  whatsappUrl: string
  ultimaMensagem: MessageLog | null
  status: 'pendente' | 'atrasado'
  prioridade: number
}

export async function fetchMessagingData(clinicId: string): Promise<MessagingData> {
  const [clients, services, appointments, templates, logs, dismissed] = await Promise.all([
    supabase.from('clientes').select('*').eq('clinica_id', clinicId).eq('ativo', true).is('arquivado_em', null).order('nome'),
    supabase.from('servicos').select('*').eq('clinica_id', clinicId).is('arquivado_em', null).order('nome'),
    supabase.from('agendamentos').select('*').eq('clinica_id', clinicId).is('arquivado_em', null).order('inicio_em', { ascending: false }),
    supabase.from('modelos_mensagens').select('*,regras_mensagens(*)').eq('clinica_id', clinicId).is('arquivado_em', null).order('prioridade'),
    supabase.from('logs_mensagens').select('*').eq('clinica_id', clinicId).order('criado_em', { ascending: false }).limit(1000),
    supabase.from('mensagens_dispensadas').select('*').eq('clinica_id', clinicId).order('criado_em', { ascending: false }).limit(1000),
  ])

  if (clients.error) throw clients.error
  if (services.error) throw services.error
  if (appointments.error) throw appointments.error
  if (templates.error) throw templates.error
  if (logs.error) throw logs.error
  if (dismissed.error) throw dismissed.error

  return {
    clients: (clients.data || []) as Client[],
    services: (services.data || []) as Service[],
    appointments: (appointments.data || []) as Appointment[],
    templates: (templates.data || []) as MessageTemplate[],
    logs: (logs.data || []) as MessageLog[],
    dismissed: (dismissed.data || []) as DismissedMessage[],
  }
}

export function activeRule(template: MessageTemplate) {
  return (template.regras_mensagens || []).find((rule) => rule.ativo) || null
}

function addRuleOffset(baseDate: Date, rule: MessageRule, overrideAmount?: number) {
  const amount = overrideAmount ?? Number(rule.quantidade || 0)
  const direction = rule.direcao === 'antes' ? -1 : 1
  const result = new Date(baseDate.getTime())

  if (rule.unidade === 'dias') result.setDate(result.getDate() + direction * amount)
  else result.setHours(result.getHours() + direction * amount)

  return result
}

export function buildWhatsAppUrl(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`
}

export function renderMessageText(
  template: MessageTemplate,
  client: Client,
  appointment: Appointment | null,
  service: Service | null,
) {
  const appointmentDate = appointment ? parseISO(appointment.inicio_em) : null
  const replacements: Record<string, string> = {
    nome: client.nome || '',
    data: appointmentDate ? format(appointmentDate, 'dd/MM/yyyy') : '',
    hora: appointmentDate ? format(appointmentDate, 'HH:mm') : '',
    servico: service?.nome || 'atendimento',
    link_avaliacao_google: '[link de avaliacao]',
    campanha: 'esta campanha',
  }

  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
    template.texto,
  )
}

function latestLogForClient(logs: MessageLog[], clientId: string) {
  return logs
    .filter((log) => log.cliente_id === clientId && log.status === 'enviado')
    .sort((a, b) => (b.enviado_em || b.criado_em).localeCompare(a.enviado_em || a.criado_em))[0] || null
}

export function buildAlerts(data: MessagingData) {
  const now = new Date()
  const clientMap = new Map(data.clients.map((client) => [client.id, client]))
  const serviceMap = new Map(data.services.map((service) => [service.id, service]))
  const sentCycles = new Set(data.logs.map((log) => log.ciclo).filter(Boolean))
  const dismissedCycles = new Set(data.dismissed.map((dismissed) => dismissed.ciclo))
  const activeTemplates = data.templates
    .filter((template) => template.ativo)
    .sort((a, b) => Number(a.prioridade || 9) - Number(b.prioridade || 9))
  const activeAppointments = data.appointments.filter((appointment) => appointment.status !== 'cancelado')
  const alerts: MessageAlert[] = []

  function pushAlert(
    template: MessageTemplate,
    client: Client,
    appointment: Appointment | null,
    service: Service | null,
    dueAt: Date,
    reference: string | null,
    cycle: string,
  ) {
    if (sentCycles.has(cycle) || dismissedCycles.has(cycle)) return
    const text = renderMessageText(template, client, appointment, service)
    alerts.push({
      id: cycle,
      tipo: template.tipo,
      tipoLabel: template.nome,
      clienteId: client.id,
      clienteNome: client.nome,
      telefone: client.telefone,
      agendamentoId: appointment?.id ?? null,
      modeloMensagemId: template.id,
      servicoNome: service?.nome || '',
      dataVencimento: dueAt.toISOString(),
      dataReferencia: reference,
      ciclo: cycle,
      texto: text,
      whatsappUrl: buildWhatsAppUrl(client.telefone, text),
      ultimaMensagem: latestLogForClient(data.logs, client.id),
      status: now > dueAt ? 'atrasado' : 'pendente',
      prioridade: Number(template.prioridade || 9),
    })
  }

  activeAppointments.forEach((appointment) => {
    const client = clientMap.get(appointment.cliente_id)
    const service = appointment.servico_id ? serviceMap.get(appointment.servico_id) || null : null
    if (!client) return

    activeTemplates.forEach((template) => {
      const rule = activeRule(template)
      if (!rule || !['agendamento_criado', 'inicio_agendamento'].includes(rule.gatilho)) return
      const base = rule.gatilho === 'agendamento_criado' ? appointment.criado_em : appointment.inicio_em
      const dueAt = addRuleOffset(parseISO(base), rule)
      if (now < dueAt) return
      pushAlert(template, client, appointment, service, dueAt, appointment.inicio_em, `${template.tipo}:agendamento:${appointment.id}`)
    })
  })

  activeTemplates.forEach((template) => {
    const rule = activeRule(template)
    if (!rule || rule.gatilho !== 'aniversario') return
    const windowDays = Number(rule.janela_alerta_dias ?? 7)

    data.clients.forEach((client) => {
      if (!client.data_nascimento) return
      const birthDate = parseISO(client.data_nascimento)
      const dueAt = new Date(now.getFullYear(), birthDate.getMonth(), birthDate.getDate(), 8, 0, 0)
      if (now < dueAt || now >= addDays(dueAt, windowDays + 1)) return
      pushAlert(template, client, null, null, dueAt, client.data_nascimento, `${template.tipo}:${client.id}:${now.getFullYear()}`)
    })
  })

  activeTemplates.forEach((template) => {
    const rule = activeRule(template)
    if (!rule || rule.gatilho !== 'ultimo_agendamento') return

    data.clients.forEach((client) => {
      const clientAppointments = activeAppointments
        .filter((appointment) => appointment.cliente_id === client.id)
        .sort((a, b) => b.inicio_em.localeCompare(a.inicio_em))
      if (clientAppointments.some((appointment) => parseISO(appointment.inicio_em) > now)) return

      const lastAppointment = clientAppointments.find((appointment) => parseISO(appointment.inicio_em) < now)
      if (!lastAppointment) return
      const service = lastAppointment.servico_id ? serviceMap.get(lastAppointment.servico_id) || null : null
      const returnDays = client.intervalo_retorno_dias ?? service?.intervalo_retorno_dias ?? Number(rule.quantidade || 20)
      const dueAt = addRuleOffset(parseISO(lastAppointment.inicio_em), { ...rule, unidade: 'dias', direcao: 'depois' }, returnDays)
      if (now < dueAt) return
      pushAlert(template, client, lastAppointment, service, dueAt, lastAppointment.inicio_em, `${template.tipo}:${client.id}:${lastAppointment.id}`)
    })
  })

  return alerts.sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento) || a.prioridade - b.prioridade)
}
