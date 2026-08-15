import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CircleDollarSign, Pencil } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { useClinic } from '../../../contexts/useClinic'
import { formatDate, formatMoney, parseCurrency } from '../../../lib/format'
import { supabase } from '../../../lib/supabase'
import type { FinancialMovement } from '../../../lib/types'
import { ManagementFormActions, ManagementFormPage, ManagementListPage, ManagementSectionNav, ManagementToolbar } from '../shared/ManagementPage'
import { clean, statusBadge, todayInput } from '../shared/utils'
import type { FinanceMode, Option } from '../shared/utils'

const financePages: Record<FinanceMode, { path: string; title: string; description: string; newLabel: string; editLabel: string; type: 'receita' | 'despesa' | null }> = {
  cashflow: { path: '/financeiro/fluxo-caixa', title: 'Fluxo de caixa', description: 'Acompanhe entradas e saídas por vencimento e situação.', newLabel: 'Nova movimentação', editLabel: 'Editar movimentação', type: null },
  receivable: { path: '/financeiro/contas-a-receber', title: 'Contas a receber', description: 'Organize receitas pendentes, pagas e vencidas.', newLabel: 'Nova receita', editLabel: 'Editar receita', type: 'receita' },
  payable: { path: '/financeiro/contas-a-pagar', title: 'Contas a pagar', description: 'Organize despesas pendentes, pagas e vencidas.', newLabel: 'Nova despesa', editLabel: 'Editar despesa', type: 'despesa' },
}

const financeNav = <ManagementSectionNav label="Seções do Financeiro" items={[
  { to: financePages.cashflow.path, label: 'Fluxo de caixa' },
  { to: financePages.receivable.path, label: 'A receber' },
  { to: financePages.payable.path, label: 'A pagar' },
]} />

function emptyDraft(mode: FinanceMode) {
  return { tipo: mode === 'payable' ? 'despesa' : 'receita', descricao: '', valor: '', vencimento_em: todayInput, pago_em: '', status: 'pendente', categoria: '', conta: '', metodo_pagamento: '', cliente_id: '', observacao: '' }
}

async function fetchMovements(clinicId: string, mode: FinanceMode) {
  let request = supabase.from('movimentacoes_financeiras').select('*,clientes(id,nome,telefone)').eq('clinica_id', clinicId).is('arquivado_em', null).order('vencimento_em', { ascending: false })
  if (financePages[mode].type) request = request.eq('tipo', financePages[mode].type!)
  const { data, error } = await request
  if (error) throw error
  return (data || []) as FinancialMovement[]
}

export function FinancePage({ mode }: { mode: FinanceMode }) {
  const { activeClinicId } = useClinic()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'todos' | 'pendente' | 'pago' | 'cancelado'>('todos')
  const page = financePages[mode]
  const query = useQuery({ queryKey: ['finance', activeClinicId, mode], enabled: Boolean(activeClinicId), queryFn: () => fetchMovements(activeClinicId!, mode) })
  const movements = useMemo(() => query.data || [], [query.data])
  const totals = useMemo(() => ({
    paid: movements.filter((item) => item.status === 'pago').reduce((sum, item) => sum + Number(item.valor || 0), 0),
    pending: movements.filter((item) => item.status === 'pendente').reduce((sum, item) => sum + Number(item.valor || 0), 0),
    overdue: movements.filter((item) => item.status === 'pendente' && item.vencimento_em && item.vencimento_em < todayInput).length,
  }), [movements])
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return movements.filter((item) => {
      const matchesStatus = status === 'todos' || item.status === status
      const content = `${item.descricao} ${item.categoria || ''} ${item.clientes?.nome || ''}`.toLocaleLowerCase('pt-BR')
      return matchesStatus && (!term || content.includes(term))
    })
  }, [movements, search, status])

  return (
    <ManagementListPage eyebrow="Financeiro" title={page.title} description={page.description} newTo={`${page.path}/novo`} newLabel={page.newLabel} nav={financeNav} error={query.error as Error | null}>
      <section className="ops-metrics"><article><CircleDollarSign size={17} /><span>Pago</span><strong>{formatMoney(totals.paid)}</strong></article><article><CircleDollarSign size={17} /><span>Pendente</span><strong>{formatMoney(totals.pending)}</strong></article><article><AlertTriangle size={17} /><span>Vencidas</span><strong>{totals.overdue}</strong></article></section>
      <section className="panel management-catalog">
        <ManagementToolbar search={search} onSearch={setSearch} searchPlaceholder="Buscar descrição, categoria ou cliente"><select aria-label="Filtrar por situação" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="todos">Todas as situações</option><option value="pendente">Pendentes</option><option value="pago">Pagas</option><option value="cancelado">Canceladas</option></select></ManagementToolbar>
        {query.isLoading ? <LoadingBlock /> : filtered.length ? <div className="record-list">{filtered.map((item) => <article className="record-card" key={item.id}><div><h3>{item.descricao}</h3><div className="record-meta"><span>{item.tipo === 'receita' ? 'Receita' : 'Despesa'}</span><span>{formatMoney(item.valor)}</span><span>Vence em {formatDate(item.vencimento_em)}</span><span>{item.clientes?.nome || 'Sem cliente'}</span><span className={`badge ${statusBadge(item.status)}`}>{item.status}</span></div>{item.observacao ? <p>{item.observacao}</p> : null}</div><div className="record-actions"><Link className="ghost-button" to={`${page.path}/${item.id}/editar`}><Pencil size={15} /> Editar</Link></div></article>)}</div> : <EmptyState title="Nenhuma movimentação encontrada">Ajuste os filtros ou crie um novo registro.</EmptyState>}
      </section>
    </ManagementListPage>
  )
}

