import { ChevronDown, Clock3, Users } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { formatDate } from '../lib/format'
import { radarClassificationLabels, type OpportunityDay } from '../lib/capacity'
import { listSecretaryActionPlansPeriod, prepareSecretaryActionPlan } from '../lib/rpc'
import { SecretaryActionPlanSheet } from './SecretaryActionPlanSheet'

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder}min`
  return remainder ? `${hours}h${remainder}` : `${hours}h`
}

function dateLabel(value: string) {
  return formatDate(`${value}T12:00:00`)
}

export function OpportunityRadarSection({ days, activeClinicId, professionalId }: { days: OpportunityDay[]; activeClinicId: string | null; professionalId: string | null }) {
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [selectedPlanDate, setSelectedPlanDate] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const attentionDays = days.filter((day) => day.merece_atencao)
  const unavailableDays = days.filter((day) => !day.possui_capacidade).length
  const healthyDays = days.filter((day) => day.possui_capacidade && !day.merece_atencao).length
  const planStart = days[0]?.data || null
  const planEnd = days[days.length - 1]?.data || null
  const planListQuery = useQuery({
    queryKey: ['secretary-action-plans', activeClinicId, professionalId, planStart, planEnd],
    enabled: Boolean(activeClinicId && professionalId && planStart && planEnd),
    queryFn: () => listSecretaryActionPlansPeriod({
      p_clinica_id: activeClinicId!,
      p_profissional_id: professionalId!,
      p_data_inicio: planStart!,
      p_data_fim: planEnd!,
    }),
  })
  const plansByDate = useMemo(() => new Map((planListQuery.data || []).map((plan) => [plan.data_alvo, plan])), [planListQuery.data])
  const actionableDays = days.filter((day) => day.merece_atencao || plansByDate.has(day.data))
  const selectedDay = selectedPlanDate ? days.find((day) => day.data === selectedPlanDate) || null : null
  const preparePlan = useMutation({
    mutationFn: (date: string) => prepareSecretaryActionPlan({
      p_clinica_id: activeClinicId!,
      p_profissional_id: professionalId!,
      p_data_alvo: date,
    }),
    onSuccess: async (planId, date) => {
      setFeedback(null)
      setSelectedPlanId(planId)
      setSelectedPlanDate(date)
      await queryClient.invalidateQueries({ queryKey: ['secretary-action-plans', activeClinicId, professionalId] })
    },
    onError: (error) => setFeedback(error.message),
  })

  function openPlan(day: OpportunityDay) {
    const plan = plansByDate.get(day.data)
    setFeedback(null)
    setSelectedPlanDate(day.data)
    if (plan) {
      setSelectedPlanId(plan.id)
      return
    }
    if (!activeClinicId || !professionalId || preparePlan.isPending) return
    preparePlan.mutate(day.data)
  }

  function refreshRadar() {
    void queryClient.invalidateQueries({ queryKey: ['commercial-opportunities', activeClinicId, professionalId] })
    void queryClient.invalidateQueries({ queryKey: ['secretary-action-plans', activeClinicId, professionalId] })
  }

  function toggleDay(date: string) {
    setOpenDays((current) => {
      const next = new Set(current)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  return (
    <section className="panel opportunity-radar-panel" aria-labelledby="opportunity-radar-title">
      <div className="panel-header opportunity-radar-header">
        <div>
          <p className="eyebrow">Acompanhamento da agenda</p>
          <h2 id="opportunity-radar-title">Radar da agenda</h2>
          <p>Sua secretária está acompanhando os próximos dias.</p>
        </div>
        <span className="opportunity-radar-summary">{attentionDays.length} {attentionDays.length === 1 ? 'dia merece' : 'dias merecem'} atenção</span>
      </div>

      <div className="opportunity-radar-context" aria-label="Resumo do Radar">
        <span>{healthyDays} {healthyDays === 1 ? 'dia com capacidade' : 'dias com capacidade'}</span>
        <span>{unavailableDays} {unavailableDays === 1 ? 'indisponível' : 'indisponíveis'}</span>
      </div>

      {actionableDays.length ? (
        <div className="opportunity-radar-list">
          {actionableDays.map((day) => {
            const isOpen = openDays.has(day.data)
            return (
              <article className="opportunity-radar-day" key={day.data}>
                <div className="opportunity-radar-day-heading">
                  <div>
                    <strong>{dateLabel(day.data)}</strong>
                    <span>{radarClassificationLabels[day.classificacao]}</span>
                  </div>
                  <div className="opportunity-radar-metrics">
                    <strong>{day.ocupacao_percentual}% ocupada</strong>
                    <span><Clock3 size={14} /> {minutesLabel(day.livre_minutos)} disponíveis</span>
                  </div>
                </div>
                <div className="opportunity-radar-day-footer">
                  <span><Users size={15} /> {day.total_oportunidades} {day.total_oportunidades === 1 ? 'cliente encontrado' : 'clientes encontrados'}</span>
                  <div className="opportunity-radar-actions">
                    {day.total_oportunidades > 0 || plansByDate.has(day.data) ? <button className="primary-button compact-action" type="button" disabled={preparePlan.isPending} onClick={() => openPlan(day)}>
                      {plansByDate.get(day.data)?.status === 'APROVADO' ? 'Ver plano aprovado' : plansByDate.get(day.data)?.status === 'RASCUNHO' ? 'Revisar plano' : 'Preparar ação'}
                    </button> : null}
                    <button className="ghost-button compact-action" type="button" onClick={() => toggleDay(day.data)} aria-expanded={isOpen}>
                      {isOpen ? 'Ocultar oportunidades' : 'Ver oportunidades'} <ChevronDown size={15} className={isOpen ? 'is-open' : ''} />
                    </button>
                  </div>
                </div>
                {isOpen ? (
                  <div className="opportunity-list">
                    {day.oportunidades.length ? day.oportunidades.map((opportunity) => (
                      <article className="opportunity-card" key={`${opportunity.origem}-${opportunity.id}`}>
                        <div className="opportunity-card-heading">
                          <div><strong>{opportunity.cliente_nome}</strong><span>{opportunity.servico_nome} · {minutesLabel(opportunity.duracao_minutos)}</span></div>
                          <span className={`opportunity-source ${opportunity.origem}`}>{opportunity.origem === 'lista_espera' ? 'Lista de espera' : 'Retorno'}</span>
                        </div>
                        <p>{opportunity.motivo}</p>
                        <div className="opportunity-windows"><strong>Compatível:</strong> {opportunity.janelas_compativeis.map((window) => `${window.inicio}–${window.fim}`).join(' · ')}</div>
                      </article>
                    )) : <p className="opportunity-empty">Nenhum cliente compatível foi encontrado para este dia.</p>}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="opportunity-radar-empty">
          <strong>Os próximos dias estão bem organizados.</strong>
          <span>Nenhum dia precisa de atenção no momento.</span>
        </div>
      )}
      {planListQuery.error ? <div className="form-alert">Não foi possível carregar os planos de ação: {planListQuery.error.message}</div> : null}
      {feedback ? <div className="form-alert">{feedback}</div> : null}
      {selectedPlanId && selectedDay && activeClinicId && professionalId ? <SecretaryActionPlanSheet
        activeClinicId={activeClinicId}
        professionalId={professionalId}
        planId={selectedPlanId}
        day={selectedDay}
        onClose={() => { setSelectedPlanId(null); setSelectedPlanDate(null) }}
        onPlansChanged={refreshRadar}
      /> : null}
    </section>
  )
}
