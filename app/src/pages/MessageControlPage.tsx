import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CircleAlert, History, MessageCircle, Search, Send, Trash2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MessageSectionNav } from '../components/MessageSectionNav'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, LoadingBlock } from '../components/Ui'
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

export function MessagesPage() {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [view, setView] = useState<'pending' | 'history'>('pending')
  const [historySearch, setHistorySearch] = useState('')
  const [historyStatus, setHistoryStatus] = useState('todos')
  const [manualClientId, setManualClientId] = useState('')
  const [manualTemplateId, setManualTemplateId] = useState('')
  const [manualAppointmentId, setManualAppointmentId] = useState('')
  const query = useQuery(messagingQueryOptions(activeClinicId))
  const data = query.data
  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data])
  const groupedAlerts = useMemo(() => alerts.reduce<Record<string, MessageAlert[]>>((groups, alert) => {
    groups[alert.clienteId] = [...(groups[alert.clienteId] || []), alert]
    return groups
  }, {}), [alerts])
  const clientNames = useMemo(() => new Map((data?.clients || []).map((client) => [client.id, client.nome])), [data?.clients])
  const templateNames = useMemo(() => new Map((data?.templates || []).map((template) => [template.id, template.nome])), [data?.templates])
  const selectedClient = data?.clients.find((client) => client.id === manualClientId) || null
  const selectedTemplate = data?.templates.find((template) => template.id === manualTemplateId) || null
  const selectedAppointment = data?.appointments.find((appointment) => appointment.id === manualAppointmentId) || null
  const selectedService = selectedAppointment?.servico_id && data
    ? data.services.find((service) => service.id === selectedAppointment.servico_id) || null
    : null
  const manualText = selectedClient && selectedTemplate
    ? renderMessageText(selectedTemplate, selectedClient, selectedAppointment, selectedService)
    : ''
  const manualWhatsappUrl = selectedClient && manualText ? buildWhatsAppUrl(selectedClient.telefone, manualText) : ''
  const filteredLogs = useMemo(() => {
    const term = historySearch.trim().toLocaleLowerCase('pt-BR')
    return (data?.logs || []).filter((log) => {
      const matchesStatus = historyStatus === 'todos' || log.status === historyStatus
      const haystack = `${clientNames.get(log.cliente_id) || ''} ${templateNames.get(log.modelo_mensagem_id || '') || ''} ${log.texto}`.toLocaleLowerCase('pt-BR')
      return matchesStatus && (!term || haystack.includes(term))
    })
  }, [clientNames, data?.logs, historySearch, historyStatus, templateNames])
  const sentCount = data?.logs.filter((log) => ['enviado', 'entregue', 'lido'].includes(log.status)).length || 0
  const errorCount = data?.logs.filter((log) => log.status === 'erro').length || 0
  const invalidateMessages = () => queryClient.invalidateQueries({ queryKey: messagesQueryKey(activeClinicId) })

  const registerMessage = useMutation({
    mutationFn: async (payload: { clienteId: string; agendamentoId: string | null; modeloMensagemId: string; ciclo: string; texto: string; observacao: string }) => {
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
        observacao: payload.observacao,
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

  function openWhatsApp(url: string) {
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  function registerAlert(alert: MessageAlert) {
    return registerMessage.mutateAsync({
      clienteId: alert.clienteId,
      agendamentoId: alert.agendamentoId,
      modeloMensagemId: alert.modeloMensagemId,
      ciclo: alert.ciclo,
      texto: alert.texto,
      observacao: 'Alerta do painel',
    })
  }

  function registerManualMessage() {
    if (!selectedClient || !selectedTemplate || !manualText) return
    return registerMessage.mutateAsync({
      clienteId: selectedClient.id,
      agendamentoId: selectedAppointment?.id ?? null,
      modeloMensagemId: selectedTemplate.id,
      ciclo: `manual:${selectedClient.id}:${selectedTemplate.tipo}:${Date.now()}`,
      texto: manualText,
      observacao: 'Envio manual',
    })
  }

  return (
    <main className="content-page message-control-page">
      <PageHeader eyebrow="Mensagens" title="Controle de envios" description="Veja o que precisa ser enviado e acompanhe o hist?rico em um s? lugar." />
      <MessageSectionNav pendingCount={alerts.length} />
      {query.error ? <div className="form-alert">{query.error.message}</div> : null}
      {registerMessage.error || dismissAlert.error ? <div className="form-alert">{(registerMessage.error || dismissAlert.error)?.message}</div> : null}
      {query.isLoading ? <LoadingBlock /> : <>
        <section className="metric-grid message-metrics" aria-label="Resumo das mensagens">
          <article className="metric-card"><MessageCircle size={20} /><span>Pendentes</span><strong>{alerts.length}</strong></article>
          <article className="metric-card"><Users size={20} /><span>Clientes aguardando</span><strong>{Object.keys(groupedAlerts).length}</strong></article>
          <article className="metric-card"><Check size={20} /><span>Envios registrados</span><strong>{sentCount}</strong></article>
          <article className="metric-card"><CircleAlert size={20} /><span>Com erro</span><strong>{errorCount}</strong></article>
        </section>

        <details className="panel message-composer">
          <summary><span><Send size={18} /> Enviar mensagem manualmente</span><small>Escolha cliente, modelo e agendamento</small></summary>
          <div className="message-composer-body">
            <div className="manual-fields">
              <label>Cliente<select value={manualClientId} onChange={(event) => { setManualClientId(event.target.value); setManualAppointmentId('') }}><option value="">Selecione</option>{(data?.clients || []).map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></label>
              <label>Modelo<select value={manualTemplateId} onChange={(event) => setManualTemplateId(event.target.value)}><option value="">Selecione</option>{(data?.templates || []).filter((template) => template.ativo && activeRule(template)?.canal_padrao !== 'whatsapp_business').map((template) => <option key={template.id} value={template.id}>{template.nome}</option>)}</select></label>
              <label>Agendamento vinculado<select value={manualAppointmentId} onChange={(event) => setManualAppointmentId(event.target.value)}><option value="">Sem agendamento</option>{(data?.appointments || []).filter((appointment) => !manualClientId || appointment.cliente_id === manualClientId).slice(0, 40).map((appointment) => <option key={appointment.id} value={appointment.id}>{formatDateTime(appointment.inicio_em)}</option>)}</select></label>
            </div>
            <div className="manual-preview">{manualText || 'A mensagem pronta aparecer? aqui.'}</div>
            <div className="record-actions">
              <button className="primary-button" type="button" disabled={!manualWhatsappUrl} onClick={() => openWhatsApp(manualWhatsappUrl)}><Send size={16} /> Abrir WhatsApp</button>
              <button className="ghost-button" type="button" disabled={!manualText || registerMessage.isPending} onClick={() => void registerManualMessage()}><Check size={16} /> Registrar envio</button>
            </div>
          </div>
        </details>

        <div className="message-view-switch" role="tablist" aria-label="Visualiza??o das mensagens">
          <button className={view === 'pending' ? 'active' : ''} type="button" role="tab" aria-selected={view === 'pending'} onClick={() => setView('pending')}>Pendentes <span>{alerts.length}</span></button>
          <button className={view === 'history' ? 'active' : ''} type="button" role="tab" aria-selected={view === 'history'} onClick={() => setView('history')}>Hist?rico</button>
        </div>

        {view === 'pending' ? <section className="panel list-panel messages-pending-panel">
          <div className="panel-header"><div><h2>Pr?ximas a??es</h2><p>Organizadas por cliente e vencimento.</p></div></div>
          {alerts.length ? <div className="client-alert-list">{Object.entries(groupedAlerts).map(([clientId, clientAlerts]) => {
            const firstAlert = clientAlerts[0]
            if (!firstAlert) return null
            return <section className="client-alert-group" key={clientId}>
              <div className="group-header"><h3>{firstAlert.clienteNome}</h3><span>?ltima mensagem: {firstAlert.ultimaMensagem ? formatDateTime(firstAlert.ultimaMensagem.enviado_em || firstAlert.ultimaMensagem.criado_em) : 'sem registro'}</span></div>
              <div className="record-list">{clientAlerts.map((alert) => <article className="record-card message-alert-card" key={alert.id}>
                <div><h3>{alert.tipoLabel}</h3><div className="record-meta"><span className={`badge ${alert.status === 'atrasado' ? 'cancelado' : 'warning'}`}>{alert.status === 'atrasado' ? 'Atrasada' : 'Pendente'}</span><span>Venceu {formatDateTime(alert.dataVencimento)}</span>{alert.servicoNome ? <span>{alert.servicoNome}</span> : null}</div><p className="message-preview">{alert.texto}</p></div>
                <div className="record-actions"><button className="primary-button" type="button" onClick={() => openWhatsApp(alert.whatsappUrl)}><Send size={16} /> WhatsApp</button><button className="ghost-button" type="button" disabled={registerMessage.isPending} onClick={() => void registerAlert(alert)}><Check size={16} /> Marcar enviada</button><button className="danger-button" type="button" disabled={dismissAlert.isPending} onClick={() => void dismissAlert.mutateAsync(alert)}><Trash2 size={16} /> Dispensar</button></div>
              </article>)}</div>
            </section>
          })}</div> : <EmptyState title="Tudo em dia">N?o h? mensagens pendentes para enviar.</EmptyState>}
        </section> : <section className="panel message-history-panel">
          <div className="panel-header"><div><h2>Hist?rico de mensagens</h2><p>Envios registrados, aceitos ou com falha.</p></div></div>
          <div className="message-history-filters">
            <label className="search-field"><Search size={17} /><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Buscar cliente ou mensagem" /></label>
            <label><span className="sr-only">Filtrar por status</span><select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}><option value="todos">Todos os status</option><option value="enviado">Enviadas</option><option value="entregue">Entregues</option><option value="lido">Lidas</option><option value="erro">Com erro</option></select></label>
          </div>
          {filteredLogs.length ? <div className="message-history-list">{filteredLogs.map((log) => <article className="message-history-item" key={log.id}>
            <span className={`history-status-icon ${log.status}`}><History size={17} /></span>
            <div><div className="history-item-heading"><h3>{clientNames.get(log.cliente_id) || 'Cliente n?o localizado'}</h3><span className={`badge ${log.status === 'erro' ? 'cancelado' : 'success'}`}>{log.status}</span></div><p>{templateNames.get(log.modelo_mensagem_id || '') || 'Mensagem avulsa'} ? {log.canal === 'whatsapp_business' ? 'Autom?tica' : 'Manual'}</p><p className="message-preview">{log.texto}</p><small>{formatDateTime(log.enviado_em || log.criado_em)}</small>{log.observacao ? <small>{log.observacao}</small> : null}</div>
          </article>)}</div> : <EmptyState title="Nenhum envio encontrado">Ajuste os filtros ou registre o primeiro envio.</EmptyState>}
        </section>}
      </>}
    </main>
  )
}
