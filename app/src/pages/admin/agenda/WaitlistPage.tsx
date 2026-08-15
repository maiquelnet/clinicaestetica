import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, endOfDay, startOfDay } from 'date-fns'
import { Check, Pencil, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { useClinic } from '../../../contexts/useClinic'
import { formatDateTime, toInputDateTime } from '../../../lib/format'
import { confirmWaitlistEntry } from '../../../lib/rpc'
import { supabase } from '../../../lib/supabase'
import type { Appointment, WaitlistEntry, WaitlistStatus } from '../../../lib/types'
import {
  ManagementFormActions,
  ManagementFormPage,
  ManagementListPage,
  ManagementToolbar,
} from '../shared/ManagementPage'
import { fetchClientsAndServices } from '../shared/data'
import { clean, statusBadge } from '../shared/utils'

const listPath = '/agenda/fila-espera'

const statusLabels: Record<WaitlistStatus, string> = {
  em_espera: 'Em espera',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
}

function emptyDraft() {
  return {
    cliente_id: '',
    servico_id: '',
    inicio_desejado_em: toInputDateTime(new Date()),
    fim_desejado_em: '',
    prioridade: '3',
    observacoes: '',
  }
}

async function fetchWaitlist(clinicId: string) {
  const { data, error } = await supabase
    .from('lista_espera')
    .select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos)')
    .eq('clinica_id', clinicId)
    .is('arquivado_em', null)
    .order('inicio_desejado_em', { ascending: true })
  if (error) throw error
  return (data || []) as WaitlistEntry[]
}

