import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, MessageCircle, RefreshCw, Save, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../../components/PageHeader'
import { useClinic } from '../../../contexts/useClinic'
import { supabase } from '../../../lib/supabase'
import { connectGoogleCalendar, getGoogleCalendarStatus, requestGoogleCalendarSync } from '../../../lib/google-calendar'
import { getWhatsAppStatus, sendWhatsAppTest } from '../../../lib/whatsapp'
import { clean } from '../shared/utils'
export function SettingsPage() {
  const { activeClinic, activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const googleCalendarResult = searchParams.get('googleCalendar')
  const googleCalendarMessage = searchParams.get('googleCalendarMessage')
  const calendarStatus = useQuery({
    queryKey: ['google-calendar-status', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: () => getGoogleCalendarStatus(activeClinicId!),
  })
  const connectCalendar = useMutation({ mutationFn: () => connectGoogleCalendar(activeClinicId!) })
  const syncCalendar = useMutation({
    mutationFn: () => requestGoogleCalendarSync(activeClinicId!),
    onSuccess: () => calendarStatus.refetch(),
  })
  const whatsappStatus = useQuery({
    queryKey: ['whatsapp-status', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: () => getWhatsAppStatus(activeClinicId!),
    refetchInterval: 60_000,
  })
  const [whatsappTestRecipient, setWhatsAppTestRecipient] = useState('')
  const testWhatsApp = useMutation({
    mutationFn: () => sendWhatsAppTest(activeClinicId!, whatsappTestRecipient),
  })
  const [draft, setDraft] = useState(() => ({
    nome: activeClinic?.nome || '',
    nome_publico: activeClinic?.nome_publico || '',
    telefone: activeClinic?.telefone || '',
    email: activeClinic?.email || '',
    endereco: activeClinic?.endereco || '',
    complemento: activeClinic?.complemento || '',
    cep: activeClinic?.cep || '',
    cidade: activeClinic?.cidade || '',
    estado: activeClinic?.estado || '',
    fuso_horario: activeClinic?.fuso_horario || 'America/Sao_Paulo',
    link_google_avaliacao: activeClinic?.link_google_avaliacao || '',
    google_place_id: activeClinic?.google_place_id || '',
  }))
  useEffect(() => {
    setDraft({
      nome: activeClinic?.nome || '',
      nome_publico: activeClinic?.nome_publico || '',
      telefone: activeClinic?.telefone || '',
      email: activeClinic?.email || '',
      endereco: activeClinic?.endereco || '',
      complemento: activeClinic?.complemento || '',
      cep: activeClinic?.cep || '',
      cidade: activeClinic?.cidade || '',
      estado: activeClinic?.estado || '',
      fuso_horario: activeClinic?.fuso_horario || 'America/Sao_Paulo',
      link_google_avaliacao: activeClinic?.link_google_avaliacao || '',
      google_place_id: activeClinic?.google_place_id || '',
    })
  }, [activeClinic])
  const dismissGoogleCalendarResult = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('googleCalendar')
    next.delete('googleCalendarMessage')
    setSearchParams(next, { replace: true })
  }
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('clinicas').update({ ...draft, nome_publico: clean(draft.nome_publico), telefone: clean(draft.telefone), email: clean(draft.email), endereco: clean(draft.endereco), complemento: clean(draft.complemento), cep: clean(draft.cep), cidade: clean(draft.cidade), estado: clean(draft.estado), link_google_avaliacao: clean(draft.link_google_avaliacao), google_place_id: clean(draft.google_place_id), atualizado_em: new Date().toISOString() }).eq('id', activeClinicId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinic-context'] }),
  })
  return (
    <main className="content-page">
      <PageHeader eyebrow="Configuracoes" title="Parametros Gerais" description="Dados principais da clinica, endereco e links do Google." />
      <form className="panel form-panel" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}>
        <div className="form-grid"><label>Nome interno<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label><label>Nome publico<input value={draft.nome_publico} onChange={(event) => setDraft({ ...draft, nome_publico: event.target.value })} /></label></div>
        <div className="form-grid"><label>Telefone<input value={draft.telefone} onChange={(event) => setDraft({ ...draft, telefone: event.target.value })} /></label><label>E-mail<input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label></div>
        <label>Endereco<input value={draft.endereco} onChange={(event) => setDraft({ ...draft, endereco: event.target.value })} /></label>
        <div className="form-grid"><label>Complemento<input value={draft.complemento} onChange={(event) => setDraft({ ...draft, complemento: event.target.value })} /></label><label>CEP<input value={draft.cep} onChange={(event) => setDraft({ ...draft, cep: event.target.value })} /></label></div>
        <div className="form-grid"><label>Cidade<input value={draft.cidade} onChange={(event) => setDraft({ ...draft, cidade: event.target.value })} /></label><label>Estado<input value={draft.estado} onChange={(event) => setDraft({ ...draft, estado: event.target.value })} /></label></div>
        <label>Fuso horario<input value={draft.fuso_horario} onChange={(event) => setDraft({ ...draft, fuso_horario: event.target.value })} /></label>
        <div className="form-grid"><label>Link Google avaliacao<input value={draft.link_google_avaliacao} onChange={(event) => setDraft({ ...draft, link_google_avaliacao: event.target.value })} /></label><label>Google Place ID<input value={draft.google_place_id} onChange={(event) => setDraft({ ...draft, google_place_id: event.target.value })} /></label></div>
        {save.error ? <div className="form-alert">{save.error.message}</div> : null}
        <button className="primary-button" type="submit"><Save size={16} /> Salvar parametros</button>
      </form>
      <section className="panel form-panel">
        <PageHeader eyebrow="Integracao" title="Google Agenda" description="Mantenha os agendamentos do sistema e do Google sincronizados nos dois sentidos." />
        {googleCalendarResult ? (
          <div className={googleCalendarResult === 'connected' ? 'form-success' : 'form-alert'} role="status">
            <span>{googleCalendarMessage || (googleCalendarResult === 'connected'
              ? 'Google Agenda conectado com sucesso.'
              : googleCalendarResult === 'cancelled'
                ? 'A autorizacao do Google foi cancelada.'
                : 'Nao foi possivel conectar o Google Agenda.')}</span>
            <button className="ghost-button" type="button" onClick={dismissGoogleCalendarResult}>Fechar</button>
          </div>
        ) : null}
        <p>{calendarStatus.isLoading ? 'Verificando conexao...' : calendarStatus.data?.connected ? `Conectado a agenda ${calendarStatus.data.calendarId || 'principal'}.` : 'Nenhuma agenda Google conectada.'}</p>
        {calendarStatus.data?.lastSyncAt ? <small>Ultima sincronizacao: {new Date(calendarStatus.data.lastSyncAt).toLocaleString('pt-BR')}</small> : null}
        <div className="form-actions">
          <button className="primary-button" type="button" disabled={!activeClinicId || connectCalendar.isPending} onClick={() => connectCalendar.mutate()}>
            <CalendarDays size={16} /> {calendarStatus.data?.connected ? 'Reconectar Google Agenda' : 'Conectar Google Agenda'}
          </button>
          {calendarStatus.data?.connected ? <button className="ghost-button" type="button" disabled={syncCalendar.isPending} onClick={() => syncCalendar.mutate()}><RefreshCw size={16} /> Sincronizar agora</button> : null}
        </div>
        {connectCalendar.error || syncCalendar.error || calendarStatus.error ? <div className="form-alert">{(connectCalendar.error || syncCalendar.error || calendarStatus.error)?.message}</div> : null}
      </section>
      <section className="panel form-panel">
        <PageHeader
          eyebrow="Integracao"
          title="WhatsApp Cloud API"
          description="Envie confirmacoes e lembretes automaticos por modelos aprovados pela Meta."
        />
        <p>
          {whatsappStatus.isLoading
            ? 'Verificando configuracao...'
            : whatsappStatus.data?.configured
              ? 'Secrets obrigatorios cadastrados no servidor.'
              : 'Integracao ainda nao configurada no servidor.'}
        </p>
        {whatsappStatus.data ? (
          <div className="record-meta">
            <span className={`badge ${whatsappStatus.data.configured ? 'success' : 'warning'}`}>
              {whatsappStatus.data.configured ? 'Configurado' : 'Pendente'}
            </span>
            <span>{whatsappStatus.data.automaticRules} automacao(oes) ativa(s)</span>
            <span>{whatsappStatus.data.pendingMessages} mensagem(ns) na fila</span>
            <span>{whatsappStatus.data.failedMessages} falha(s) para revisar</span>
            <span className={`badge ${whatsappStatus.data.scheduler.cronActive && whatsappStatus.data.scheduler.vaultConfigured ? 'success' : 'warning'}`}>
              {whatsappStatus.data.scheduler.cronActive && whatsappStatus.data.scheduler.vaultConfigured ? 'Agendador ativo' : 'Agendador pendente'}
            </span>
          </div>
        ) : null}
        {whatsappStatus.data?.scheduler.lastRunAt ? (
          <small>
            Ultima execucao do agendador: {new Date(whatsappStatus.data.scheduler.lastRunAt).toLocaleString('pt-BR')}
            {whatsappStatus.data.scheduler.lastRunStatus ? ` (${whatsappStatus.data.scheduler.lastRunStatus})` : ''}.
          </small>
        ) : null}
        {whatsappStatus.data?.missingSecrets.length ? (
          <div className="form-alert">
            Configure em Supabase &gt; Edge Functions &gt; Secrets: {whatsappStatus.data.missingSecrets.join(', ')}.
          </div>
        ) : null}
        {whatsappStatus.data && (!whatsappStatus.data.scheduler.cronActive || !whatsappStatus.data.scheduler.vaultConfigured) ? (
          <div className="form-alert">
            O envio automatico ainda nao esta agendado. Configure whatsapp_function_url e whatsapp_cron_secret no Supabase Vault.
          </div>
        ) : null}
        <label>
          Numero verificado para teste
          <input
            type="tel"
            placeholder="(51) 99999-9999"
            value={whatsappTestRecipient}
            onChange={(event) => setWhatsAppTestRecipient(event.target.value)}
          />
          <small>Durante a homologacao, informe um dos destinatarios cadastrados no painel da Meta.</small>
        </label>
        <div className="form-actions">
          <button
            className="primary-button"
            type="button"
            disabled={!activeClinicId || !whatsappStatus.data?.sendReady || !whatsappTestRecipient.trim() || testWhatsApp.isPending}
            onClick={() => testWhatsApp.mutate()}
          >
            {testWhatsApp.isPending ? <RefreshCw size={16} /> : <Send size={16} />}
            {testWhatsApp.isPending ? 'Enviando...' : 'Enviar mensagem de teste'}
          </button>
          <button className="ghost-button" type="button" onClick={() => void whatsappStatus.refetch()}>
            <MessageCircle size={16} /> Atualizar status
          </button>
        </div>
        {testWhatsApp.isSuccess ? <div className="form-success">Mensagem de teste aceita pela Meta.</div> : null}
        {testWhatsApp.error || whatsappStatus.error ? <div className="form-alert">{(testWhatsApp.error || whatsappStatus.error)?.message}</div> : null}
        {whatsappStatus.data?.recentFailures.length ? (
          <div className="record-list">
            {whatsappStatus.data.recentFailures.map((failure) => (
              <article className="record-card" key={failure.id}>
                <div>
                  <h3>{failure.type}</h3>
                  <div className="record-meta">
                    <span>{new Date(failure.scheduledAt).toLocaleString('pt-BR')}</span>
                    <span>{failure.attempts} tentativa(s)</span>
                  </div>
                  <p className="message-preview">{failure.error || 'Falha sem detalhe retornado.'}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  )
}
