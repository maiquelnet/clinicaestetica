import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, CircleDollarSign, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { PageHeader } from '../../../components/PageHeader'
import { useClinic } from '../../../contexts/useClinic'
import { formatDate, formatMoney, parseCurrency } from '../../../lib/format'
import { supabase } from '../../../lib/supabase'
import type { FinancialMovement } from '../../../lib/types'
import { CrudHeader } from '../shared/CrudPage'
import { clean, statusBadge, todayInput } from '../shared/utils'
import type { FinanceMode, Option } from '../shared/utils'
export function FinancePage({ mode }: { mode: FinanceMode }) {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<FinancialMovement | null>(null)
  const defaultType = mode === 'payable' ? 'despesa' : 'receita'
  const [draft, setDraft] = useState({ tipo: defaultType, descricao: '', valor: '', vencimento_em: todayInput, pago_em: '', status: 'pendente', categoria: '', conta: '', metodo_pagamento: '', cliente_id: '', observacao: '' })
  const pages: Record<FinanceMode, { title: string; description: string }> = {
    cashflow: { title: 'Fluxo de Caixa', description: 'Entradas e saidas do caixa por periodo.' },
    receivable: { title: 'Contas a Receber', description: 'Receitas pendentes e pagas.' },
    payable: { title: 'Contas a Pagar', description: 'Despesas pendentes e pagas.' },
  }
  const page = pages[mode]
  const query = useQuery({
    queryKey: ['finance', activeClinicId, mode],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const clients = await supabase.from('clientes').select('id,nome,telefone').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('nome')
      let request = supabase.from('movimentacoes_financeiras').select('*,clientes(id,nome,telefone)').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('vencimento_em', { ascending: false })
      if (mode === 'receivable') request = request.eq('tipo', 'receita')
      if (mode === 'payable') request = request.eq('tipo', 'despesa')
      const movements = await request
      if (clients.error) throw clients.error
      if (movements.error) throw movements.error
      return { clients: (clients.data || []) as Option[], movements: (movements.data || []) as FinancialMovement[] }
    },
  })
  const totals = useMemo(() => {
    const movements = query.data?.movements || []
    return {
      paid: movements.filter((item) => item.status === 'pago').reduce((sum, item) => sum + Number(item.valor || 0), 0),
      pending: movements.filter((item) => item.status === 'pendente').reduce((sum, item) => sum + Number(item.valor || 0), 0),
      overdue: movements.filter((item) => item.status === 'pendente' && item.vencimento_em && item.vencimento_em < todayInput).length,
    }
  }, [query.data?.movements])
  const save = useMutation({
    mutationFn: async () => {
      const payload = { clinica_id: activeClinicId, tipo: draft.tipo, descricao: draft.descricao.trim(), valor: parseCurrency(draft.valor), vencimento_em: draft.vencimento_em || null, pago_em: draft.pago_em || null, status: draft.status, categoria: clean(draft.categoria), conta: clean(draft.conta), metodo_pagamento: clean(draft.metodo_pagamento), cliente_id: draft.cliente_id || null, observacao: clean(draft.observacao), atualizado_em: new Date().toISOString() }
      if (!payload.descricao) throw new Error('Informe a descricao.')
      const request = editing ? supabase.from('movimentacoes_financeiras').update(payload).eq('id', editing.id) : supabase.from('movimentacoes_financeiras').insert(payload)
      const { error } = await request
      if (error) throw error
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['finance', activeClinicId] }); setEditing(null) },
  })
  function edit(item: FinancialMovement) {
    setEditing(item)
    setDraft({ tipo: item.tipo, descricao: item.descricao, valor: String(item.valor), vencimento_em: item.vencimento_em || '', pago_em: item.pago_em || '', status: item.status, categoria: item.categoria || '', conta: item.conta || '', metodo_pagamento: item.metodo_pagamento || '', cliente_id: item.cliente_id || '', observacao: item.observacao || '' })
  }
  return (
    <main className="content-page">
      <PageHeader eyebrow="Financeiro" title={page.title} description={page.description} />
      <section className="ops-metrics"><article><CircleDollarSign size={17} /><span>Pago</span><strong>{formatMoney(totals.paid)}</strong></article><article><CircleDollarSign size={17} /><span>Pendente</span><strong>{formatMoney(totals.pending)}</strong></article><article><Archive size={17} /><span>Vencidas</span><strong>{totals.overdue}</strong></article></section>
      <div className="data-workspace has-drawer">
        <section className="panel list-panel data-panel">
          <div className="panel-header compact-header"><h2>Movimentacoes</h2><span>{query.data?.movements.length ?? 0} registros</span></div>
          {query.isLoading ? <LoadingBlock /> : query.data?.movements.length ? <div className="record-list">{query.data.movements.map((item) => <article className="record-card" key={item.id}><div><h3>{item.descricao}</h3><div className="record-meta"><span>{item.tipo}</span><span>{formatMoney(item.valor)}</span><span>Vence {formatDate(item.vencimento_em)}</span><span>{item.clientes?.nome || '-'}</span><span className={`badge ${statusBadge(item.status)}`}>{item.status}</span></div>{item.observacao ? <p>{item.observacao}</p> : null}</div><div className="record-actions"><button className="ghost-button" type="button" onClick={() => edit(item)}>Editar</button></div></article>)}</div> : <EmptyState title="Nenhuma movimentacao encontrada" />}
        </section>
        <form className="panel form-panel drawer-panel" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}><CrudHeader title={editing ? 'Editar movimentacao' : 'Nova movimentacao'} onClear={() => setEditing(null)} /><label>Tipo<select value={draft.tipo} disabled={mode !== 'cashflow'} onChange={(event) => setDraft({ ...draft, tipo: event.target.value })}><option value="receita">Receita</option><option value="despesa">Despesa</option></select></label><label>Descricao<input value={draft.descricao} onChange={(event) => setDraft({ ...draft, descricao: event.target.value })} /></label><label>Valor<input inputMode="decimal" value={draft.valor} onChange={(event) => setDraft({ ...draft, valor: event.target.value })} /></label><div className="form-grid"><label>Vencimento<input type="date" value={draft.vencimento_em} onChange={(event) => setDraft({ ...draft, vencimento_em: event.target.value })} /></label><label>Pago em<input type="date" value={draft.pago_em} onChange={(event) => setDraft({ ...draft, pago_em: event.target.value, status: event.target.value ? 'pago' : draft.status })} /></label></div><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="cancelado">Cancelado</option></select></label><label>Cliente<select value={draft.cliente_id} onChange={(event) => setDraft({ ...draft, cliente_id: event.target.value })}><option value="">Sem cliente</option>{(query.data?.clients || []).map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></label><div className="form-grid"><label>Categoria<input value={draft.categoria} onChange={(event) => setDraft({ ...draft, categoria: event.target.value })} /></label><label>Metodo<input value={draft.metodo_pagamento} onChange={(event) => setDraft({ ...draft, metodo_pagamento: event.target.value })} /></label></div><label>Observacao<textarea rows={3} value={draft.observacao} onChange={(event) => setDraft({ ...draft, observacao: event.target.value })} /></label>{save.error ? <div className="form-alert">{save.error.message}</div> : null}<button className="primary-button" type="submit"><Save size={16} /> Salvar</button></form>
      </div>
    </main>
  )
}
