import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, RefreshCw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '../../../components/PageHeader'
import { useClinic } from '../../../contexts/useClinic'
import { supabase } from '../../../lib/supabase'
import { connectGoogleCalendar, getGoogleCalendarStatus, requestGoogleCalendarSync } from '../../../lib/google-calendar'
import { clean } from '../shared/utils'
export function SettingsPage() {
  const { activeClinic, activeClinicId } = useClinic()
  const queryClient = useQueryClient()
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
        <p>{calendarStatus.isLoading ? 'Verificando conexao...' : calendarStatus.data?.connected ? `Conectado a agenda ${calendarStatus.data.calendarId || 'principal'}.` : 'Nenhuma agenda Google conectada.'}</p>
        {calendarStatus.data?.lastSyncAt ? <small>Ultima sincronizacao: {new Date(calendarStatus.data.lastSyncAt).toLocaleString('pt-BR')}</small> : null}
        <div className="form-actions">
          <button className="primary-button" type="button" disabled={!activeClinicId || connectCalendar.isPending} onClick={() => void connectCalendar.mutateAsync()}>
            <CalendarDays size={16} /> {calendarStatus.data?.connected ? 'Reconectar Google Agenda' : 'Conectar Google Agenda'}
          </button>
          {calendarStatus.data?.connected ? <button className="ghost-button" type="button" disabled={syncCalendar.isPending} onClick={() => void syncCalendar.mutateAsync()}><RefreshCw size={16} /> Sincronizar agora</button> : null}
        </div>
        {connectCalendar.error || syncCalendar.error || calendarStatus.error ? <div className="form-alert">{(connectCalendar.error || syncCalendar.error || calendarStatus.error)?.message}</div> : null}
      </section>
    </main>
  )
}
