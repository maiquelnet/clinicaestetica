import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Settings2, Wrench } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { useClinic } from '../../../contexts/useClinic'
import { formatDate, formatMoney, parseCurrency } from '../../../lib/format'
import { supabase } from '../../../lib/supabase'
import type { Equipment, Supplier } from '../../../lib/types'
import { ManagementFormActions, ManagementFormPage, ManagementListPage, ManagementToolbar } from '../shared/ManagementPage'
import { clean, statusBadge } from '../shared/utils'

const listPath = '/equipamentos'
const emptyDraft = { nome: '', categoria: '', sala_local: '', fornecedor_id: '', valor_compra: '', data_compra: '', status: 'ativo', observacoes: '' }

async function fetchEquipment(clinicId: string) {
  const { data, error } = await supabase.from('equipamentos').select('*,fornecedores(id,nome)').eq('clinica_id', clinicId).is('arquivado_em', null).order('nome')
  if (error) throw error
  return (data || []) as Equipment[]
}

export function EquipmentPage() {
  const { activeClinicId } = useClinic()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'todos' | 'ativo' | 'manutencao' | 'inativo'>('todos')
  const query = useQuery({ queryKey: ['equipment', activeClinicId], enabled: Boolean(activeClinicId), queryFn: () => fetchEquipment(activeClinicId!) })
  const equipment = useMemo(() => query.data || [], [query.data])
  const filtered = useMemo(() => { const term = search.trim().toLocaleLowerCase('pt-BR'); return equipment.filter((item) => { const matchesStatus = status === 'todos' || item.status === status; const content = `${item.nome} ${item.categoria || ''} ${item.sala_local || ''} ${item.fornecedores?.nome || ''}`.toLocaleLowerCase('pt-BR'); return matchesStatus && (!term || content.includes(term)) }) }, [equipment, search, status])
  return (
    <ManagementListPage eyebrow="Cadastros" title="Salas e equipamentos" description="Controle localização, compra e situação dos equipamentos da clínica." newTo={`${listPath}/novo`} newLabel="Novo equipamento" error={query.error as Error | null}>
      <section className="management-summary"><article><Settings2 size={18} /><strong>{equipment.length}</strong><span>Cadastrados</span></article><article><strong>{equipment.filter((item) => item.status === 'ativo').length}</strong><span>Ativos</span></article><article><Wrench size={18} /><strong>{equipment.filter((item) => item.status === 'manutencao').length}</strong><span>Em manutenção</span></article></section>
      <section className="panel management-catalog"><ManagementToolbar search={search} onSearch={setSearch} searchPlaceholder="Buscar equipamento, sala ou fornecedor"><select aria-label="Filtrar equipamentos" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="todos">Todas as situações</option><option value="ativo">Ativos</option><option value="manutencao">Em manutenção</option><option value="inativo">Inativos</option></select></ManagementToolbar>
        {query.isLoading ? <LoadingBlock /> : filtered.length ? <div className="record-list">{filtered.map((item) => <article className="record-card" key={item.id}><div><h3>{item.nome}</h3><div className="record-meta"><span>{item.categoria || 'Sem categoria'}</span><span>{item.sala_local || 'Sem sala'}</span><span>{item.fornecedores?.nome || 'Sem fornecedor'}</span><span>{formatMoney(item.valor_compra)}</span><span>{item.data_compra ? formatDate(item.data_compra) : 'Sem data de compra'}</span><span className={`badge ${statusBadge(item.status)}`}>{item.status === 'manutencao' ? 'Manutenção' : item.status}</span></div>{item.observacoes ? <p>{item.observacoes}</p> : null}</div><div className="record-actions"><Link className="ghost-button" to={`${listPath}/${item.id}/editar`}><Pencil size={15} /> Editar</Link></div></article>)}</div> : <EmptyState title="Nenhum equipamento encontrado">Ajuste os filtros ou cadastre um equipamento.</EmptyState>}
      </section>
    </ManagementListPage>
  )
}

