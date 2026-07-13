import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useState } from 'react'
import { useClinic } from '../../../contexts/useClinic'
import { formatMoney, parseCurrency } from '../../../lib/format'
import { supabase } from '../../../lib/supabase'
import type { TreatmentPlan } from '../../../lib/types'
import { fetchClientsAndServices } from '../shared/data'
import { CrudHeader, SimpleCrudPage } from '../shared/CrudPage'
import { clean, statusBadge, todayInput } from '../shared/utils'
export function TreatmentPlansPage() {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<TreatmentPlan | null>(null)
  const [draft, setDraft] = useState({ cliente_id: '', servico_id: '', nome: '', total_sessoes: '1', sessoes_realizadas: '0', valor_total: '', valor_sessao: '', status: 'em_andamento', inicio_em: todayInput, fim_previsto_em: '', observacoes: '' })
  const query = useQuery({
    queryKey: ['treatment-plans', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const base = await fetchClientsAndServices(activeClinicId!)
      const plans = await supabase.from('planos_tratamento').select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos)').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('criado_em', { ascending: false })
      if (plans.error) throw plans.error
      return { ...base, plans: (plans.data || []) as TreatmentPlan[] }
    },
  })
  const save = useMutation({
    mutationFn: async () => {
      const total = Number(draft.total_sessoes || 1)
      const done = Number(draft.sessoes_realizadas || 0)
      const payload = { clinica_id: activeClinicId, cliente_id: draft.cliente_id, servico_id: draft.servico_id, nome: draft.nome.trim(), total_sessoes: total, sessoes_realizadas: done, valor_total: parseCurrency(draft.valor_total), valor_sessao: parseCurrency(draft.valor_sessao), status: draft.status, inicio_em: draft.inicio_em || null, fim_previsto_em: draft.fim_previsto_em || null, observacoes: clean(draft.observacoes), atualizado_em: new Date().toISOString() }
      if (!payload.cliente_id || !payload.servico_id || !payload.nome) throw new Error('Informe cliente, servico e nome do plano.')
      if (done > total) throw new Error('Sessoes realizadas nao podem passar do total.')
      const request = editing ? supabase.from('planos_tratamento').update(payload).eq('id', editing.id) : supabase.from('planos_tratamento').insert(payload)
      const { error } = await request
      if (error) throw error
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['treatment-plans', activeClinicId] }); setEditing(null) },
  })
  function edit(plan: TreatmentPlan) {
    setEditing(plan)
    setDraft({ cliente_id: plan.cliente_id, servico_id: plan.servico_id, nome: plan.nome, total_sessoes: String(plan.total_sessoes), sessoes_realizadas: String(plan.sessoes_realizadas), valor_total: String(plan.valor_total), valor_sessao: String(plan.valor_sessao), status: plan.status, inicio_em: plan.inicio_em || '', fim_previsto_em: plan.fim_previsto_em || '', observacoes: plan.observacoes || '' })
  }
  return (
    <SimpleCrudPage
      title="Planos de tratamento"
      eyebrow="Cadastros"
      description="Controle pacotes, sessoes realizadas, sessoes faltantes e valores especificos."
      loading={query.isLoading}
      records={query.data?.plans || []}
      renderRecord={(plan: TreatmentPlan) => <article className="record-card" key={plan.id}><div><h3>{plan.nome}</h3><div className="record-meta"><span>{plan.clientes?.nome}</span><span>{plan.servicos?.nome}</span><span>{plan.sessoes_realizadas}/{plan.total_sessoes} sessoes</span><span>Faltam {plan.total_sessoes - plan.sessoes_realizadas}</span><span>{formatMoney(plan.valor_total)}</span><span className={`badge ${statusBadge(plan.status)}`}>{plan.status.replace('_', ' ')}</span></div>{plan.observacoes ? <p>{plan.observacoes}</p> : null}</div><div className="record-actions"><button className="ghost-button" type="button" onClick={() => edit(plan)}>Editar</button></div></article>}
      form={<form className="panel form-panel drawer-panel" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}><CrudHeader title={editing ? 'Editar plano' : 'Novo plano'} onClear={() => setEditing(null)} /><label>Cliente<select value={draft.cliente_id} onChange={(event) => setDraft({ ...draft, cliente_id: event.target.value })}><option value="">Selecione</option>{(query.data?.clients || []).map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></label><label>Servico<select value={draft.servico_id} onChange={(event) => setDraft({ ...draft, servico_id: event.target.value })}><option value="">Selecione</option>{(query.data?.services || []).map((service) => <option key={service.id} value={service.id}>{service.nome}</option>)}</select></label><label>Nome do plano<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label><div className="form-grid"><label>Total de sessoes<input type="number" min={1} value={draft.total_sessoes} onChange={(event) => setDraft({ ...draft, total_sessoes: event.target.value })} /></label><label>Realizadas<input type="number" min={0} value={draft.sessoes_realizadas} onChange={(event) => setDraft({ ...draft, sessoes_realizadas: event.target.value })} /></label></div><div className="form-grid"><label>Valor total<input inputMode="decimal" value={draft.valor_total} onChange={(event) => setDraft({ ...draft, valor_total: event.target.value })} /></label><label>Valor sessao<input inputMode="decimal" value={draft.valor_sessao} onChange={(event) => setDraft({ ...draft, valor_sessao: event.target.value })} /></label></div><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="em_andamento">Em andamento</option><option value="concluido">Concluido</option><option value="cancelado">Cancelado</option></select></label><div className="form-grid"><label>Inicio<input type="date" value={draft.inicio_em} onChange={(event) => setDraft({ ...draft, inicio_em: event.target.value })} /></label><label>Fim previsto<input type="date" value={draft.fim_previsto_em} onChange={(event) => setDraft({ ...draft, fim_previsto_em: event.target.value })} /></label></div><label>Observacoes<textarea rows={3} value={draft.observacoes} onChange={(event) => setDraft({ ...draft, observacoes: event.target.value })} /></label>{save.error ? <div className="form-alert">{save.error.message}</div> : null}<button className="primary-button" type="submit"><Save size={16} /> Salvar</button></form>}
    />
  )
}
