import { useQuery } from '@tanstack/react-query'
import { CalendarClock, CalendarDays, CircleCheck, Clock3, Plus, Search, Stethoscope, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../../components/PageHeader'
import { TreatmentSectionNav } from '../../../components/TreatmentSectionNav'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { useClinic } from '../../../contexts/useClinic'
import { formatDateTime, formatMoney } from '../../../lib/format'
import { countRemainingOccurrences, toLocalDateTime, todayLocalDate } from '../../../lib/treatment-schedule'
import type { TreatmentPlan, TreatmentPlanItem } from '../../../lib/types'
import { supabase } from '../../../lib/supabase'
import './TreatmentPlans.css'

type PlanRow = TreatmentPlan & {
  profissional?: { id: string; nome: string } | null
  itens_plano_tratamento?: TreatmentPlanItem[]
}

const statusLabels = {
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

function remainingFor(plan: PlanRow) {
  return countRemainingOccurrences((plan.itens_plano_tratamento || []).map((item) => ({
    number: item.numero_sessao || 0,
    startLocal: item.inicio_previsto_em ? toLocalDateTime(item.inicio_previsto_em) : '9999-12-31T00:00',
    endLocal: item.fim_previsto_em ? toLocalDateTime(item.fim_previsto_em) : '9999-12-31T00:00',
    manual: item.ajuste_manual,
    situation: item.situacao,
    archived: Boolean(item.arquivado_em),
  })), todayLocalDate())
}

export function TreatmentPlansListPage() {
  const { activeClinicId } = useClinic()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'todos' | TreatmentPlan['status']>('todos')

  const query = useQuery({
    queryKey: ['treatment-plans', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planos_tratamento')
        .select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos),profissional:perfis!planos_tratamento_profissional_id_fkey(id,nome),itens_plano_tratamento(*)')
        .eq('clinica_id', activeClinicId)
        .is('arquivado_em', null)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return (data || []) as unknown as PlanRow[]
    },
  })

  const plans = useMemo(() => query.data || [], [query.data])
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return plans.filter((plan) => {
      const matchesStatus = status === 'todos' || plan.status === status
      const content = `${plan.nome} ${plan.clientes?.nome || ''} ${plan.servicos?.nome || ''}`.toLocaleLowerCase('pt-BR')
      return matchesStatus && (!term || content.includes(term))
    })
  }, [plans, search, status])

  const scheduled = plans.filter((plan) => (plan.itens_plano_tratamento || []).some((item) => !item.arquivado_em)).length
  const pendingTotal = plans.filter((plan) => plan.status === 'em_andamento').reduce((sum, plan) => sum + remainingFor(plan), 0)
  const nextSevenDays = plans.reduce((sum, plan) => sum + (plan.itens_plano_tratamento || []).filter((item) => {
    if (!item.inicio_previsto_em || item.situacao !== 'planejado' || item.arquivado_em) return false
    const date = new Date(item.inicio_previsto_em)
    const now = new Date()
    const limit = new Date(now)
    limit.setDate(limit.getDate() + 7)
    return date >= now && date <= limit
  }).length, 0)

  return (
    <main className="content-page treatment-list-page">
      <PageHeader
        eyebrow="Tratamentos"
        title="Planos de tratamento"
        description="Acompanhe o progresso, as próximas datas e os planos que ainda precisam de cronograma."
        actions={<Link className="primary-button" to="/planos-tratamento/novo"><Plus size={17} /> Novo tratamento</Link>}
      />
      <TreatmentSectionNav />
      {query.error ? <div className="form-alert">{query.error.message}</div> : null}
      {query.isLoading ? <LoadingBlock /> : <>
        <section className="treatment-summary" aria-label="Resumo dos planos">
          <article><Stethoscope size={19} /><strong>{plans.length}</strong><span>planos cadastrados</span></article>
          <article><CircleCheck size={19} /><strong>{scheduled}</strong><span>com cronograma</span></article>
          <article><Clock3 size={19} /><strong>{pendingTotal}</strong><span>dias restantes</span></article>
          <article><CalendarClock size={19} /><strong>{nextSevenDays}</strong><span>nos próximos 7 dias</span></article>
        </section>

        <section className="panel treatment-catalog">
          <div className="panel-header"><div><h2>Tratamentos cadastrados</h2><p>Busque uma cliente ou filtre pela situação do plano.</p></div></div>
          <div className="treatment-tools">
            <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar plano, cliente ou serviço" /></label>
            <select aria-label="Filtrar por status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="todos">Todos os status</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluido">Concluídos</option>
              <option value="cancelado">Cancelados</option>
            </select>
          </div>

          {filtered.length ? <div className="record-list">{filtered.map((plan) => {
            const items = (plan.itens_plano_tratamento || []).filter((item) => !item.arquivado_em)
            const remaining = remainingFor(plan)
            const completed = Math.max(0, plan.total_sessoes - remaining)
            const progress = plan.total_sessoes ? Math.min(100, Math.round((completed / plan.total_sessoes) * 100)) : 0
            const next = items
              .filter((item) => item.situacao === 'planejado' && item.inicio_previsto_em && item.inicio_previsto_em.slice(0, 10) >= new Date().toISOString().slice(0, 10))
              .sort((a, b) => String(a.inicio_previsto_em).localeCompare(String(b.inicio_previsto_em)))[0]
            const waitingReschedule = items.filter((item) => item.situacao === 'aguardando_reagendamento').length
            return <article className="treatment-card" key={plan.id}>
              <div className="treatment-card-header">
                <div><p>{plan.clientes?.nome || 'Cliente não localizada'}</p><h2>{plan.nome}</h2></div>
                <span className={`badge ${plan.status === 'em_andamento' ? 'success' : plan.status === 'cancelado' ? 'cancelado' : ''}`}>{statusLabels[plan.status]}</span>
              </div>
              <div className="treatment-plan-meta">
                <span><Stethoscope size={14} /> {plan.servicos?.nome || 'Serviço não localizado'}</span>
                <span><UserRound size={14} /> {plan.profissional?.nome || 'Profissional será definido ao confirmar'}</span>
                <span>{formatMoney(plan.valor_total)}</span>
              </div>
              {items.length ? <div>
                <div className="treatment-progress-heading"><strong>Faltam {remaining} dias</strong><span>{completed} de {plan.total_sessoes} datas transcorridas</span></div>
                <div className="treatment-progress-track" aria-label={`${progress}% do cronograma transcorrido`}><span style={{ width: `${progress}%` }} /></div>
              </div> : <div className="form-alert">Sem cronograma. Edite e confirme o plano para gerar as datas na Agenda.</div>}
              <footer className="treatment-card-footer">
                <div><CalendarDays size={16} />{next ? <span>Próximo: <strong>{formatDateTime(next.inicio_previsto_em!)}</strong></span> : waitingReschedule ? <span>{waitingReschedule} aguardando reagendamento</span> : <span>Nenhuma data futura</span>}</div>
                <div className="record-actions">
                  {next ? <Link className="ghost-button" to={`/agenda?data=${next.inicio_previsto_em!.slice(0, 10)}`}>Abrir Agenda</Link> : null}
                  <Link className="primary-button" to={`/planos-tratamento/${plan.id}/editar`}>Editar plano</Link>
                </div>
              </footer>
            </article>
          })}</div> : <EmptyState title="Nenhum plano encontrado">Ajuste os filtros ou cadastre o primeiro tratamento.</EmptyState>}
        </section>
      </>}
    </main>
  )
}
