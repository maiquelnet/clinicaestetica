import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, PackageMinus, Pencil } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { useClinic } from '../../../contexts/useClinic'
import { formatMoney, parseCurrency } from '../../../lib/format'
import { supabase } from '../../../lib/supabase'
import type { StockItem, Supplier } from '../../../lib/types'
import { ManagementFormActions, ManagementFormPage, ManagementListPage, ManagementToolbar } from '../shared/ManagementPage'
import { clean } from '../shared/utils'
import { StockSectionNav } from './StockSectionNav'

const listPath = '/estoque/itens'
const emptyDraft = { nome: '', categoria: '', unidade: 'un', fornecedor_id: '', quantidade_atual: '0', estoque_minimo: '0', custo_unitario: '', ativo: true, observacoes: '' }

async function fetchItems(clinicId: string) {
  const { data, error } = await supabase.from('itens_estoque').select('*,fornecedores(id,nome)').eq('clinica_id', clinicId).is('arquivado_em', null).order('nome')
  if (error) throw error
  return (data || []) as StockItem[]
}

export function StockItemsPage() {
  const { activeClinicId } = useClinic()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'todos' | 'baixo' | 'ativos' | 'inativos'>('todos')
  const query = useQuery({ queryKey: ['stock-items', activeClinicId], enabled: Boolean(activeClinicId), queryFn: () => fetchItems(activeClinicId!) })
  const items = useMemo(() => query.data || [], [query.data])
  const lowCount = items.filter((item) => Number(item.quantidade_atual) <= Number(item.estoque_minimo)).length
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return items.filter((item) => {
      const low = Number(item.quantidade_atual) <= Number(item.estoque_minimo)
      const matchesFilter = filter === 'todos' || (filter === 'baixo' && low) || (filter === 'ativos' && item.ativo) || (filter === 'inativos' && !item.ativo)
      const content = `${item.nome} ${item.categoria || ''} ${item.fornecedores?.nome || ''}`.toLocaleLowerCase('pt-BR')
      return matchesFilter && (!term || content.includes(term))
    })
  }, [filter, items, search])

  return (
    <ManagementListPage eyebrow="Estoque" title="Itens de estoque" description="Acompanhe saldo, estoque mínimo e custo dos materiais da clínica." newTo={`${listPath}/novo`} newLabel="Novo item" nav={<StockSectionNav />} error={query.error as Error | null}>
      <section className="management-summary" aria-label="Resumo do estoque"><article><PackageCheck size={18} /><strong>{items.length}</strong><span>Itens cadastrados</span></article><article><PackageMinus size={18} /><strong>{lowCount}</strong><span>Estoque baixo</span></article><article><strong>{items.filter((item) => item.ativo).length}</strong><span>Itens ativos</span></article></section>
      <section className="panel management-catalog"><ManagementToolbar search={search} onSearch={setSearch} searchPlaceholder="Buscar item, categoria ou fornecedor"><select aria-label="Filtrar itens" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="todos">Todos os itens</option><option value="baixo">Estoque baixo</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option></select></ManagementToolbar>
        {query.isLoading ? <LoadingBlock /> : filtered.length ? <div className="record-list">{filtered.map((item) => { const low = Number(item.quantidade_atual) <= Number(item.estoque_minimo); return <article className="record-card" key={item.id}><div><h3>{item.nome}</h3><div className="record-meta"><span>{item.quantidade_atual} {item.unidade}</span><span>Mínimo {item.estoque_minimo}</span><span>{formatMoney(item.custo_unitario)}</span><span>{item.fornecedores?.nome || 'Sem fornecedor'}</span><span className={`badge ${low ? 'warning' : 'success'}`}>{low ? 'Baixo' : 'Ok'}</span></div>{item.observacoes ? <p>{item.observacoes}</p> : null}</div><div className="record-actions"><Link className="ghost-button" to={`${listPath}/${item.id}/editar`}><Pencil size={15} /> Editar</Link></div></article> })}</div> : <EmptyState title="Nenhum item encontrado">Ajuste os filtros ou cadastre um novo item.</EmptyState>}
      </section>
    </ManagementListPage>
  )
}

