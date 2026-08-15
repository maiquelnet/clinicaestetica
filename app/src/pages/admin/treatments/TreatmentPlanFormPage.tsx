import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, Clock3, Info, Save, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../../../components/PageHeader'
import { TreatmentSectionNav } from '../../../components/TreatmentSectionNav'
import { LoadingBlock } from '../../../components/Ui'
import { useClinic } from '../../../contexts/useClinic'
import { currentPrice, formatDateTime, parseCurrency } from '../../../lib/format'
import { requestGoogleCalendarSync } from '../../../lib/google-calendar'
import { supabase } from '../../../lib/supabase'
import {
  generateTreatmentSchedule,
  localDateTimeToIso,
  mergePreservedOccurrences,
  toLocalDateTime,
  todayLocalDate,
  type ExistingTreatmentOccurrence,
  type TreatmentFrequency,
  type TreatmentOccurrence,
} from '../../../lib/treatment-schedule'
import type { AppointmentStatus, TreatmentPlan, TreatmentPlanItem } from '../../../lib/types'
import { fetchClientsAndServices } from '../shared/data'
import './TreatmentPlans.css'

type Draft = {
  cliente_id: string
  servico_id: string
  nome: string
  total_sessoes: string
  valor_total: string
  valor_sessao: string
  status: TreatmentPlan['status']
  inicio_em: string
  horario_preferencial: string
  frequencia: TreatmentFrequency
  intervalo_dias: string
  considerar_sabado: boolean
  considerar_domingo: boolean
  observacoes: string
}

type PlanDetail = TreatmentPlan & {
  profissional?: { id: string; nome: string } | null
}

type BusyAppointment = {
  id: string
  inicio_em: string
  fim_em: string
  status: AppointmentStatus
  clientes?: { nome: string } | null
}

type CalendarBlock = {
  id: string
  titulo: string
  inicio_em: string
  fim_em: string
}

const emptyDraft = (): Draft => ({
  cliente_id: '',
  servico_id: '',
  nome: '',
  total_sessoes: '6',
  valor_total: '',
  valor_sessao: '',
  status: 'em_andamento',
  inicio_em: todayLocalDate(),
  horario_preferencial: '09:00',
  frequencia: 'semanal',
  intervalo_dias: '7',
  considerar_sabado: false,
  considerar_domingo: false,
  observacoes: '',
})

const frequencyLabels: Record<TreatmentFrequency, string> = {
  diario: 'Diário',
  semanal: 'Semanal',
  mensal: 'Mensal',
  intervalo: 'Intervalo de dias',
}

function isPreserved(item: ExistingTreatmentOccurrence) {
  return item.manual || item.situation === 'aguardando_reagendamento' || item.startLocal.slice(0, 10) < todayLocalDate()
}