export function FinanceFormPage({ mode }: { mode: FinanceMode }) {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const initialized = useRef('')
  const page = financePages[mode]
  const [draft, setDraft] = useState(() => emptyDraft(mode))

  const query = useQuery({
    queryKey: ['finance-form', activeClinicId, mode, id || 'new'],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const clients = await supabase.from('clientes').select('id,nome,telefone').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('nome')
      if (clients.error) throw clients.error
      if (!id) return { clients: (clients.data || []) as Option[], movement: null }
      let movementRequest = supabase.from('movimentacoes_financeiras').select('*').eq('id', id).eq('clinica_id', activeClinicId).is('arquivado_em', null)
      if (page.type) movementRequest = movementRequest.eq('tipo', page.type)
      const movement = await movementRequest.maybeSingle()
      if (movement.error) throw movement.error
      if (!movement.data) throw new Error('Movimentação não encontrada nesta clínica ou seção.')
      return { clients: (clients.data || []) as Option[], movement: movement.data as FinancialMovement }
    },
  })

  useEffect(() => {
    if (!query.data) return
    const key = `${mode}:${id || 'new'}`
    if (initialized.current === key) return
    initialized.current = key
    const item = query.data.movement
    setDraft(item ? { tipo: item.tipo, descricao: item.descricao, valor: String(item.valor), vencimento_em: item.vencimento_em || '', pago_em: item.pago_em || '', status: item.status, categoria: item.categoria || '', conta: item.conta || '', metodo_pagamento: item.metodo_pagamento || '', cliente_id: item.cliente_id || '', observacao: item.observacao || '' } : emptyDraft(mode))
  }, [id, mode, query.data])

  const save = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error('Clínica ativa não encontrada.')
      const tipo = page.type || draft.tipo
      const payload = { clinica_id: activeClinicId, tipo, descricao: draft.descricao.trim(), valor: parseCurrency(draft.valor), vencimento_em: draft.vencimento_em || null, pago_em: draft.pago_em || null, status: draft.status, categoria: clean(draft.categoria), conta: clean(draft.conta), metodo_pagamento: clean(draft.metodo_pagamento), cliente_id: draft.cliente_id || null, observacao: clean(draft.observacao), atualizado_em: new Date().toISOString() }
      if (!payload.descricao) throw new Error('Informe a descrição.')
      if (id) {
        let request = supabase.from('movimentacoes_financeiras').update(payload).eq('id', id).eq('clinica_id', activeClinicId)
        if (page.type) request = request.eq('tipo', page.type)
        const { data, error } = await request.select('id').maybeSingle()
        if (error) throw error
        if (!data) throw new Error('Movimentação não encontrada nesta clínica ou seção.')
      } else {
        const { error } = await supabase.from('movimentacoes_financeiras').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['finance', activeClinicId] }); navigate(page.path) },
  })

  return (
    <ManagementFormPage eyebrow="Financeiro" title={editing ? page.editLabel : page.newLabel} description="Preencha os dados financeiros e confirme para retornar à listagem." backTo={page.path} nav={financeNav} loading={query.isLoading} error={query.error as Error | null}>
      {query.data ? <form className="panel management-editor" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}>
        <fieldset><legend>Movimentação</legend><div className="form-grid"><label>Tipo<select value={page.type || draft.tipo} disabled={Boolean(page.type)} onChange={(event) => setDraft({ ...draft, tipo: event.target.value })}><option value="receita">Receita</option><option value="despesa">Despesa</option></select></label><label>Descrição<input value={draft.descricao} onChange={(event) => setDraft({ ...draft, descricao: event.target.value })} /></label></div><div className="form-grid"><label>Valor<input inputMode="decimal" value={draft.valor} onChange={(event) => setDraft({ ...draft, valor: event.target.value })} /></label><label>Cliente<select value={draft.cliente_id} onChange={(event) => setDraft({ ...draft, cliente_id: event.target.value })}><option value="">Sem cliente</option>{query.data.clients.map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></label></div></fieldset>
        <fieldset><legend>Datas e situação</legend><div className="form-grid"><label>Vencimento<input type="date" value={draft.vencimento_em} onChange={(event) => setDraft({ ...draft, vencimento_em: event.target.value })} /></label><label>Pago em<input type="date" value={draft.pago_em} onChange={(event) => setDraft({ ...draft, pago_em: event.target.value, status: event.target.value ? 'pago' : draft.status })} /></label></div><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="cancelado">Cancelado</option></select></label></fieldset>
        <fieldset><legend>Classificação</legend><div className="form-grid"><label>Categoria<input value={draft.categoria} onChange={(event) => setDraft({ ...draft, categoria: event.target.value })} /></label><label>Conta<input value={draft.conta} onChange={(event) => setDraft({ ...draft, conta: event.target.value })} /></label></div><label>Método de pagamento<input value={draft.metodo_pagamento} onChange={(event) => setDraft({ ...draft, metodo_pagamento: event.target.value })} /></label><label>Observação<textarea rows={4} value={draft.observacao} onChange={(event) => setDraft({ ...draft, observacao: event.target.value })} /></label></fieldset>
        {save.error ? <div className="form-alert">{save.error.message}</div> : null}<ManagementFormActions backTo={page.path} pending={save.isPending} saveLabel={editing ? 'Salvar alterações' : page.newLabel} />
      </form> : null}
    </ManagementFormPage>
  )
}
