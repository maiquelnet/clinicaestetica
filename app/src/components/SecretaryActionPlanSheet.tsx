import { AlertTriangle, Check, RefreshCw, UserMinus, UserPlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDate } from '../lib/format'
import type { OpportunityDay } from '../lib/capacity'
import {
  addSecretaryActionPlanItem,
  approveSecretaryActionPlan,
  cancelSecretaryActionPlan,
  fetchSecretaryActionPlan,
  removeSecretaryActionPlanItem,
  updateSecretaryActionPlan,
} from '../lib/rpc'
import { MAX_CANDIDATOS_PLANO, planItemStatusLabel, planStatusLabel, type ActionPlanItem } from '../lib/secretaria'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder}min`
  return remainder ? `${hours}h${remainder}` : `${hours}h`
}

function dateLabel(value: string) {
  return formatDate(`${value}T12:00:00`)
}

function windowLabel(item: ActionPlanItem) {
  return item.janelas_compativeis.map((window) => `${window.inicio}–${window.fim}`).join(' · ')
}

function itemClassName(item: ActionPlanItem) {
  if (item.status === 'REMOVIDO') return 'secretary-plan-item is-removed'
  if (item.status === 'INVALIDO') return 'secretary-plan-item is-invalid'
  return 'secretary-plan-item'
}

export function SecretaryActionPlanSheet({
  activeClinicId,
  professionalId,
  planId,
  day,
  onClose,
  onPlansChanged,
}: {
  activeClinicId: string
  professionalId: string
  planId: string
  day: OpportunityDay
  onClose: () => void
  onPlansChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null)
  const planQuery = useQuery({
    queryKey: ['secretary-action-plan', activeClinicId, professionalId, planId],
    enabled: Boolean(activeClinicId && professionalId && planId),
    queryFn: () => fetchSecretaryActionPlan({
      p_clinica_id: activeClinicId,
      p_profissional_id: professionalId,
      p_plano_id: planId,
    }),
  })

  async function refreshPlan() {
    await queryClient.invalidateQueries({ queryKey: ['secretary-action-plan', activeClinicId, professionalId, planId] })
    await queryClient.invalidateQueries({ queryKey: ['secretary-action-plans', activeClinicId, professionalId] })
    onPlansChanged()
  }

  const removeItem = useMutation({
    mutationFn: (itemId: string) => removeSecretaryActionPlanItem({
      p_clinica_id: activeClinicId,
      p_profissional_id: professionalId,
      p_plano_id: planId,
      p_item_id: itemId,
    }),
    onSuccess: async () => {
      setFeedback({ kind: 'success', text: 'Candidato removido do plano.' })
      await refreshPlan()
    },
    onError: (error) => setFeedback({ kind: 'error', text: error.message }),
  })

  const addItem = useMutation({
    mutationFn: (opportunityId: string) => addSecretaryActionPlanItem({
      p_clinica_id: activeClinicId,
      p_profissional_id: professionalId,
      p_plano_id: planId,
      p_oportunidade_id: opportunityId,
    }),
    onSuccess: async () => {
      setFeedback({ kind: 'success', text: 'Candidato adicionado ao plano.' })
      await refreshPlan()
    },
    onError: (error) => setFeedback({ kind: 'error', text: error.message }),
  })

  const updatePlan = useMutation({
    mutationFn: () => updateSecretaryActionPlan({
      p_clinica_id: activeClinicId,
      p_profissional_id: professionalId,
      p_plano_id: planId,
    }),
    onSuccess: async (result) => {
      setFeedback({ kind: result.atualizado ? 'success' : 'warning', text: result.mensagem })
      await refreshPlan()
    },
    onError: (error) => setFeedback({ kind: 'error', text: error.message }),
  })

  const approvePlan = useMutation({
    mutationFn: () => approveSecretaryActionPlan({
      p_clinica_id: activeClinicId,
      p_profissional_id: professionalId,
      p_plano_id: planId,
    }),
    onSuccess: async (result) => {
      setFeedback({ kind: result.aprovado ? 'success' : 'warning', text: result.mensagem })
      await refreshPlan()
    },
    onError: (error) => setFeedback({ kind: 'error', text: error.message }),
  })

  const cancelPlan = useMutation({
    mutationFn: () => cancelSecretaryActionPlan({
      p_clinica_id: activeClinicId,
      p_profissional_id: professionalId,
      p_plano_id: planId,
    }),
    onSuccess: async () => {
      setFeedback({ kind: 'success', text: 'Plano cancelado. Nenhum cliente foi contatado.' })
      await refreshPlan()
    },
    onError: (error) => setFeedback({ kind: 'error', text: error.message }),
  })

  const plan = planQuery.data
  const activeClientIds = useMemo(
    () => new Set((plan?.itens || []).filter((item) => item.status === 'SELECIONADO').map((item) => item.cliente_id)),
    [plan?.itens],
  )
  const otherOpportunities = useMemo(
    () => day.oportunidades.filter((opportunity) => !activeClientIds.has(opportunity.cliente_id)),
    [activeClientIds, day.oportunidades],
  )
  const busy = removeItem.isPending || addItem.isPending || updatePlan.isPending || approvePlan.isPending || cancelPlan.isPending

  return (
    <div className="sheet-layer" role="presentation">
      <button className="sheet-overlay" type="button" aria-label="Fechar revisão do plano" onClick={onClose} />
      <section className="bottom-sheet secretary-plan-sheet" role="dialog" aria-modal="true" aria-labelledby="secretary-plan-title">
        <div className="sheet-handle" />
        <header>
          <div>
            <p className="eyebrow">Secretária assistida</p>
            <h2 id="secretary-plan-title">Plano para {dateLabel(plan?.data_alvo || day.data)}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Fechar revisão do plano" onClick={onClose}><X size={18} /></button>
        </header>

        {planQuery.isLoading ? <p className="opportunity-empty">Carregando a revisão mais atual do plano…</p> : null}
        {planQuery.error ? <div className="form-alert">{planQuery.error.message}</div> : null}
        {plan ? <>
          <div className="secretary-plan-summary">
            <div><span>Status</span><strong>{planStatusLabel(plan.status)}</strong></div>
            <div><span>Disponibilidade</span><strong>{minutesLabel(plan.livre_minutos_snapshot)} livres</strong></div>
            <div><span>Ocupação</span><strong>{plan.ocupacao_percentual_snapshot === null ? 'Sem capacidade' : `${plan.ocupacao_percentual_snapshot}%`}</strong></div>
            <div><span>Selecionados</span><strong>{plan.itens_selecionados}/{MAX_CANDIDATOS_PLANO}</strong></div>
          </div>

          {feedback ? <div className={`secretary-plan-feedback ${feedback.kind === 'error' ? 'is-error' : feedback.kind === 'warning' ? 'is-warning' : 'is-success'}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'warning' ? <AlertTriangle size={16} /> : feedback.kind === 'success' ? <Check size={16} /> : null}<span>{feedback.text}</span></div> : null}

          <div className="secretary-plan-items">
            <div className="secretary-plan-section-heading"><div><h3>Clientes selecionados</h3><p>Revise os candidatos antes de aprovar.</p></div><span>{plan.itens_selecionados} de {MAX_CANDIDATOS_PLANO}</span></div>
            {plan.itens.length ? plan.itens.map((item) => (
              <article className={itemClassName(item)} key={item.id}>
                <label className="secretary-plan-item-check">
                  <input
                    type="checkbox"
                    checked={item.status === 'SELECIONADO'}
                    disabled={plan.status !== 'RASCUNHO' || item.status !== 'SELECIONADO' || busy}
                    onChange={() => removeItem.mutate(item.id)}
                    aria-label={`${item.status === 'SELECIONADO' ? 'Remover' : 'Candidato'} ${item.cliente_nome}`}
                  />
                  <span />
                </label>
                <div className="secretary-plan-item-copy">
                  <strong>{item.cliente_nome}</strong>
                  <span>{item.servico_nome} · {minutesLabel(item.duracao_minutos)} · {item.origem === 'lista_espera' ? 'Lista de espera' : 'Retorno'}</span>
                  <small>{item.motivo}</small>
                  <small>Janelas compatíveis: {windowLabel(item) || 'não informadas'}</small>
                  {item.status !== 'SELECIONADO' ? <em>{planItemStatusLabel(item.status)}{item.motivo_invalidacao ? ` · ${item.motivo_invalidacao}` : ''}</em> : null}
                </div>
                {item.status === 'SELECIONADO' && plan.status === 'RASCUNHO' ? <button className="ghost-button compact-action secretary-plan-remove" type="button" disabled={busy} onClick={() => removeItem.mutate(item.id)}><UserMinus size={15} /> Remover</button> : null}
              </article>
            )) : <p className="opportunity-empty">Nenhum candidato selecionado. Você pode adicionar oportunidades atuais abaixo.</p>}
          </div>

          {plan.status === 'RASCUNHO' ? <details className="secretary-plan-other-opportunities">
            <summary><span><UserPlus size={16} /> Ver outras oportunidades atuais</span><small>Somente clientes recalculados agora</small></summary>
            <div className="secretary-plan-other-list">
              {otherOpportunities.length ? otherOpportunities.map((opportunity) => (
                <article className="opportunity-card" key={`${opportunity.origem}-${opportunity.id}`}>
                  <div className="opportunity-card-heading"><div><strong>{opportunity.cliente_nome}</strong><span>{opportunity.servico_nome} · {minutesLabel(opportunity.duracao_minutos)}</span></div><span className={`opportunity-source ${opportunity.origem}`}>{opportunity.origem === 'lista_espera' ? 'Lista de espera' : 'Retorno'}</span></div>
                  <p>{opportunity.motivo}</p>
                  <div className="opportunity-windows"><strong>Compatível:</strong> {opportunity.janelas_compativeis.map((window) => `${window.inicio}–${window.fim}`).join(' · ')}</div>
                  <button className="ghost-button compact-action" type="button" disabled={busy || plan.itens_selecionados >= MAX_CANDIDATOS_PLANO} onClick={() => addItem.mutate(opportunity.id)}><UserPlus size={15} /> Adicionar ao plano</button>
                </article>
              )) : <p className="opportunity-empty">Não há outra oportunidade atual para adicionar neste dia.</p>}
            </div>
          </details> : null}

          {plan.status === 'APROVADO' ? <div className="secretary-plan-success"><Check size={18} /><span>Plano aprovado. Os clientes ainda não foram contatados.</span></div> : null}

          {plan.status === 'RASCUNHO' ? <div className="secretary-plan-actions">
            <button className="ghost-button" type="button" disabled={busy} onClick={() => updatePlan.mutate()}><RefreshCw size={16} /> Atualizar plano</button>
            <button className="primary-button" type="button" disabled={busy || plan.itens_selecionados === 0} onClick={() => approvePlan.mutate()}><Check size={16} /> Aprovar plano</button>
            <button className="danger-button" type="button" disabled={busy} onClick={() => cancelPlan.mutate()}>Cancelar plano</button>
          </div> : null}
          {plan.status === 'CANCELADO' ? <div className="secretary-plan-feedback is-warning"><AlertTriangle size={16} /><span>Este plano está cancelado e não pode mais ser alterado.</span></div> : null}
        </> : null}
      </section>
    </div>
  )
}