export function TreatmentPlanFormPage() {
  const { id: planId } = useParams()
  const editing = Boolean(planId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeClinicId, activeMembership, profile } = useClinic()
  const initialized = useRef('')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [originalStatus, setOriginalStatus] = useState<TreatmentPlan['status']>('em_andamento')
  const [previewEdits, setPreviewEdits] = useState<Record<number, { startLocal: string; endLocal: string }>>({})

  const query = useQuery({
    queryKey: ['treatment-plan-form', activeClinicId, planId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const base = await fetchClientsAndServices(activeClinicId!)
      if (!planId) return { ...base, plan: null as PlanDetail | null, items: [] as TreatmentPlanItem[] }
      const [planResult, itemsResult] = await Promise.all([
        supabase
          .from('planos_tratamento')
          .select('*,profissional:perfis!planos_tratamento_profissional_id_fkey(id,nome)')
          .eq('id', planId)
          .eq('clinica_id', activeClinicId)
          .is('arquivado_em', null)
          .maybeSingle(),
        supabase
          .from('itens_plano_tratamento')
          .select('*')
          .eq('plano_tratamento_id', planId)
          .is('arquivado_em', null)
          .order('numero_sessao'),
      ])
      if (planResult.error) throw planResult.error
      if (!planResult.data) throw new Error('Plano de tratamento não encontrado.')
      if (itemsResult.error) throw itemsResult.error
      return {
        ...base,
        plan: planResult.data as unknown as PlanDetail,
        items: (itemsResult.data || []) as TreatmentPlanItem[],
      }
    },
  })

  useEffect(() => {
    if (!query.data) return
    const key = planId || 'new'
    if (initialized.current === key) return
    initialized.current = key
    const plan = query.data.plan
    if (!plan) {
      setDraft(emptyDraft())
      setOriginalStatus('em_andamento')
      return
    }
    setDraft({
      cliente_id: plan.cliente_id,
      servico_id: plan.servico_id,
      nome: plan.nome,
      total_sessoes: String(plan.total_sessoes),
      valor_total: String(plan.valor_total),
      valor_sessao: String(plan.valor_sessao),
      status: plan.status,
      inicio_em: plan.inicio_em || todayLocalDate(),
      horario_preferencial: plan.horario_preferencial?.slice(0, 5) || '09:00',
      frequencia: plan.frequencia || 'semanal',
      intervalo_dias: String(plan.intervalo_dias || 7),
      considerar_sabado: plan.considerar_sabado,
      considerar_domingo: plan.considerar_domingo,
      observacoes: plan.observacoes || '',
    })
    setOriginalStatus(plan.status)
  }, [planId, query.data])

  const selectedService = query.data?.services.find((service) => service.id === draft.servico_id)
  const durationMinutes = selectedService?.duracao_minutos || 60
  const total = Math.max(0, Number(draft.total_sessoes || 0))
  const recurrenceKey = [
    draft.inicio_em,
    draft.horario_preferencial,
    draft.frequencia,
    draft.intervalo_dias,
    draft.total_sessoes,
    draft.considerar_sabado,
    draft.considerar_domingo,
    durationMinutes,
  ].join(':')

  useEffect(() => {
    setPreviewEdits({})
  }, [recurrenceKey])

  const existingOccurrences = useMemo<ExistingTreatmentOccurrence[]>(() => (query.data?.items || [])
    .filter((item) => item.numero_sessao && item.inicio_previsto_em && item.fim_previsto_em)
    .map((item) => ({
      number: item.numero_sessao!,
      startLocal: toLocalDateTime(item.inicio_previsto_em!),
      endLocal: toLocalDateTime(item.fim_previsto_em!),
      manual: item.ajuste_manual,
      situation: item.situacao,
      itemId: item.id,
      appointmentId: item.agendamento_id,
      archived: Boolean(item.arquivado_em),
    })), [query.data?.items])

  const baseSchedule = useMemo(() => generateTreatmentSchedule({
    startDate: draft.inicio_em,
    time: draft.horario_preferencial,
    total,
    durationMinutes,
    frequency: draft.frequencia,
    intervalDays: draft.frequencia === 'intervalo' ? Number(draft.intervalo_dias || 0) : null,
    includeSaturday: draft.considerar_sabado,
    includeSunday: draft.considerar_domingo,
  }), [draft.considerar_domingo, draft.considerar_sabado, draft.frequencia, draft.horario_preferencial, draft.inicio_em, draft.intervalo_dias, durationMinutes, total])

  const schedule = useMemo(() => mergePreservedOccurrences(baseSchedule, existingOccurrences)
    .map((occurrence) => previewEdits[occurrence.number]
      ? { ...occurrence, ...previewEdits[occurrence.number], adjusted: true }
      : occurrence), [baseSchedule, existingOccurrences, previewEdits])

  const scheduleRange = useMemo(() => {
    if (!schedule.length) return null
    const starts = schedule.map((item) => localDateTimeToIso(item.startLocal)).sort()
    const ends = schedule.map((item) => localDateTimeToIso(item.endLocal)).sort()
    return { from: starts[0], to: ends.at(-1)! }
  }, [schedule])

  const conflictsQuery = useQuery({
    queryKey: ['treatment-plan-conflicts', activeClinicId, scheduleRange?.from, scheduleRange?.to],
    enabled: Boolean(activeClinicId && scheduleRange && draft.status === 'em_andamento'),
    queryFn: async () => {
      const [appointments, blocks] = await Promise.all([
        supabase
          .from('agendamentos')
          .select('id,inicio_em,fim_em,status,clientes(nome)')
          .eq('clinica_id', activeClinicId)
          .is('arquivado_em', null)
          .lt('inicio_em', scheduleRange!.to)
          .gt('fim_em', scheduleRange!.from),
        supabase
          .from('bloqueios_agenda')
          .select('id,titulo,inicio_em,fim_em')
          .eq('clinica_id', activeClinicId)
          .lt('inicio_em', scheduleRange!.to)
          .gt('fim_em', scheduleRange!.from),
      ])
      if (appointments.error) throw appointments.error
      if (blocks.error) throw blocks.error
      return {
        appointments: (appointments.data || []) as unknown as BusyAppointment[],
        blocks: (blocks.data || []) as CalendarBlock[],
      }
    },
  })

  const conflicts = useMemo(() => {
    const result = new Map<number, string[]>()
    const ownAppointments = new Set(existingOccurrences.map((item) => item.appointmentId).filter(Boolean))
    const add = (number: number, message: string) => result.set(number, [...(result.get(number) || []), message])
    schedule.forEach((occurrence, index) => {
      const start = new Date(localDateTimeToIso(occurrence.startLocal))
      const end = new Date(localDateTimeToIso(occurrence.endLocal))
      ;(conflictsQuery.data?.appointments || []).forEach((appointment) => {
        if (ownAppointments.has(appointment.id) || ['cancelado', 'concluido'].includes(appointment.status)) return
        if (start < new Date(appointment.fim_em) && end > new Date(appointment.inicio_em)) {
          add(occurrence.number, `Conflito com ${appointment.clientes?.nome || 'outro agendamento'}.`)
        }
      })
      ;(conflictsQuery.data?.blocks || []).forEach((block) => {
        if (start < new Date(block.fim_em) && end > new Date(block.inicio_em)) add(occurrence.number, `Horário bloqueado: ${block.titulo}.`)
      })
      schedule.slice(index + 1).forEach((other) => {
        const otherStart = new Date(localDateTimeToIso(other.startLocal))
        const otherEnd = new Date(localDateTimeToIso(other.endLocal))
        if (start < otherEnd && end > otherStart) {
          add(occurrence.number, `Sobreposição com o atendimento ${other.number}.`)
          add(other.number, `Sobreposição com o atendimento ${occurrence.number}.`)
        }
      })
    })
    return result
  }, [conflictsQuery.data, existingOccurrences, schedule])

  const highestPreserved = existingOccurrences.filter(isPreserved).reduce((highest, item) => Math.max(highest, item.number), 0)
  const hasConflicts = conflicts.size > 0
  const professionalName = query.data?.plan?.profissional?.nome || profile?.nome || 'Profissional logado'

  const save = useMutation({
    mutationFn: async () => {
      if (!activeClinicId || !activeMembership?.perfil_id) throw new Error('Não existe uma associação profissional ativa para esta clínica.')
      if (!draft.cliente_id || !draft.servico_id || !draft.nome.trim()) throw new Error('Informe cliente, serviço e nome do plano.')
      if (total < 1) throw new Error('Informe ao menos um atendimento.')
      if (draft.frequencia === 'intervalo' && Number(draft.intervalo_dias) < 1) throw new Error('Informe um intervalo de dias válido.')
      if (total < highestPreserved) throw new Error(`O total não pode ser menor que ${highestPreserved}, pois existem datas passadas ou ajustadas que precisam ser preservadas.`)
      if (draft.status === 'em_andamento' && schedule.length !== total) throw new Error('Não foi possível gerar todas as datas do cronograma.')
      if (draft.status === 'em_andamento' && hasConflicts) throw new Error('Ajuste os horários destacados antes de salvar.')

      const { error } = await supabase.rpc('salvar_plano_tratamento_com_cronograma', {
        p_plano_id: planId || null,
        p_clinica_id: activeClinicId,
        p_cliente_id: draft.cliente_id,
        p_servico_id: draft.servico_id,
        p_nome: draft.nome.trim(),
        p_total_sessoes: total,
        p_valor_total: parseCurrency(draft.valor_total),
        p_valor_sessao: parseCurrency(draft.valor_sessao),
        p_status: draft.status,
        p_inicio_em: draft.inicio_em,
        p_horario_preferencial: draft.horario_preferencial,
        p_frequencia: draft.frequencia,
        p_intervalo_dias: draft.frequencia === 'intervalo' ? Number(draft.intervalo_dias) : null,
        p_considerar_sabado: draft.considerar_sabado,
        p_considerar_domingo: draft.considerar_domingo,
        p_observacoes: draft.observacoes.trim() || null,
        p_ocorrencias: schedule.map((occurrence) => ({
          numero_sessao: occurrence.number,
          inicio_em: localDateTimeToIso(occurrence.startLocal),
          fim_em: localDateTimeToIso(occurrence.endLocal),
          ajuste_manual: occurrence.adjusted,
        })),
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['treatment-plans', activeClinicId] }),
        queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] }),
      ])
      if (activeClinicId) void requestGoogleCalendarSync(activeClinicId).catch(() => undefined)
      navigate('/planos-tratamento')
    },
  })

  function updateOccurrence(occurrence: TreatmentOccurrence, startLocal: string) {
    const start = new Date(startLocal)
    const end = new Date(start.getTime() + durationMinutes * 60_000)
    setPreviewEdits((current) => ({
      ...current,
      [occurrence.number]: { startLocal, endLocal: toLocalDateTime(end.toISOString()) },
    }))
  }

  function submit() {
    const isEnding = ['concluido', 'cancelado'].includes(draft.status)
    if (editing && isEnding && draft.status !== originalStatus) {
      const confirmed = window.confirm('Ao encerrar este plano, todos os atendimentos futuros serão cancelados e deixarão de contar como dias restantes. Deseja continuar?')
      if (!confirmed) return
    }
    void save.mutateAsync()
  }

  if (query.isLoading) return <main className="content-page treatment-form-page"><LoadingBlock /></main>

  return (
    <main className="content-page treatment-form-page">
      <PageHeader
        eyebrow="Tratamentos"
        title={editing ? 'Editar plano de tratamento' : 'Novo plano de tratamento'}
        description="Defina a recorrência, revise todas as datas e confirme o cronograma na Agenda."
        actions={<Link className="ghost-button" to="/planos-tratamento"><ChevronLeft size={17} /> Voltar à lista</Link>}
      />
      <TreatmentSectionNav />
      {query.error ? <div className="form-alert">{query.error.message}</div> : null}
      {!activeMembership?.perfil_id ? <div className="form-alert">Seu usuário não possui uma associação profissional ativa nesta clínica.</div> : null}

      <div className="treatment-form-layout">
        <form className="panel form-panel treatment-editor" onSubmit={(event) => { event.preventDefault(); submit() }}>
          <fieldset>
            <legend>Identificação</legend>
            <div className="form-grid">
              <label>Cliente<select value={draft.cliente_id} onChange={(event) => setDraft({ ...draft, cliente_id: event.target.value })}><option value="">Selecione</option>{(query.data?.clients || []).map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></label>
              <label>Serviço<select value={draft.servico_id} onChange={(event) => {
                const service = query.data?.services.find((item) => item.id === event.target.value)
                const price = service ? currentPrice(service) : 0
                setDraft({ ...draft, servico_id: event.target.value, valor_sessao: draft.valor_sessao || (price ? String(price) : '') })
              }}><option value="">Selecione</option>{(query.data?.services || []).map((service) => <option key={service.id} value={service.id}>{service.nome} · {service.duracao_minutos} min</option>)}</select></label>
            </div>
            <label>Nome do plano<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} placeholder="Ex.: Protocolo facial intensivo" /></label>
            <div className="professional-note"><ShieldCheck size={18} /><span><strong>{professionalName}</strong> será o profissional responsável por todos os atendimentos gerados.</span></div>
          </fieldset>

          <fieldset>
            <legend>Cronograma</legend>
            <div className="form-grid">
              <label>Quantidade de atendimentos<input type="number" min={1} value={draft.total_sessoes} onChange={(event) => setDraft({ ...draft, total_sessoes: event.target.value })} /></label>
              <label>Frequência<select value={draft.frequencia} onChange={(event) => setDraft({ ...draft, frequencia: event.target.value as TreatmentFrequency })}>{Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            {draft.frequencia === 'intervalo' ? <label>Intervalo entre atendimentos<input type="number" min={1} value={draft.intervalo_dias} onChange={(event) => setDraft({ ...draft, intervalo_dias: event.target.value })} /><small>Quantidade de dias corridos entre cada data calculada.</small></label> : null}
            <div className="form-grid">
              <label>Data inicial<input type="date" value={draft.inicio_em} onChange={(event) => setDraft({ ...draft, inicio_em: event.target.value })} /></label>
              <label>Horário padrão<input type="time" value={draft.horario_preferencial} onChange={(event) => setDraft({ ...draft, horario_preferencial: event.target.value })} /></label>
            </div>
            <div className="day-options">
              <label className="day-option"><input type="checkbox" checked={draft.considerar_sabado} onChange={(event) => setDraft({ ...draft, considerar_sabado: event.target.checked })} /> Considerar sábado</label>
              <label className="day-option"><input type="checkbox" checked={draft.considerar_domingo} onChange={(event) => setDraft({ ...draft, considerar_domingo: event.target.checked })} /> Considerar domingo</label>
            </div>
            <small className="schedule-preview-intro">Por padrão, o sistema utiliza apenas dias úteis. Datas excluídas são ajustadas para o dia permitido mais próximo.</small>
          </fieldset>

          <fieldset>
            <legend>Valores e situação</legend>
            <div className="form-grid">
              <label>Valor total<input inputMode="decimal" value={draft.valor_total} onChange={(event) => setDraft({ ...draft, valor_total: event.target.value })} placeholder="R$ 0,00" /></label>
              <label>Valor por atendimento<input inputMode="decimal" value={draft.valor_sessao} onChange={(event) => setDraft({ ...draft, valor_sessao: event.target.value })} placeholder="R$ 0,00" /></label>
            </div>
            <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TreatmentPlan['status'] })}><option value="em_andamento">Em andamento</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option></select></label>
            <label>Observações<textarea rows={4} value={draft.observacoes} onChange={(event) => setDraft({ ...draft, observacoes: event.target.value })} placeholder="Cuidados, objetivos ou orientações sobre o tratamento" /></label>
          </fieldset>

          {save.error ? <div className="form-alert">{save.error.message}</div> : null}
          {conflictsQuery.error ? <div className="form-alert">{conflictsQuery.error.message}</div> : null}
          <div className="treatment-editor-actions">
            <Link className="ghost-button" to="/planos-tratamento">Cancelar</Link>
            <button className="primary-button" type="submit" disabled={save.isPending || conflictsQuery.isLoading || !activeMembership?.perfil_id || (draft.status === 'em_andamento' && hasConflicts)}>
              <Save size={17} /> {save.isPending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar plano e agendar'}
            </button>
          </div>
        </form>

        <section className="panel schedule-preview-panel">
          <div className="panel-header"><div><p className="eyebrow">Prévia da Agenda</p><h2>{schedule.length} datas previstas</h2><p>Altere somente os horários necessários antes de confirmar.</p></div><CalendarDays size={21} /></div>
          {conflictsQuery.isLoading ? <div className="professional-note"><Clock3 size={17} /><span>Verificando disponibilidade dos horários...</span></div> : null}
          {hasConflicts ? <div className="form-alert"><TriangleAlert size={16} /> Existem conflitos. Ajuste as datas destacadas.</div> : null}
          {draft.status !== 'em_andamento' ? <div className="professional-note"><Info size={17} /><span>Planos concluídos ou cancelados não mantêm datas futuras ativas.</span></div> : null}
          <div className="schedule-preview">
            {schedule.map((occurrence) => {
              const occurrenceConflicts = conflicts.get(occurrence.number) || []
              const waiting = occurrence.situation === 'aguardando_reagendamento'
              return <article className={`occurrence-card ${occurrenceConflicts.length ? 'conflict' : ''} ${occurrence.preserved ? 'preserved' : ''}`} key={occurrence.number}>
                <div>
                  <div className="occurrence-heading"><strong>Atendimento {occurrence.number}/{total}</strong></div>
                  <div className="occurrence-badges">
                    {occurrence.preserved ? <span className="badge success">Data preservada</span> : null}
                    {occurrence.adjusted && !occurrence.preserved ? <span className="badge warning">Data ajustada</span> : null}
                    {waiting ? <span className="badge warning">Aguardando reagendamento</span> : null}
                  </div>
                </div>
                <label><span className="sr-only">Data e horário do atendimento {occurrence.number}</span><input type="datetime-local" value={occurrence.startLocal} disabled={occurrence.preserved || draft.status !== 'em_andamento'} onChange={(event) => updateOccurrence(occurrence, event.target.value)} /><small>{formatDateTime(localDateTimeToIso(occurrence.startLocal))} · {durationMinutes} min</small></label>
                {occurrenceConflicts.length ? <div className="occurrence-conflicts">{occurrenceConflicts.map((message) => <span key={message}>• {message}</span>)}</div> : null}
              </article>
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
