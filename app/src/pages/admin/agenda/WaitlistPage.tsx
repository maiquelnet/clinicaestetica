import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, endOfDay, startOfDay } from 'date-fns'
import { Check, Eraser, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { PageHeader } from '../../../components/PageHeader'
import { useClinic } from '../../../contexts/useClinic'
import { formatDateTime, toInputDateTime } from '../../../lib/format'
import { confirmWaitlistEntry } from '../../../lib/rpc'
import { supabase } from '../../../lib/supabase'
import type { Appointment, WaitlistEntry } from '../../../lib/types'
import { fetchClientsAndServices } from '../shared/data'
import { clean, statusBadge } from '../shared/utils'
export function WaitlistPage() {
  const { activeClinicId, activeMembership } = useClinic()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<WaitlistEntry | null>(null)
  const [draft, setDraft] = useState({
    cliente_id: '',
    servico_id: '',
    inicio_desejado_em: toInputDateTime(new Date()),
    fim_desejado_em: '',
    prioridade: '3',
    observacoes: '',
  })

  const query = useQuery({
    queryKey: ['waitlist', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const base = await fetchClientsAndServices(activeClinicId!)
      const from = startOfDay(new Date()).toISOString()
      const to = endOfDay(addDays(new Date(), 90)).toISOString()
      const [waitlist, appointments] = await Promise.all([
        supabase
          .from('lista_espera')
          .select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos)')
          .eq('clinica_id', activeClinicId)
          .is('arquivado_em', null)
          .order('inicio_desejado_em', { ascending: true }),
        supabase
          .from('agendamentos')
          .select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos)')
          .eq('clinica_id', activeClinicId)
          .gte('inicio_em', from)
          .lte('inicio_em', to)
          .is('arquivado_em', null),
      ])
      if (waitlist.error) throw waitlist.error
      if (appointments.error) throw appointments.error
      return {
        ...base,
        waitlist: (waitlist.data || []) as WaitlistEntry[],
        appointments: (appointments.data || []) as Appointment[],
      }
    },
  })

  const selectedService = query.data?.services.find((service) => service.id === draft.servico_id)
  const conflict = useMemo(() => {
    const start = new Date(draft.inicio_desejado_em)
    const end = draft.fim_desejado_em
      ? new Date(draft.fim_desejado_em)
      : new Date(start.getTime() + Number(selectedService?.duracao_minutos || 60) * 60_000)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    return (query.data?.appointments || []).find(
      (item) =>
        !['cancelado', 'concluido'].includes(item.status) &&
        item.id !== editing?.agendamento_id &&
        start < new Date(item.fim_em) &&
        end > new Date(item.inicio_em),
    ) || null
  }, [draft.fim_desejado_em, draft.inicio_desejado_em, editing?.agendamento_id, query.data?.appointments, selectedService?.duracao_minutos])

  const saveEntry = useMutation({
    mutationFn: async () => {
      const start = new Date(draft.inicio_desejado_em)
      const end = draft.fim_desejado_em
        ? new Date(draft.fim_desejado_em)
        : new Date(start.getTime() + Number(selectedService?.duracao_minutos || 60) * 60_000)
      if (!draft.cliente_id) throw new Error('Selecione a cliente.')
      if (end <= start) throw new Error('O horario final precisa ser depois do inicio.')
      const payload = {
        clinica_id: activeClinicId,
        cliente_id: draft.cliente_id,
        servico_id: draft.servico_id || null,
        inicio_desejado_em: start.toISOString(),
        fim_desejado_em: end.toISOString(),
        prioridade: Number(draft.prioridade || 3),
        observacoes: clean(draft.observacoes),
        status: 'em_espera',
        atualizado_em: new Date().toISOString(),
      }
      const request = editing
        ? supabase.from('lista_espera').update(payload).eq('id', editing.id)
        : supabase.from('lista_espera').insert(payload)
      const { error } = await request
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['waitlist', activeClinicId] })
      setEditing(null)
      setDraft({ cliente_id: '', servico_id: '', inicio_desejado_em: toInputDateTime(new Date()), fim_desejado_em: '', prioridade: '3', observacoes: '' })
    },
  })

  const confirmEntry = useMutation({
    mutationFn: async (entry: WaitlistEntry) => {
      const start = new Date(entry.inicio_desejado_em)
      const end = new Date(entry.fim_desejado_em)
      if (end <= start) throw new Error('O horario final precisa ser depois do inicio.')
      await confirmWaitlistEntry({
        p_lista_espera_id: entry.id,
        p_profissional_id: activeMembership?.perfil_id ?? null,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['waitlist', activeClinicId] })
      await queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard', activeClinicId] })
    },
  })

  function edit(entry: WaitlistEntry) {
    setEditing(entry)
    setDraft({
      cliente_id: entry.cliente_id,
      servico_id: entry.servico_id || '',
      inicio_desejado_em: entry.inicio_desejado_em.slice(0, 16),
      fim_desejado_em: entry.fim_desejado_em.slice(0, 16),
      prioridade: String(entry.prioridade),
      observacoes: entry.observacoes || '',
    })
  }

  return (
    <main className="content-page">
      <PageHeader eyebrow="Agenda" title="Fila de espera" description="Reserve horarios ainda nao confirmados e confirme somente quando nao houver conflito." />
      <div className="data-workspace has-drawer">
        <section className="panel list-panel data-panel">
          <div className="panel-header compact-header">
            <h2>Reservas pendentes</h2>
            <span>{query.data?.waitlist.filter((item) => item.status === 'em_espera').length ?? 0} em espera</span>
          </div>
          {query.isLoading ? <LoadingBlock /> : query.data?.waitlist.length ? (
            <div className="record-list">
              {query.data.waitlist.map((entry) => (
                <article className="record-card" key={entry.id}>
                  <div>
                    <h3>{entry.clientes?.nome}</h3>
                    <div className="record-meta">
                      <span>{formatDateTime(entry.inicio_desejado_em)}</span>
                      <span>{entry.servicos?.nome || 'Sem servico'}</span>
                      <span className={`badge ${statusBadge(entry.status)}`}>{entry.status.replace('_', ' ')}</span>
                    </div>
                    {entry.observacoes ? <p>{entry.observacoes}</p> : null}
                  </div>
                  <div className="record-actions">
                    <button className="ghost-button" type="button" onClick={() => edit(entry)}>Editar</button>
                    <button className="primary-button" type="button" disabled={entry.status !== 'em_espera'} onClick={() => void confirmEntry.mutateAsync(entry)}>
                      <Check size={16} /> Confirmar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState title="Nenhuma reserva em espera" />}
        </section>

        <form className="panel form-panel drawer-panel" onSubmit={(event) => { event.preventDefault(); void saveEntry.mutateAsync() }}>
          <div className="panel-header compact-header">
            <h2>{editing ? 'Editar reserva' : 'Nova reserva'}</h2>
            <button className="ghost-button compact-action" type="button" onClick={() => setEditing(null)}><Eraser size={15} /> Limpar</button>
          </div>
          <label>Cliente
            <select value={draft.cliente_id} onChange={(event) => setDraft({ ...draft, cliente_id: event.target.value })}>
              <option value="">Selecione</option>
              {(query.data?.clients || []).map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}
            </select>
          </label>
          <label>Servico
            <select value={draft.servico_id} onChange={(event) => setDraft({ ...draft, servico_id: event.target.value })}>
              <option value="">Selecione</option>
              {(query.data?.services || []).map((service) => <option key={service.id} value={service.id}>{service.nome}</option>)}
            </select>
          </label>
          <div className="form-grid">
            <label>Inicio<input type="datetime-local" value={draft.inicio_desejado_em} onChange={(event) => setDraft({ ...draft, inicio_desejado_em: event.target.value })} /></label>
            <label>Fim<input type="datetime-local" value={draft.fim_desejado_em} onChange={(event) => setDraft({ ...draft, fim_desejado_em: event.target.value })} /></label>
          </div>
          <label>Prioridade<input type="number" min={1} max={5} value={draft.prioridade} onChange={(event) => setDraft({ ...draft, prioridade: event.target.value })} /></label>
          <label>Observacoes<textarea rows={3} value={draft.observacoes} onChange={(event) => setDraft({ ...draft, observacoes: event.target.value })} /></label>
          {conflict ? <div className="form-alert">Conflito com {conflict.clientes?.nome || 'agendamento'} em {formatDateTime(conflict.inicio_em)}.</div> : null}
          {saveEntry.error ? <div className="form-alert">{saveEntry.error.message}</div> : null}
          {confirmEntry.error ? <div className="form-alert">{confirmEntry.error.message}</div> : null}
          <button className="primary-button" type="submit" disabled={saveEntry.isPending}><Save size={16} /> Salvar reserva</button>
        </form>
      </div>
    </main>
  )
}
