import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { PageHeader } from '../../../components/PageHeader'
import { useClinic } from '../../../contexts/useClinic'
import { supabase } from '../../../lib/supabase'
import { clean } from '../shared/utils'
import type { UserMembershipRow } from '../shared/utils'
export function UsersPage() {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState({ perfil_id: '', nome: '', email: '', telefone: '', papel: 'administrador', ativo: true })
  const query = useQuery({
    queryKey: ['users', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const { data, error } = await supabase.from('usuarios_clinicas').select('id,clinica_id,perfil_id,papel,ativo,perfis(id,nome,email,telefone,ativo)').eq('clinica_id', activeClinicId).order('criado_em', { ascending: false })
      if (error) throw error
      return ((data || []) as UserMembershipRow[]).map((item) => ({
        ...item,
        perfis: Array.isArray(item.perfis) ? item.perfis[0] ?? null : item.perfis,
      }))
    },
  })
  const save = useMutation({
    mutationFn: async () => {
      if (!draft.perfil_id || !draft.nome || !draft.email) throw new Error('Informe UUID, nome e e-mail do usuario ja existente no Auth.')
      const profile = await supabase.from('perfis').upsert({ id: draft.perfil_id, nome: draft.nome, email: draft.email, telefone: clean(draft.telefone), ativo: draft.ativo, atualizado_em: new Date().toISOString() })
      if (profile.error) throw profile.error
      const membership = await supabase.from('usuarios_clinicas').upsert({ clinica_id: activeClinicId, perfil_id: draft.perfil_id, papel: draft.papel, ativo: draft.ativo, atualizado_em: new Date().toISOString() }, { onConflict: 'clinica_id,perfil_id' })
      if (membership.error) throw membership.error
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['users', activeClinicId] }); await queryClient.invalidateQueries({ queryKey: ['clinic-context'] }) },
  })
  return (
    <main className="content-page">
      <PageHeader eyebrow="Configuracoes" title="Usuarios" description="Gerencie perfis e vinculos de usuarios que ja existem no Supabase Auth." />
      <div className="data-workspace has-drawer">
        <section className="panel list-panel data-panel">
          <div className="panel-header compact-header"><h2>Acessos administrativos</h2><span>{query.data?.length ?? 0} usuarios</span></div>
          {query.isLoading ? <LoadingBlock /> : query.data?.length ? <div className="record-list">{query.data.map((item) => <article className="record-card" key={item.id}><div><h3>{item.perfis?.nome || item.perfil_id}</h3><div className="record-meta"><span>{item.perfis?.email}</span><span>{item.papel}</span><span className={`badge ${item.ativo ? 'success' : 'warning'}`}>{item.ativo ? 'Ativo' : 'Inativo'}</span></div></div><div className="record-actions"><button className="ghost-button" type="button" onClick={() => setDraft({ perfil_id: item.perfil_id, nome: item.perfis?.nome || '', email: item.perfis?.email || '', telefone: item.perfis?.telefone || '', papel: item.papel, ativo: item.ativo })}>Editar</button></div></article>)}</div> : <EmptyState title="Nenhum usuario vinculado" />}
        </section>
        <form className="panel form-panel drawer-panel" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}><div className="panel-header compact-header"><h2>Usuario da clinica</h2></div><label>UUID do Auth<input value={draft.perfil_id} onChange={(event) => setDraft({ ...draft, perfil_id: event.target.value })} /></label><label>Nome<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label><div className="form-grid"><label>E-mail<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label><label>Telefone<input value={draft.telefone} onChange={(event) => setDraft({ ...draft, telefone: event.target.value })} /></label></div><label>Papel<select value={draft.papel} onChange={(event) => setDraft({ ...draft, papel: event.target.value })}><option value="proprietario">Proprietario</option><option value="administrador">Administrador</option><option value="operador">Operador</option></select></label><label className="check-row"><input type="checkbox" checked={draft.ativo} onChange={(event) => setDraft({ ...draft, ativo: event.target.checked })} />Acesso ativo</label>{save.error ? <div className="form-alert">{save.error.message}</div> : null}<button className="primary-button" type="submit"><Save size={16} /> Salvar usuario</button></form>
      </div>
    </main>
  )
}