export function EquipmentFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const initialized = useRef('')
  const [draft, setDraft] = useState(emptyDraft)
  const query = useQuery({ queryKey: ['equipment-form', activeClinicId, id || 'new'], enabled: Boolean(activeClinicId), queryFn: async () => { const suppliers = await supabase.from('fornecedores').select('*').eq('clinica_id', activeClinicId).eq('ativo', true).is('arquivado_em', null).order('nome'); if (suppliers.error) throw suppliers.error; if (!id) return { suppliers: (suppliers.data || []) as Supplier[], equipment: null }; const equipment = await supabase.from('equipamentos').select('*').eq('id', id).eq('clinica_id', activeClinicId).is('arquivado_em', null).maybeSingle(); if (equipment.error) throw equipment.error; if (!equipment.data) throw new Error('Equipamento não encontrado nesta clínica.'); return { suppliers: (suppliers.data || []) as Supplier[], equipment: equipment.data as Equipment } } })
  useEffect(() => { if (!query.data) return; const key = id || 'new'; if (initialized.current === key) return; initialized.current = key; const item = query.data.equipment; setDraft(item ? { nome: item.nome, categoria: item.categoria || '', sala_local: item.sala_local || '', fornecedor_id: item.fornecedor_id || '', valor_compra: String(item.valor_compra || ''), data_compra: item.data_compra || '', status: item.status, observacoes: item.observacoes || '' } : emptyDraft) }, [id, query.data])
  const save = useMutation({ mutationFn: async () => { if (!activeClinicId) throw new Error('Clínica ativa não encontrada.'); const payload = { clinica_id: activeClinicId, fornecedor_id: draft.fornecedor_id || null, nome: draft.nome.trim(), categoria: clean(draft.categoria), sala_local: clean(draft.sala_local), valor_compra: parseCurrency(draft.valor_compra), data_compra: draft.data_compra || null, status: draft.status, observacoes: clean(draft.observacoes), atualizado_em: new Date().toISOString() }; if (!payload.nome) throw new Error('Informe o nome.'); if (id) { const { data, error } = await supabase.from('equipamentos').update(payload).eq('id', id).eq('clinica_id', activeClinicId).select('id').maybeSingle(); if (error) throw error; if (!data) throw new Error('Equipamento não encontrado nesta clínica.') } else { const { error } = await supabase.from('equipamentos').insert(payload); if (error) throw error } }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['equipment', activeClinicId] }); navigate(listPath) } })
  return (
    <ManagementFormPage eyebrow="Cadastros" title={editing ? 'Editar equipamento' : 'Novo equipamento'} description="Registre os dados de identificação, localização e aquisição." backTo={listPath} loading={query.isLoading} error={query.error as Error | null}>
      {query.data ? <form className="panel management-editor" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}><fieldset><legend>Identificação</legend><label>Nome<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label><div className="form-grid"><label>Categoria<input value={draft.categoria} onChange={(event) => setDraft({ ...draft, categoria: event.target.value })} /></label><label>Sala ou local<input value={draft.sala_local} onChange={(event) => setDraft({ ...draft, sala_local: event.target.value })} /></label></div><label>Fornecedor<select value={draft.fornecedor_id} onChange={(event) => setDraft({ ...draft, fornecedor_id: event.target.value })}><option value="">Sem fornecedor</option>{query.data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nome}</option>)}</select></label></fieldset><fieldset><legend>Aquisição e situação</legend><div className="form-grid"><label>Valor de compra<input inputMode="decimal" value={draft.valor_compra} onChange={(event) => setDraft({ ...draft, valor_compra: event.target.value })} /></label><label>Data de compra<input type="date" value={draft.data_compra} onChange={(event) => setDraft({ ...draft, data_compra: event.target.value })} /></label></div><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="ativo">Ativo</option><option value="manutencao">Manutenção</option><option value="inativo">Inativo</option></select></label><label>Observações<textarea rows={4} value={draft.observacoes} onChange={(event) => setDraft({ ...draft, observacoes: event.target.value })} /></label></fieldset>{save.error ? <div className="form-alert">{save.error.message}</div> : null}<ManagementFormActions backTo={listPath} pending={save.isPending} saveLabel={editing ? 'Salvar alterações' : 'Salvar equipamento'} /></form> : null}
    </ManagementFormPage>
  )
}
