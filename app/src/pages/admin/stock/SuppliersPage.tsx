import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useState } from 'react'
import { useClinic } from '../../../contexts/useClinic'
import { supabase } from '../../../lib/supabase'
import type { Supplier } from '../../../lib/types'
import { CrudHeader, SimpleCrudPage } from '../shared/CrudPage'
import { clean } from '../shared/utils'
export function SuppliersPage() {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [draft, setDraft] = useState({ nome: '', documento: '', telefone: '', email: '', contato: '', observacoes: '', ativo: true })
  const query = useQuery({
    queryKey: ['suppliers', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const { data, error } = await supabase.from('fornecedores').select('*').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('nome')
      if (error) throw error
      return (data || []) as Supplier[]
    },
  })
  const save = useMutation({
    mutationFn: async () => {
      const payload = { clinica_id: activeClinicId, nome: draft.nome.trim(), documento: clean(draft.documento), telefone: clean(draft.telefone), email: clean(draft.email), contato: clean(draft.contato), observacoes: clean(draft.observacoes), ativo: draft.ativo, atualizado_em: new Date().toISOString() }
      if (!payload.nome) throw new Error('Informe o nome.')
      const request = editing ? supabase.from('fornecedores').update(payload).eq('id', editing.id) : supabase.from('fornecedores').insert(payload)
      const { error } = await request
      if (error) throw error
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['suppliers', activeClinicId] }); setEditing(null); setDraft({ nome: '', documento: '', telefone: '', email: '', contato: '', observacoes: '', ativo: true }) },
  })
  function edit(item: Supplier) {
    setEditing(item)
    setDraft({ nome: item.nome, documento: item.documento || '', telefone: item.telefone || '', email: item.email || '', contato: item.contato || '', observacoes: item.observacoes || '', ativo: item.ativo })
  }
  return (
    <SimpleCrudPage
      title="Fornecedores"
      eyebrow="Estoque"
      description="Base de fornecedores para estoque, equipamentos e compras."
      loading={query.isLoading}
      records={query.data || []}
      renderRecord={(item: Supplier) => <article className="record-card" key={item.id}><div><h3>{item.nome}</h3><div className="record-meta"><span>{item.telefone || '-'}</span><span>{item.email || '-'}</span><span className={`badge ${item.ativo ? 'success' : 'warning'}`}>{item.ativo ? 'Ativo' : 'Inativo'}</span></div>{item.observacoes ? <p>{item.observacoes}</p> : null}</div><div className="record-actions"><button className="ghost-button" type="button" onClick={() => edit(item)}>Editar</button></div></article>}
      form={<form className="panel form-panel drawer-panel" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}><CrudHeader title={editing ? 'Editar fornecedor' : 'Novo fornecedor'} onClear={() => setEditing(null)} /><label>Nome<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label><div className="form-grid"><label>Documento<input value={draft.documento} onChange={(event) => setDraft({ ...draft, documento: event.target.value })} /></label><label>Contato<input value={draft.contato} onChange={(event) => setDraft({ ...draft, contato: event.target.value })} /></label></div><div className="form-grid"><label>Telefone<input value={draft.telefone} onChange={(event) => setDraft({ ...draft, telefone: event.target.value })} /></label><label>E-mail<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label></div><label>Observacoes<textarea rows={3} value={draft.observacoes} onChange={(event) => setDraft({ ...draft, observacoes: event.target.value })} /></label><label className="check-row"><input type="checkbox" checked={draft.ativo} onChange={(event) => setDraft({ ...draft, ativo: event.target.checked })} />Fornecedor ativo</label>{save.error ? <div className="form-alert">{save.error.message}</div> : null}<button className="primary-button" type="submit"><Save size={16} /> Salvar</button></form>}
    />
  )
}