export function WaitlistPage() {
  const { activeClinicId, activeMembership } = useClinic()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<WaitlistStatus>('em_espera')

  const query = useQuery({
    queryKey: ['waitlist', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: () => fetchWaitlist(activeClinicId!),
  })

  const confirmEntry = useMutation({
    mutationFn: async (entry: WaitlistEntry) => {
      await confirmWaitlistEntry({
        p_lista_espera_id: entry.id,
        p_profissional_id: activeMembership?.perfil_id ?? null,
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['waitlist', activeClinicId] }),
        queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', activeClinicId] }),
      ])
    },
  })

  const cancelEntry = useMutation({
    mutationFn: async (entry: WaitlistEntry) => {
      if (!activeClinicId) throw new Error('Clínica ativa não encontrada.')
      const { data, error } = await supabase
        .from('lista_espera')
        .update({ status: 'cancelado', atualizado_em: new Date().toISOString() })
        .eq('id', entry.id)
        .eq('clinica_id', activeClinicId)
        .eq('status', 'em_espera')
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('O encaixe não está mais disponível para cancelamento.')
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['waitlist', activeClinicId] }),
        queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', activeClinicId] }),
      ])
    },
  })

  const entries = useMemo(() => query.data || [], [query.data])
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return entries.filter((entry) => {
      if (entry.status !== status) return false
      const content = `${entry.clientes?.nome || ''} ${entry.servicos?.nome || ''}`.toLocaleLowerCase('pt-BR')
      return !term || content.includes(term)
    })
  }, [entries, search, status])

  function requestCancel(entry: WaitlistEntry) {
    if (!window.confirm(`Cancelar o encaixe de ${entry.clientes?.nome || 'esta cliente'}? O registro continuará disponível no histórico.`)) return
    void cancelEntry.mutateAsync(entry)
  }

  return (
    <ManagementListPage
      eyebrow="Agenda"
      title="Encaixes"
      description="Organize solicitações de horário, confirme oportunidades e mantenha o histórico das tentativas."
      newTo={`${listPath}/novo`}
      newLabel="Novo encaixe"
      error={(query.error || confirmEntry.error || cancelEntry.error) as Error | null}
    >
      <section className="management-summary" aria-label="Resumo dos encaixes">
        {(['em_espera', 'confirmado', 'cancelado'] as WaitlistStatus[]).map((itemStatus) => (
          <article key={itemStatus}><strong>{entries.filter((entry) => entry.status === itemStatus).length}</strong><span>{statusLabels[itemStatus]}</span></article>
        ))}
      </section>
      <section className="panel management-catalog">
        <ManagementToolbar search={search} onSearch={setSearch} searchPlaceholder="Buscar cliente ou serviço">
          <label><span className="sr-only">Filtrar por situação</span><select value={status} onChange={(event) => setStatus(event.target.value as WaitlistStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </ManagementToolbar>
        {query.isLoading ? <LoadingBlock /> : filtered.length ? (
          <div className="record-list">
            {filtered.map((entry) => (
              <article className="record-card" key={entry.id}>
                <div>
                  <h3>{entry.clientes?.nome}</h3>
                  <div className="record-meta">
                    <span>{formatDateTime(entry.inicio_desejado_em)}</span>
                    <span>{entry.servicos?.nome || 'Sem serviço'}</span>
                    <span>Prioridade {entry.prioridade}</span>
                    <span className={`badge ${statusBadge(entry.status)}`}>{statusLabels[entry.status]}</span>
                  </div>
                  {entry.observacoes ? <p>{entry.observacoes}</p> : null}
                </div>
                {entry.status === 'em_espera' ? (
                  <div className="record-actions">
                    <Link className="ghost-button" to={`${listPath}/${entry.id}/editar`}><Pencil size={15} /> Editar</Link>
                    <button className="primary-button" type="button" disabled={confirmEntry.isPending} onClick={() => void confirmEntry.mutateAsync(entry)}><Check size={16} /> Confirmar</button>
                    <button className="danger-button" type="button" disabled={cancelEntry.isPending} onClick={() => requestCancel(entry)}><XCircle size={16} /> Cancelar encaixe</button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : <EmptyState title="Nenhum encaixe encontrado">Ajuste a busca ou selecione outra situação.</EmptyState>}
      </section>
    </ManagementListPage>
  )
}

export function WaitlistFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const initialized = useRef('')
  const [draft, setDraft] = useState(emptyDraft)

  const query = useQuery({
    queryKey: ['waitlist-form', activeClinicId, id || 'new'],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const base = await fetchClientsAndServices(activeClinicId!)
      const from = startOfDay(new Date()).toISOString()
      const to = endOfDay(addDays(new Date(), 90)).toISOString()
      const appointments = await supabase
        .from('agendamentos')
        .select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos)')
        .eq('clinica_id', activeClinicId)
        .gte('inicio_em', from)
        .lte('inicio_em', to)
        .is('arquivado_em', null)
      if (appointments.error) throw appointments.error
      if (!id) return { ...base, appointments: (appointments.data || []) as Appointment[], entry: null }
      const entry = await supabase
        .from('lista_espera')
        .select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos)')
        .eq('id', id)
        .eq('clinica_id', activeClinicId)
        .is('arquivado_em', null)
        .maybeSingle()
      if (entry.error) throw entry.error
      if (!entry.data) throw new Error('Encaixe não encontrado nesta clínica.')
      if (entry.data.status !== 'em_espera') throw new Error('Somente encaixes em espera podem ser alterados.')
      return { ...base, appointments: (appointments.data || []) as Appointment[], entry: entry.data as WaitlistEntry }
    },
  })

  useEffect(() => {
    if (!query.data) return
    const key = id || 'new'
    if (initialized.current === key) return
    initialized.current = key
    const entry = query.data.entry
    setDraft(entry ? {
      cliente_id: entry.cliente_id,
      servico_id: entry.servico_id || '',
      inicio_desejado_em: toInputDateTime(new Date(entry.inicio_desejado_em)),
      fim_desejado_em: toInputDateTime(new Date(entry.fim_desejado_em)),
      prioridade: String(entry.prioridade),
      observacoes: entry.observacoes || '',
    } : emptyDraft())
  }, [id, query.data])

  const selectedService = query.data?.services.find((service) => service.id === draft.servico_id)
  const conflict = useMemo(() => {
    const start = new Date(draft.inicio_desejado_em)
    const end = draft.fim_desejado_em
      ? new Date(draft.fim_desejado_em)
      : new Date(start.getTime() + Number(selectedService?.duracao_minutos || 60) * 60_000)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    return (query.data?.appointments || []).find((item) =>
      !['cancelado', 'concluido'].includes(item.status) &&
      item.id !== query.data?.entry?.agendamento_id &&
      start < new Date(item.fim_em) &&
      end > new Date(item.inicio_em),
    ) || null
  }, [draft.fim_desejado_em, draft.inicio_desejado_em, query.data?.appointments, query.data?.entry?.agendamento_id, selectedService?.duracao_minutos])

  const save = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error('Clínica ativa não encontrada.')
      if (!draft.cliente_id) throw new Error('Selecione a cliente.')
      const start = new Date(draft.inicio_desejado_em)
      const end = draft.fim_desejado_em
        ? new Date(draft.fim_desejado_em)
        : new Date(start.getTime() + Number(selectedService?.duracao_minutos || 60) * 60_000)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error('O horário final precisa ser depois do início.')
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
      if (id) {
        const { data, error } = await supabase.from('lista_espera').update(payload).eq('id', id).eq('clinica_id', activeClinicId).eq('status', 'em_espera').select('id').maybeSingle()
        if (error) throw error
        if (!data) throw new Error('O encaixe não está mais disponível para alteração.')
      } else {
        const { error } = await supabase.from('lista_espera').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['waitlist', activeClinicId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', activeClinicId] }),
      ])
      navigate(listPath)
    },
  })

  return (
    <ManagementFormPage
      eyebrow="Agenda"
      title={editing ? 'Editar encaixe' : 'Novo encaixe'}
      description="Defina a preferência da cliente. A confirmação para a Agenda continuará protegida contra conflitos."
      backTo={listPath}
      loading={query.isLoading}
      error={query.error as Error | null}
    >
      {query.data ? (
        <form className="panel management-editor" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}>
          <fieldset><legend>Cliente e serviço</legend>
            <div className="form-grid">
              <label>Cliente<select value={draft.cliente_id} onChange={(event) => setDraft({ ...draft, cliente_id: event.target.value })}><option value="">Selecione</option>{query.data.clients.map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></label>
              <label>Serviço<select value={draft.servico_id} onChange={(event) => setDraft({ ...draft, servico_id: event.target.value })}><option value="">Selecione</option>{query.data.services.map((service) => <option key={service.id} value={service.id}>{service.nome}</option>)}</select></label>
            </div>
          </fieldset>
          <fieldset><legend>Preferência de horário</legend>
            <div className="form-grid">
              <label>Início<input type="datetime-local" value={draft.inicio_desejado_em} onChange={(event) => setDraft({ ...draft, inicio_desejado_em: event.target.value })} /></label>
              <label>Fim<input type="datetime-local" value={draft.fim_desejado_em} onChange={(event) => setDraft({ ...draft, fim_desejado_em: event.target.value })} /></label>
            </div>
            <label>Prioridade<input type="number" min={1} max={5} value={draft.prioridade} onChange={(event) => setDraft({ ...draft, prioridade: event.target.value })} /></label>
            <label>Observações<textarea rows={4} value={draft.observacoes} onChange={(event) => setDraft({ ...draft, observacoes: event.target.value })} /></label>
          </fieldset>
          {conflict ? <div className="form-alert">Conflito com {conflict.clientes?.nome || 'outro agendamento'} em {formatDateTime(conflict.inicio_em)}. O encaixe pode ser salvo, mas não poderá ser confirmado enquanto houver conflito.</div> : null}
          {save.error ? <div className="form-alert">{save.error.message}</div> : null}
          <ManagementFormActions backTo={listPath} pending={save.isPending} saveLabel={editing ? 'Salvar alterações' : 'Salvar encaixe'} />
        </form>
      ) : null}
    </ManagementFormPage>
  )
}
