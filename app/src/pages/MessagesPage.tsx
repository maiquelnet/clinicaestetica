import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Eraser, MessageCircle, Save, Send, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { EmptyState, LoadingBlock } from '../components/Ui'
import { PageHeader } from '../components/PageHeader'
import { useClinic } from '../contexts/useClinic'
import { formatDateTime } from '../lib/format'
import {
  activeRule,
  buildAlerts,
  buildWhatsAppUrl,
  messagingQueryOptions,
  messagesQueryKey,
  renderMessageText,
} from '../lib/messaging'
import type { MessageAlert } from '../lib/messaging'
import { supabase } from '../lib/supabase'
import type { MessageTemplate } from '../lib/types'

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
  const templateFormRef = useRef<HTMLElement>(null)
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(emptyTemplateDraft)
  const [manualClientId, setManualClientId] = useState('')
  const [manualTemplateId, setManualTemplateId] = useState('')
  const [manualAppointmentId, setManualAppointmentId] = useState('')

  const query = useQuery(messagingQueryOptions(activeClinicId))

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

  const invalidateMessages = () => queryClient.invalidateQueries({ queryKey: messagesQueryKey(activeClinicId) })

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

  function editTemplate(template: MessageTemplate) {
    setTemplateDraft(draftFromTemplate(template))
    window.requestAnimationFrame(() => {
      templateFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

          <div className="messages-workspace">
            <section className="panel list-panel messages-pending-panel">
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

            <section className="panel form-panel manual-message-panel">
                <div className="panel-header">
                  <h2>Envio manual</h2>
                </div>
                <div className="manual-fields">
                  <label>
                    Cliente
                    <select value={manualClientId} onChange={(event) => setManualClientId(event.target.value)}>
                      <option value="">Selecione</option>
                      {(data?.clients || []).map((client) => (
                        <option key={client.id} value={client.id}>{client.nome}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Modelo
                    <select value={manualTemplateId} onChange={(event) => setManualTemplateId(event.target.value)}>
                      <option value="">Selecione</option>
                      {(data?.templates || []).filter((template) => template.ativo).map((template) => (
                        <option key={template.id} value={template.id}>{template.nome}</option>
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
                          <option key={appointment.id} value={appointment.id}>{formatDateTime(appointment.inicio_em)}</option>
                        ))}
                    </select>
                  </label>
                </div>
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

            <section className="panel models-panel">
              <div className="panel-header">
                <h2>Modelos cadastrados</h2>
              </div>
              {data?.templates.length ? (
                <div className="record-list">
                  {data.templates.map((template) => {
                    const rule = activeRule(template)
                    return (
                      <article className="record-card template-card" key={template.id}>
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
                          <button className="ghost-button" type="button" onClick={() => editTemplate(template)}>Editar</button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <EmptyState title="Nenhum modelo cadastrado" />
              )}
            </section>

            <section className="panel form-panel template-form-panel" ref={templateFormRef}>
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
          </div>
        </>
      )}
    </main>
  )
}