export function StockItemFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const initialized = useRef('')
  const [draft, setDraft] = useState(emptyDraft)
  const query = useQuery({
    queryKey: ['stock-item-form', activeClinicId, id || 'new'], enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const suppliers = await supabase.from('fornecedores').select('*').eq('clinica_id', activeClinicId).eq('ativo', true).is('arquivado_em', null).order('nome')
      if (suppliers.error) throw suppliers.error
      if (!id) return { suppliers: (suppliers.data || []) as Supplier[], item: null }
      const item = await supabase.from('itens_estoque').select('*').eq('id', id).eq('clinica_id', activeClinicId).is('arquivado_em', null).maybeSingle()
      if (item.error) throw item.error
      if (!item.data) throw new Error('Item de estoque não encontrado nesta clínica.')
      return { suppliers: (suppliers.data || []) as Supplier[], item: item.data as StockItem }
    },
  })
  useEffect(() => { if (!query.data) return; const key = id || 'new'; if (initialized.current === key) return; initialized.current = key; const item = query.data.item; setDraft(item ? { nome: item.nome, categoria: item.categoria || '', unidade: item.unidade, fornecedor_id: item.fornecedor_id || '', quantidade_atual: String(item.quantidade_atual), estoque_minimo: String(item.estoque_minimo), custo_unitario: String(item.custo_unitario || ''), ativo: item.ativo, observacoes: item.observacoes || '' } : emptyDraft) }, [id, query.data])
  const save = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error('Clínica ativa não encontrada.')
      const payload = { clinica_id: activeClinicId, fornecedor_id: draft.fornecedor_id || null, nome: draft.nome.trim(), categoria: clean(draft.categoria), unidade: draft.unidade || 'un', quantidade_atual: Number(draft.quantidade_atual || 0), estoque_minimo: Number(draft.estoque_minimo || 0), custo_unitario: parseCurrency(draft.custo_unitario), ativo: draft.ativo, observacoes: clean(draft.observacoes), atualizado_em: new Date().toISOString() }
      if (!payload.nome) throw new Error('Informe o nome.')
      if (id) { const { data, error } = await supabase.from('itens_estoque').update(payload).eq('id', id).eq('clinica_id', activeClinicId).select('id').maybeSingle(); if (error) throw error; if (!data) throw new Error('Item de estoque não encontrado nesta clínica.') }
      else { const { error } = await supabase.from('itens_estoque').insert(payload); if (error) throw error }
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['stock-items', activeClinicId] }); navigate(listPath) },
  })
  return (
    <ManagementFormPage eyebrow="Estoque" title={editing ? 'Editar item de estoque' : 'Novo item de estoque'} description="Defina identificação, saldo, mínimo e custo do material." backTo={listPath} nav={<StockSectionNav />} loading={query.isLoading} error={query.error as Error | null}>
      {query.data ? <form className="panel management-editor" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}>
        <fieldset><legend>Identificação</legend><label>Nome<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label><div className="form-grid"><label>Categoria<input value={draft.categoria} onChange={(event) => setDraft({ ...draft, categoria: event.target.value })} /></label><label>Unidade<input value={draft.unidade} onChange={(event) => setDraft({ ...draft, unidade: event.target.value })} /></label></div><label>Fornecedor<select value={draft.fornecedor_id} onChange={(event) => setDraft({ ...draft, fornecedor_id: event.target.value })}><option value="">Sem fornecedor</option>{query.data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nome}</option>)}</select></label></fieldset>
        <fieldset><legend>Controle do estoque</legend><div className="form-grid"><label>Quantidade atual<input type="number" min={0} step="0.01" value={draft.quantidade_atual} onChange={(event) => setDraft({ ...draft, quantidade_atual: event.target.value })} /></label><label>Estoque mínimo<input type="number" min={0} step="0.01" value={draft.estoque_minimo} onChange={(event) => setDraft({ ...draft, estoque_minimo: event.target.value })} /></label></div><label>Custo unitário<input inputMode="decimal" value={draft.custo_unitario} onChange={(event) => setDraft({ ...draft, custo_unitario: event.target.value })} /></label><label>Observações<textarea rows={4} value={draft.observacoes} onChange={(event) => setDraft({ ...draft, observacoes: event.target.value })} /></label><label className="check-row"><input type="checkbox" checked={draft.ativo} onChange={(event) => setDraft({ ...draft, ativo: event.target.checked })} /> Item ativo</label></fieldset>
        {save.error ? <div className="form-alert">{save.error.message}</div> : null}<ManagementFormActions backTo={listPath} pending={save.isPending} saveLabel={editing ? 'Salvar alterações' : 'Salvar item'} />
      </form> : null}
    </ManagementFormPage>
  )
}
