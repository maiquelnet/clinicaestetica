import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useState } from 'react'
import { useClinic } from '../../../contexts/useClinic'
import { formatMoney, parseCurrency } from '../../../lib/format'
import { supabase } from '../../../lib/supabase'
import type { StockItem, Supplier } from '../../../lib/types'
import { CrudHeader, SimpleCrudPage } from '../shared/CrudPage'
import { clean } from '../shared/utils'
export function StockItemsPage() {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<StockItem | null>(null)
  const [draft, setDraft] = useState({ nome: '', categoria: '', unidade: 'un', fornecedor_id: '', quantidade_atual: '0', estoque_minimo: '0', custo_unitario: '', ativo: true, observacoes: '' })
  const query = useQuery({
    queryKey: ['stock-items', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const [items, suppliers] = await Promise.all([
        supabase.from('itens_estoque').select('*,fornecedores(id,nome)').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('nome'),
        supabase.from('fornecedores').select('*').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('nome'),
      ])
      if (items.error) throw items.error
      if (suppliers.error) throw suppliers.error
      return { items: (items.data || []) as StockItem[], suppliers: (suppliers.data || []) as Supplier[] }
    },
  })
  const save = useMutation({
    mutationFn: async () => {
      const payload = { clinica_id: activeClinicId, fornecedor_id: draft.fornecedor_id || null, nome: draft.nome.trim(), categoria: clean(draft.categoria), unidade: draft.unidade || 'un', quantidade_atual: Number(draft.quantidade_atual || 0), estoque_minimo: Number(draft.estoque_minimo || 0), custo_unitario: parseCurrency(draft.custo_unitario), ativo: draft.ativo, observacoes: clean(draft.observacoes), atualizado_em: new Date().toISOString() }
      if (!payload.nome) throw new Error('Informe o nome.')
      const request = editing ? supabase.from('itens_estoque').update(payload).eq('id', editing.id) : supabase.from('itens_estoque').insert(payload)
      const { error } = await request
      if (error) throw error
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['stock-items', activeClinicId] }); setEditing(null); setDraft({ nome: '', categoria: '', unidade: 'un', fornecedor_id: '', quantidade_atual: '0', estoque_minimo: '0', custo_unitario: '', ativo: true, observacoes: '' }) },
  })
  function edit(item: StockItem) {
    setEditing(item)
    setDraft({ nome: item.nome, categoria: item.categoria || '', unidade: item.unidade, fornecedor_id: item.fornecedor_id || '', quantidade_atual: String(item.quantidade_atual), estoque_minimo: String(item.estoque_minimo), custo_unitario: String(item.custo_unitario || ''), ativo: item.ativo, observacoes: item.observacoes || '' })
  }
  return (
    <SimpleCrudPage
      title="Itens de estoque"
      eyebrow="Estoque"
      description="Controle saldo, estoque minimo e custo dos itens de uso da clinica."
      loading={query.isLoading}
      records={query.data?.items || []}
      renderRecord={(item: StockItem) => <article className="record-card" key={item.id}><div><h3>{item.nome}</h3><div className="record-meta"><span>{item.quantidade_atual} {item.unidade}</span><span>Minimo {item.estoque_minimo}</span><span>{formatMoney(item.custo_unitario)}</span><span className={`badge ${item.quantidade_atual <= item.estoque_minimo ? 'warning' : 'success'}`}>{item.quantidade_atual <= item.estoque_minimo ? 'Baixo' : 'Ok'}</span></div>{item.observacoes ? <p>{item.observacoes}</p> : null}</div><div className="record-actions"><button className="ghost-button" type="button" onClick={() => edit(item)}>Editar</button></div></article>}
      form={<form className="panel form-panel drawer-panel" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}><CrudHeader title={editing ? 'Editar item' : 'Novo item'} onClear={() => setEditing(null)} /><label>Nome<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label><div className="form-grid"><label>Categoria<input value={draft.categoria} onChange={(event) => setDraft({ ...draft, categoria: event.target.value })} /></label><label>Unidade<input value={draft.unidade} onChange={(event) => setDraft({ ...draft, unidade: event.target.value })} /></label></div><label>Fornecedor<select value={draft.fornecedor_id} onChange={(event) => setDraft({ ...draft, fornecedor_id: event.target.value })}><option value="">Sem fornecedor</option>{(query.data?.suppliers || []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nome}</option>)}</select></label><div className="form-grid"><label>Quantidade<input type="number" min={0} step="0.01" value={draft.quantidade_atual} onChange={(event) => setDraft({ ...draft, quantidade_atual: event.target.value })} /></label><label>Estoque minimo<input type="number" min={0} step="0.01" value={draft.estoque_minimo} onChange={(event) => setDraft({ ...draft, estoque_minimo: event.target.value })} /></label></div><label>Custo unitario<input inputMode="decimal" value={draft.custo_unitario} onChange={(event) => setDraft({ ...draft, custo_unitario: event.target.value })} /></label><label>Observacoes<textarea rows={3} value={draft.observacoes} onChange={(event) => setDraft({ ...draft, observacoes: event.target.value })} /></label><label className="check-row"><input type="checkbox" checked={draft.ativo} onChange={(event) => setDraft({ ...draft, ativo: event.target.checked })} />Item ativo</label>{save.error ? <div className="form-alert">{save.error.message}</div> : null}<button className="primary-button" type="submit"><Save size={16} /> Salvar</button></form>}
    />
  )
}
