import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { useClinic } from '../../../contexts/useClinic'
import { supabase } from '../../../lib/supabase'
import type { Supplier } from '../../../lib/types'
import { ManagementFormActions, ManagementFormPage, ManagementListPage, ManagementToolbar } from '../shared/ManagementPage'
import { clean } from '../shared/utils'
import { StockSectionNav } from './StockSectionNav'

const listPath = '/estoque/fornecedores'
const emptyDraft = { nome: '', documento: '', telefone: '', email: '', contato: '', observacoes: '', ativo: true }

async function fetchSuppliers(clinicId: string) {
  const { data, error } = await supabase.from('fornecedores').select('*').eq('clinica_id', clinicId).is('arquivado_em', null).order('nome')
  if (error) throw error
  return (data || []) as Supplier[]
}

export function SuppliersPage() {
  const { activeClinicId } = useClinic()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const query = useQuery({ queryKey: ['suppliers', activeClinicId], enabled: Boolean(activeClinicId), queryFn: () => fetchSuppliers(activeClinicId!) })
  const suppliers = useMemo(() => query.data || [], [query.data])
  const filtered = useMemo(() => { const term = search.trim().toLocaleLowerCase('pt-BR'); return suppliers.filter((item) => { const matchesStatus = status === 'todos' || (status === 'ativos' ? item.ativo : !item.ativo); const content = `${item.nome} ${item.contato || ''} ${item.documento || ''} ${item.email || ''}`.toLocaleLowerCase('pt-BR'); return matchesStatus && (!term || content.includes(term)) }) }, [search, status, suppliers])
  return (
    <ManagementListPage eyebrow="Estoque" title="Fornecedores" description="Mantenha os contatos usados em estoque, equipamentos e compras." newTo={`${listPath}/novo`} newLabel="Novo fornecedor" nav={<StockSectionNav />} error={query.error as Error | null}>
      <section className="management-summary"><article><strong>{suppliers.length}</strong><span>Cadastrados</span></article><article><strong>{suppliers.filter((item) => item.ativo).length}</strong><span>Ativos</span></article></section>
      <section className="panel management-catalog"><ManagementToolbar search={search} onSearch={setSearch} searchPlaceholder="Buscar fornecedor ou contato"><select aria-label="Filtrar fornecedores" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="todos">Todos</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option></select></ManagementToolbar>
        {query.isLoading ? <LoadingBlock /> : filtered.length ? <div className="record-list">{filtered.map((item) => <article className="record-card" key={item.id}><div><h3>{item.nome}</h3><div className="record-meta"><span>{item.contato || 'Sem contato'}</span><span>{item.telefone || 'Sem telefone'}</span><span>{item.email || 'Sem e-mail'}</span><span className={`badge ${item.ativo ? 'success' : 'warning'}`}>{item.ativo ? 'Ativo' : 'Inativo'}</span></div>{item.observacoes ? <p>{item.observacoes}</p> : null}</div><div className="record-actions"><Link className="ghost-button" to={`${listPath}/${item.id}/editar`}><Pencil size={15} /> Editar</Link></div></article>)}</div> : <EmptyState title="Nenhum fornecedor encontrado">Ajuste os filtros ou cadastre um fornecedor.</EmptyState>}
      </section>
    </ManagementListPage>
  )
}

export function SupplierFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const initialized = useRef('')
  const [draft, setDraft] = useState(emptyDraft)
  const query = useQuery({ queryKey: ['supplier-form', activeClinicId, id || 'new'], enabled: Boolean(activeClinicId), queryFn: async () => { if (!id) return null; const { data, error } = await supabase.from('fornecedores').select('*').eq('id', id).eq('clinica_id', activeClinicId).is('arquivado_em', null).maybeSingle(); if (error) throw error; if (!data) throw new Error('Fornecedor não encontrado nesta clínica.'); return data as Supplier } })
  useEffect(() => { if (query.isLoading) return; const key = id || 'new'; if (initialized.current === key) return; initialized.current = key; const item = query.data; setDraft(item ? { nome: item.nome, documento: item.documento || '', telefone: item.telefone || '', email: item.email || '', contato: item.contato || '', observacoes: item.observacoes || '', ativo: item.ativo } : emptyDraft) }, [id, query.data, query.isLoading])
  const save = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error('Clínica ativa não encontrada.')
      const payload = { clinica_id: activeClinicId, nome: draft.nome.trim(), documento: clean(draft.documento), telefone: clean(draft.telefone), email: clean(draft.email), contato: clean(draft.contato), observacoes: clean(draft.observacoes), ativo: draft.ativo, atualizado_em: new Date().toISOString() }
      if (!payload.nome) throw new Error('Informe o nome.')
      if (id) { const { data, error } = await supabase.from('fornecedores').update(payload).eq('id', id).eq('clinica_id', activeClinicId).select('id').maybeSingle(); if (error) throw error; if (!data) throw new Error('Fornecedor não encontrado nesta clínica.') }
      else { const { error } = await supabase.from('fornecedores').insert(payload); if (error) throw error }
    },
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['suppliers', activeClinicId] }), queryClient.invalidateQueries({ queryKey: ['stock-items', activeClinicId] }), queryClient.invalidateQueries({ queryKey: ['equipment', activeClinicId] })]); navigate(listPath) },
  })
  return (
    <ManagementFormPage eyebrow="Estoque" title={editing ? 'Editar fornecedor' : 'Novo fornecedor'} description="Cadastre os dados comerciais e o contato principal." backTo={listPath} nav={<StockSectionNav />} loading={query.isLoading} error={query.error as Error | null}>
      {!editing || query.data ? <form className="panel management-editor" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}><fieldset><legend>Identificação</legend><label>Nome<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label><div className="form-grid"><label>Documento<input value={draft.documento} onChange={(event) => setDraft({ ...draft, documento: event.target.value })} /></label><label>Contato principal<input value={draft.contato} onChange={(event) => setDraft({ ...draft, contato: event.target.value })} /></label></div></fieldset><fieldset><legend>Contato</legend><div className="form-grid"><label>Telefone<input value={draft.telefone} onChange={(event) => setDraft({ ...draft, telefone: event.target.value })} /></label><label>E-mail<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label></div><label>Observações<textarea rows={4} value={draft.observacoes} onChange={(event) => setDraft({ ...draft, observacoes: event.target.value })} /></label><label className="check-row"><input type="checkbox" checked={draft.ativo} onChange={(event) => setDraft({ ...draft, ativo: event.target.checked })} /> Fornecedor ativo</label></fieldset>{save.error ? <div className="form-alert">{save.error.message}</div> : null}<ManagementFormActions backTo={listPath} pending={save.isPending} saveLabel={editing ? 'Salvar alterações' : 'Salvar fornecedor'} /></form> : null}
    </ManagementFormPage>
  )
}
