import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useState } from 'react'
import { useClinic } from '../../../contexts/useClinic'
import { formatDate, formatMoney, parseCurrency } from '../../../lib/format'
import { supabase } from '../../../lib/supabase'
import type { Equipment, Supplier } from '../../../lib/types'
import { CrudHeader, SimpleCrudPage } from '../shared/CrudPage'
import { clean, statusBadge } from '../shared/utils'
export function EquipmentPage() {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Equipment | null>(null)
  const [draft, setDraft] = useState({ nome: '', categoria: '', sala_local: '', fornecedor_id: '', valor_compra: '', data_compra: '', status: 'ativo', observacoes: '' })
  const query = useQuery({
    queryKey: ['equipment', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const [equipment, suppliers] = await Promise.all([
        supabase.from('equipamentos').select('*,fornecedores(id,nome)').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('nome'),
        supabase.from('fornecedores').select('*').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('nome'),
      ])
      if (equipment.error) throw equipment.error
      if (suppliers.error) throw suppliers.error
      return { equipment: (equipment.data || []) as Equipment[], suppliers: (suppliers.data || []) as Supplier[] }
    },
  })
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        clinica_id: activeClinicId,
        fornecedor_id: draft.fornecedor_id || null,
        nome: draft.nome.trim(),
        categoria: clean(draft.categoria),
        sala_local: clean(draft.sala_local),
        valor_compra: parseCurrency(draft.valor_compra),
        data_compra: draft.data_compra || null,
        status: draft.status,
        observacoes: clean(draft.observacoes),
        atualizado_em: new Date().toISOString(),
      }
      if (!payload.nome) throw new Error('Informe o nome.')
      const request = editing ? supabase.from('equipamentos').update(payload).eq('id', editing.id) : supabase.from('equipamentos').insert(payload)
      const { error } = await request
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['equipment', activeClinicId] })
      setEditing(null)
      setDraft({ nome: '', categoria: '', sala_local: '', fornecedor_id: '', valor_compra: '', data_compra: '', status: 'ativo', observacoes: '' })
    },
  })
  function edit(item: Equipment) {
    setEditing(item)
    setDraft({ nome: item.nome, categoria: item.categoria || '', sala_local: item.sala_local || '', fornecedor_id: item.fornecedor_id || '', valor_compra: String(item.valor_compra || ''), data_compra: item.data_compra || '', status: item.status, observacoes: item.observacoes || '' })
  }
  return (
    <SimpleCrudPage
      title="Salas e equipamentos"
      eyebrow="Cadastros"
      description="Controle equipamentos, sala de uso, valor e data de compra."
      loading={query.isLoading}
      records={query.data?.equipment || []}
      renderRecord={(item: Equipment) => (
        <article className="record-card" key={item.id}>
          <div><h3>{item.nome}</h3><div className="record-meta"><span>{item.sala_local || 'Sem sala'}</span><span>{formatMoney(item.valor_compra)}</span><span>{item.data_compra ? formatDate(item.data_compra) : 'Sem data'}</span><span className={`badge ${statusBadge(item.status)}`}>{item.status}</span></div>{item.observacoes ? <p>{item.observacoes}</p> : null}</div>
          <div className="record-actions"><button className="ghost-button" type="button" onClick={() => edit(item)}>Editar</button></div>
        </article>
      )}
      form={(
        <form className="panel form-panel drawer-panel" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}>
          <CrudHeader title={editing ? 'Editar equipamento' : 'Novo equipamento'} onClear={() => setEditing(null)} />
          <label>Nome<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label>
          <div className="form-grid"><label>Categoria<input value={draft.categoria} onChange={(event) => setDraft({ ...draft, categoria: event.target.value })} /></label><label>Sala/local<input value={draft.sala_local} onChange={(event) => setDraft({ ...draft, sala_local: event.target.value })} /></label></div>
          <label>Fornecedor<select value={draft.fornecedor_id} onChange={(event) => setDraft({ ...draft, fornecedor_id: event.target.value })}><option value="">Sem fornecedor</option>{(query.data?.suppliers || []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nome}</option>)}</select></label>
          <div className="form-grid"><label>Valor de compra<input inputMode="decimal" value={draft.valor_compra} onChange={(event) => setDraft({ ...draft, valor_compra: event.target.value })} /></label><label>Data de compra<input type="date" value={draft.data_compra} onChange={(event) => setDraft({ ...draft, data_compra: event.target.value })} /></label></div>
          <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="ativo">Ativo</option><option value="manutencao">Manutencao</option><option value="inativo">Inativo</option></select></label>
          <label>Observacoes<textarea rows={3} value={draft.observacoes} onChange={(event) => setDraft({ ...draft, observacoes: event.target.value })} /></label>
          {save.error ? <div className="form-alert">{save.error.message}</div> : null}
          <button className="primary-button" type="submit"><Save size={16} /> Salvar</button>
        </form>
      )}
    />
  )
}
