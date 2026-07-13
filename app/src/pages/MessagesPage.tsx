import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { Check, Eraser, MessageCircle, Save, Send, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, LoadingBlock } from '../components/Ui'
import { PageHeader } from '../components/PageHeader'
import { useClinic } from '../contexts/useClinic'
import { formatDateTime } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  Appointment,
  Client,
  DismissedMessage,
  MessageLog,
  MessageRule,
  MessageTemplate,
  Service,
} from '../lib/types'

type MessagingData = {
  clients: Client[]
  services: Service[]
  appointments: Appointment[]
  templates: MessageTemplate[]
  logs: MessageLog[]
  dismissed: DismissedMessage[]
}

type MessageAlert = {
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

type TemplateDraft = {
  id: string
  ruleId: string
  tipo: string
  nome: string
  texto: string
  ativo: boolean
  prioridade: string
  gatilho: string
  quantidade: string
  unidade: string
  direcao: string
  janela_alerta_dias: string
}

const emptyTemplateDraft: TemplateDraft = {
  id: '',
  ruleId: '',
  tipo: '',
  nome: '',
  texto: '',
  ativo: true,
  prioridade: '9',
  gatilho: 'manual',
  quantidade: '',
  unidade: '',
  direcao: '',
  janela_alerta_dias: '',
}

async function fetchMessagingData(clinicId: string): Promise<MessagingData> {
  const [clients, services, appointments, templates, logs, dismissed] = await Promise.all([
    supabase
      .from('clientes')
      .select('*')
      .eq('clinica_id', clinicId)
      .eq('ativo', true)
      .is('arquivado_em', null)
      .order('nome', { ascending: true }),
    supabase
      .from('servicos')
      .select('*')
      .eq('clinica_id', clinicId)
      .is('arquivado_em', null)
      .order('nome', { ascending: true }),
    supabase
      .from('agendamentos')
      .select('*')
      .eq('clinica_id', clinicId)
      .is('arquivado_em', null)
      .order('inicio_em', { ascending: false }),
    supabase
      .from('modelos_mensagens')
      .select('*,regras_mensagens(*)')
      .eq('clinica_id', clinicId)
      .is('arquivado_em', null)
      .order('prioridade', { ascending: true }),
    supabase
      .from('logs_mensagens')
      .select('*')
      .eq('clinica_id', clinicId)
      .order('criado_em', { ascending: false })
      .limit(1000),
    supabase
      .from('mensagens_dispensadas')
      .select('*')
      .eq('clinica_id', clinicId)
      .order('criado_em', { ascending: false })
      .limit(1000),
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

function activeRule(template: MessageTemplate) {
  return (template.regras_mensagens || []).find((rule) => rule.ativo) || null
}

function addRuleOffset(baseDate: Date, rule: MessageRule, overrideAmount?: number) {
  const amount = overrideAmount ?? Number(rule.quantidade || 0)
  const direction = rule.direcao === 'antes' ? -1 : 1
  const result = new Date(baseDate.getTime())

  if (rule.unidade === 'dias') {
    result.setDate(result.getDate() + direction * amount)
  } else {
    result.setHours(result.getHours() + direction * amount)
  }

  return result
}

function buildWhatsAppUrl(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`
}

function renderMessageText(
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
    .sort((a, b) => {
      const aDate = a.enviado_em || a.criado_em
      const bDate = b.enviado_em || b.criado_em
      return bDate.localeCompare(aDate)
    })[0] || null
}

function isCanceled(appointment: Appointment) {
  return appointment.status === 'cancelado'
}

function buildAppointmentCycle(type: string, appointmentId: string) {
  return `${type}:agendamento:${appointmentId}`
}

function buildAlerts(data: MessagingData) {
  const now = new Date()
  const clientMap = new Map(data.clients.map((client) => [client.id, client]))
  const serviceMap = new Map(data.services.map((service) => [service.id, service]))
  const sentCycles = new Set(data.logs.map((log) => log.ciclo).filter(Boolean))
  const dismissedCycles = new Set(data.dismissed.map((dismissed) => dismissed.ciclo))
  const activeTemplates = data.templates
    .filter((template) => template.ativo)
    .sort((a, b) => Number(a.prioridade || 9) - Number(b.prioridade || 9))
  const activeAppointments = data.appointments.filter((appointment) => !isCanceled(appointment))
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
      pushAlert(
        template,
        client,
        appointment,
        service,
        dueAt,
        appointment.inicio_em,
        buildAppointmentCycle(template.tipo, appointment.id),
      )
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
      const expiresAt = addDays(dueAt, windowDays + 1)
      if (now < dueAt || now >= expiresAt) return
      const cycle = `${template.tipo}:${client.id}:${now.getFullYear()}`
      pushAlert(template, client, null, null, dueAt, client.data_nascimento, cycle)
    })
  })

  activeTemplates.forEach((template) => {
    const rule = activeRule(template)
    if (!rule || rule.gatilho !== 'ultimo_agendamento') return

    data.clients.forEach((client) => {
      const clientAppointments = activeAppointments
        .filter((appointment) => appointment.cliente_id === client.id)
        .sort((a, b) => b.inicio_em.localeCompare(a.inicio_em))
      const futureAppointment = clientAppointments.some((appointment) => parseISO(appointment.inicio_em) > now)
      if (futureAppointment) return

      const lastAppointment = clientAppointments.find((appointment) => parseISO(appointment.inicio_em) < now)
      if (!lastAppointment) return

      const service = lastAppointment.servico_id ? serviceMap.get(lastAppointment.servico_id) || null : null
      const returnDays = client.intervalo_retorno_dias ?? service?.intervalo_retorno_dias ?? Number(rule.quantidade || 20)
      const dueAt = addRuleOffset(parseISO(lastAppointment.inicio_em), { ...rule, unidade: 'dias', direcao: 'depois' }, returnDays)
      if (now < dueAt) return

      const cycle = `${template.tipo}:${client.id}:${lastAppointment.id}`
      pushAlert(template, client, lastAppointment, service, dueAt, lastAppointment.inicio_em, cycle)
    })
  })

  return alerts.sort((a, b) => {
    const dueDiff = a.dataVencimento.localeCompare(b.dataVencimento)
    if (dueDiff !== 0) return dueDiff
    return a.prioridade - b.prioridade
  })
}

function draftFromTemplate(template: MessageTemplate): TemplateDraft {
  const rule = activeRule(template)
  return {
    id: template.id,
    ruleId: rule?.id || '',
    tipo: template.tipo,
    nome: template.nome,
    texto: template.texto,
    ativo: template.ativo,
    prioridade: String(template.prioridade || 9),
    gatilho: rule?.gatilho || 'manual',
    quantidade: rule?.quantidade === null || rule?.quantidade === undefined ? '' : String(rule.quantidade),
    unidade: rule?.unidade || '',
    direcao: rule?.direcao || '',
    janela_alerta_dias: rule?.janela_alerta_dias === null || rule?.janela_alerta_dias === undefined ? '' : String(rule.janela_alerta_dias),
  }
}

export function MessagesPage() {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(emptyTemplateDraft)
  const [manualClientId, setManualClientId] = useState('')
  const [manualTemplateId, setManualTemplateId] = useState('')
  const [manualAppointmentId, setManualAppointmentId] = useState('')

  const query = useQuery({
    queryKey: ['messages', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: () => fetchMessagingData(activeClinicId!),
  })

  const data = query.data
  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data])
  const groupedAlerts = useMemo(() => {
    return alerts.reduce<Record<string, MessageAlert[]>>((groups, alert) => {
      const clientAlerts = groups[alert.clienteId] ?? []
      clientAlerts.push(alert)
      groups[alert.clienteId] = clientAlerts
      return groups
    }, {})
  }, [alerts])

  const selectedManualClient = data?.clients.find((client) => client.id === manualClientId) || null
  const selectedManualTemplate = data?.templates.find((template) => template.id === manualTemplateId) || null
  const selectedManualAppointment =
    data?.appointments.find((appointment) => appointment.id === manualAppointmentId) || null
  const selectedManualService =
    selectedManualAppointment?.servico_id && data
      ? data.services.find((service) => service.id === selectedManualAppointment.servico_id) || null
      : null
  const manualText =
    selectedManualClient && selectedManualTemplate
      ? renderMessageText(selectedManualTemplate, selectedManualClient, selectedManualAppointment, selectedManualService)
      : ''
  const manualWhatsappUrl =
    selectedManualClient && manualText ? buildWhatsAppUrl(selectedManualClient.telefone, manualText) : ''

  const invalidateMessages = () => queryClient.invalidateQueries({ queryKey: ['messages', activeClinicId] })

  const registerMessage = useMutation({
    mutationFn: async (payload: {
      clienteId: string
      agendamentoId: string | null
      modeloMensagemId: string
      tipo: string
      ciclo: string
      texto: string
      observacao?: string
    }) => {
      const { error } = await supabase.from('logs_mensagens').insert({
        clinica_id: activeClinicId,
        cliente_id: payload.clienteId,
        agendamento_id: payload.agendamentoId,
        modelo_mensagem_id: payload.modeloMensagemId,
        canal: 'whatsapp_manual',
        texto: payload.texto,
        ciclo: payload.ciclo,
        status: 'enviado',
        enviado_em: new Date().toISOString(),
        observacao: payload.observacao || null,
      })
      if (error) throw error
    },
    onSuccess: invalidateMessages,
  })

  const dismissAlert = useMutation({
    mutationFn: async (alert: MessageAlert) => {
      const { error } = await supabase.from('mensagens_dispensadas').insert({
        clinica_id: activeClinicId,
        cliente_id: alert.clienteId,
        agendamento_id: alert.agendamentoId,
        modelo_mensagem_id: alert.modeloMensagemId,
        tipo: alert.tipo,
        ciclo: alert.ciclo,
        motivo: 'Dispensado pelo painel',
        dispensado_em: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: invalidateMessages,
  })

  const saveTemplate = useMutation({
    mutationFn: async (draft: TemplateDraft) => {
      const templatePayload = {
        clinica_id: activeClinicId,
        tipo: draft.tipo.trim(),
        nome: draft.nome.trim(),
        texto: draft.texto.trim(),
        ativo: draft.ativo,
        prioridade: Number(draft.prioridade || 9),
        atualizado_em: new Date().toISOString(),
      }

      if (!templatePayload.tipo || !templatePayload.nome || !templatePayload.texto) {
        throw new Error('Informe tipo, nome e texto da mensagem.')
      }

      const templateRequest = draft.id
        ? supabase.from('modelos_mensagens').update(templatePayload).eq('id', draft.id).select('*').single()
        : supabase.from('modelos_mensagens').insert(templatePayload).select('*').single()
      const { data: savedTemplate, error } = await templateRequest
      if (error) throw error
      if (!savedTemplate) throw new Error('Modelo de mensagem nao retornado.')

      const rulePayload = {
        clinica_id: activeClinicId,
        modelo_mensagem_id: savedTemplate.id,
        gatilho: draft.gatilho,
        quantidade: draft.quantidade === '' ? null : Number(draft.quantidade),
        unidade: draft.unidade || null,
        direcao: draft.direcao || null,
        janela_alerta_dias: draft.janela_alerta_dias === '' ? null : Number(draft.janela_alerta_dias),
        canal_padrao: 'whatsapp_manual',
        ativo: true,
        atualizado_em: new Date().toISOString(),
      }

      const ruleRequest = draft.ruleId
        ? supabase.from('regras_mensagens').update(rulePayload).eq('id', draft.ruleId)
        : supabase.from('regras_mensagens').insert(rulePayload)
      const { error: ruleError } = await ruleRequest
      if (ruleError) throw ruleError
    },
    onSuccess: async () => {
      setTemplateDraft(emptyTemplateDraft)
      await invalidateMessages()
    },
  })

  function openWhatsApp(url: string) {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function registerAlert(alert: MessageAlert) {
    return registerMessage.mutateAsync({
      clienteId: alert.clienteId,
      agendamentoId: alert.agendamentoId,
      modeloMensagemId: alert.modeloMensagemId,
      tipo: alert.tipo,
      ciclo: alert.ciclo,
      texto: alert.texto,
      observacao: 'Alerta do painel',
    })
  }

  function registerManualMessage() {
    if (!selectedManualClient || !selectedManualTemplate || !manualText) return
    const cycle = `manual:${selectedManualClient.id}:${selectedManualTemplate.tipo}:${Date.now()}`
    return registerMessage.mutateAsync({
      clienteId: selectedManualClient.id,
      agendamentoId: selectedManualAppointment?.id ?? null,
      modeloMensagemId: selectedManualTemplate.id,
      tipo: selectedManualTemplate.tipo,
      ciclo: cycle,
      texto: manualText,
      observacao: 'Envio manual',
    })
  }

  return (
    <main className="content-page">
      <PageHeader
        eyebrow="Mensagens"
        title="Controle de mensagens"
        description="Acompanhe pendencias por cliente, abra WhatsApp e registre envios ou dispensas."
      />

      {query.isLoading ? (
        <LoadingBlock />
      ) : (
        <>
          <section className="metric-grid">
            <article className="metric-card">
              <MessageCircle size={20} />
              <span>Pendentes</span>
              <strong>{alerts.length}</strong>
            </article>
            <article className="metric-card">
              <Send size={20} />
              <span>Clientes com alerta</span>
              <strong>{Object.keys(groupedAlerts).length}</strong>
            </article>
            <article className="metric-card">
              <Check size={20} />
              <span>Enviadas registradas</span>
              <strong>{data?.logs.filter((log) => log.status === 'enviado').length ?? 0}</strong>
            </article>
            <article className="metric-card">
              <Trash2 size={20} />
              <span>Dispensadas</span>
              <strong>{data?.dismissed.length ?? 0}</strong>
            </article>
          </section>

          <div className="messages-grid">
            <section className="panel list-panel">
              <div className="panel-header">
                <h2>Pendencias por cliente</h2>
              </div>
              {alerts.length ? (
                <div className="client-alert-list">
                  {Object.entries(groupedAlerts).map(([clientId, clientAlerts]) => {
                    const firstAlert = clientAlerts[0]
                    if (!firstAlert) return null
                    return (
                      <section className="client-alert-group" key={clientId}>
                        <div className="group-header">
                          <h3>{firstAlert.clienteNome}</h3>
                          <span>
                            Ultima mensagem:{' '}
                            {firstAlert.ultimaMensagem
                              ? formatDateTime(firstAlert.ultimaMensagem.enviado_em || firstAlert.ultimaMensagem.criado_em)
                              : 'sem registro'}
                          </span>
                        </div>
                        <div className="record-list">
                          {clientAlerts.map((alert) => (
                          <article className="record-card message-alert-card" key={alert.id}>
                            <div>
                              <h3>{alert.tipoLabel}</h3>
                              <div className="record-meta">
                                <span className="badge cancelado">Nao enviada</span>
                                <span>Venceu {formatDateTime(alert.dataVencimento)}</span>
                                {alert.servicoNome ? <span>{alert.servicoNome}</span> : null}
                              </div>
                              <p className="message-preview">{alert.texto}</p>
                            </div>
                            <div className="record-actions">
                              <button className="primary-button" type="button" onClick={() => openWhatsApp(alert.whatsappUrl)}>
                                <Send size={16} />
                                WhatsApp
                              </button>
                              <button className="ghost-button" type="button" onClick={() => void registerAlert(alert)}>
                                <Check size={16} />
                                Marcar enviada
                              </button>
                              <button className="danger-button" type="button" onClick={() => void dismissAlert.mutateAsync(alert)}>
                                <Trash2 size={16} />
                                Dispensar
                              </button>
                            </div>
                          </article>
                          ))}
                        </div>
                      </section>
                    )
                  })}
                </div>
              ) : (
                <EmptyState title="Nenhuma mensagem pendente" />
              )}
            </section>

            <aside className="side-stack">
              <section className="panel form-panel">
                <div className="panel-header">
                  <h2>Envio manual</h2>
                </div>
                <label>
                  Cliente
                  <select value={manualClientId} onChange={(event) => setManualClientId(event.target.value)}>
                    <option value="">Selecione</option>
                    {(data?.clients || []).map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Modelo
                  <select value={manualTemplateId} onChange={(event) => setManualTemplateId(event.target.value)}>
                    <option value="">Selecione</option>
                    {(data?.templates || []).filter((template) => template.ativo).map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Agendamento vinculado
                  <select value={manualAppointmentId} onChange={(event) => setManualAppointmentId(event.target.value)}>
                    <option value="">Sem agendamento</option>
                    {(data?.appointments || [])
                      .filter((appointment) => !manualClientId || appointment.cliente_id === manualClientId)
                      .slice(0, 40)
                      .map((appointment) => (
                        <option key={appointment.id} value={appointment.id}>
                          {formatDateTime(appointment.inicio_em)}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="manual-preview">{manualText || 'Selecione cliente e modelo para ver a mensagem.'}</div>
                <div className="record-actions">
                  <button className="primary-button" type="button" disabled={!manualWhatsappUrl} onClick={() => openWhatsApp(manualWhatsappUrl)}>
                    <Send size={16} />
                    WhatsApp
                  </button>
                  <button className="ghost-button" type="button" disabled={!manualText} onClick={() => void registerManualMessage()}>
                    <Check size={16} />
                    Registrar envio
                  </button>
                </div>
              </section>

              <section className="panel form-panel">
                <div className="panel-header">
                  <h2>{templateDraft.id ? 'Editar modelo' : 'Novo modelo'}</h2>
                  <button className="ghost-button" type="button" onClick={() => setTemplateDraft(emptyTemplateDraft)}>
                    <Eraser size={16} />
                    Limpar
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    Nome
                    <input value={templateDraft.nome} onChange={(event) => setTemplateDraft({ ...templateDraft, nome: event.target.value })} />
                  </label>
                  <label>
                    Tipo
                    <input value={templateDraft.tipo} onChange={(event) => setTemplateDraft({ ...templateDraft, tipo: event.target.value })} />
                  </label>
                </div>
                <label>
                  Texto
                  <textarea rows={5} value={templateDraft.texto} onChange={(event) => setTemplateDraft({ ...templateDraft, texto: event.target.value })} />
                </label>
                <div className="form-grid">
                  <label>
                    Regra
                    <select value={templateDraft.gatilho} onChange={(event) => setTemplateDraft({ ...templateDraft, gatilho: event.target.value })}>
                      <option value="manual">Manual</option>
                      <option value="agendamento_criado">Agendamento criado</option>
                      <option value="inicio_agendamento">Inicio do agendamento</option>
                      <option value="aniversario">Aniversario</option>
                      <option value="ultimo_agendamento">Ultimo agendamento</option>
                    </select>
                  </label>
                  <label>
                    Tempo
                    <input type="number" min={0} value={templateDraft.quantidade} onChange={(event) => setTemplateDraft({ ...templateDraft, quantidade: event.target.value })} />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Unidade
                    <select value={templateDraft.unidade} onChange={(event) => setTemplateDraft({ ...templateDraft, unidade: event.target.value })}>
                      <option value="">Sem tempo</option>
                      <option value="horas">Horas</option>
                      <option value="dias">Dias</option>
                    </select>
                  </label>
                  <label>
                    Direcao
                    <select value={templateDraft.direcao} onChange={(event) => setTemplateDraft({ ...templateDraft, direcao: event.target.value })}>
                      <option value="">Sem direcao</option>
                      <option value="antes">Antes</option>
                      <option value="depois">Depois</option>
                    </select>
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Janela de alerta em dias
                    <input type="number" min={0} placeholder="7 para aniversario" value={templateDraft.janela_alerta_dias} onChange={(event) => setTemplateDraft({ ...templateDraft, janela_alerta_dias: event.target.value })} />
                  </label>
                  <label>
                    Prioridade
                    <input type="number" min={1} value={templateDraft.prioridade} onChange={(event) => setTemplateDraft({ ...templateDraft, prioridade: event.target.value })} />
                  </label>
                </div>
                <label className="check-row">
                  <input type="checkbox" checked={templateDraft.ativo} onChange={(event) => setTemplateDraft({ ...templateDraft, ativo: event.target.checked })} />
                  Modelo ativo
                </label>
                {saveTemplate.error ? <div className="form-alert">{saveTemplate.error.message}</div> : null}
                <button className="primary-button" type="button" disabled={saveTemplate.isPending} onClick={() => void saveTemplate.mutateAsync(templateDraft)}>
                  <Save size={18} />
                  {saveTemplate.isPending ? 'Salvando...' : 'Salvar modelo'}
                </button>
              </section>
            </aside>
          </div>

          <section className="panel">
            <div className="panel-header">
              <h2>Modelos cadastrados</h2>
            </div>
            {data?.templates.length ? (
              <div className="record-list">
                {data.templates.map((template) => {
                  const rule = activeRule(template)
                  return (
                    <article className="record-card" key={template.id}>
                      <div>
                        <h3>{template.nome}</h3>
                        <div className="record-meta">
                          <span>{template.tipo}</span>
                          <span>{rule?.gatilho || 'manual'}</span>
                          {rule?.quantidade !== null && rule?.quantidade !== undefined ? <span>{rule.quantidade} {rule.unidade}</span> : null}
                          {rule?.janela_alerta_dias ? <span>Janela {rule.janela_alerta_dias} dias</span> : null}
                          <span className={`badge ${template.ativo ? 'success' : 'warning'}`}>{template.ativo ? 'Ativo' : 'Inativo'}</span>
                        </div>
                        <p className="message-preview">{template.texto}</p>
                      </div>
                      <div className="record-actions">
                        <button className="ghost-button" type="button" onClick={() => setTemplateDraft(draftFromTemplate(template))}>
                          Editar
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <EmptyState title="Nenhum modelo cadastrado" />
            )}
          </section>
        </>
      )}
    </main>
  )
}
