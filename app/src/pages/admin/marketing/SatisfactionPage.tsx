import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Save, Star } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { PageHeader } from '../../../components/PageHeader'
import { useClinic } from '../../../contexts/useClinic'
import { formatDate } from '../../../lib/format'
import { supabase } from '../../../lib/supabase'
import type { ClientReview } from '../../../lib/types'
import { clean, todayInput } from '../shared/utils'
import type { Option } from '../shared/utils'
export function SatisfactionPage() {
  const { activeClinicId, activeClinic } = useClinic()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState({ cliente_id: '', origem: 'manual', nota: '5', comentario: '', link_externo: '', avaliado_em: todayInput })
  const query = useQuery({
    queryKey: ['satisfaction', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const [clients, reviews] = await Promise.all([
        supabase.from('clientes').select('id,nome,telefone').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('nome'),
        supabase.from('avaliacoes_clientes').select('*,clientes(id,nome,telefone)').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('avaliado_em', { ascending: false }),
      ])
      if (clients.error) throw clients.error
      if (reviews.error) throw reviews.error
      return { clients: (clients.data || []) as Option[], reviews: (reviews.data || []) as ClientReview[] }
    },
  })
  const save = useMutation({
    mutationFn: async () => {
      const payload = { clinica_id: activeClinicId, cliente_id: draft.cliente_id || null, origem: draft.origem, nota: Number(draft.nota), comentario: clean(draft.comentario), link_externo: clean(draft.link_externo), avaliado_em: draft.avaliado_em || todayInput, atualizado_em: new Date().toISOString() }
      const { error } = await supabase.from('avaliacoes_clientes').insert(payload)
      if (error) throw error
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['satisfaction', activeClinicId] }); setDraft({ cliente_id: '', origem: 'manual', nota: '5', comentario: '', link_externo: '', avaliado_em: todayInput }) },
  })
  const avg = query.data?.reviews.length ? query.data.reviews.reduce((sum, review) => sum + review.nota, 0) / query.data.reviews.length : 0
  return (
    <main className="content-page">
      <PageHeader eyebrow="Marketing" title="Satisfacao do Cliente" description="Registre avaliacoes e mantenha o link do Google visivel para a equipe." actions={activeClinic?.link_google_avaliacao ? <a className="primary-button compact-action" href={activeClinic.link_google_avaliacao} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Google</a> : null} />
      <section className="ops-metrics"><article><Star size={17} /><span>Media</span><strong>{avg.toFixed(1)}</strong></article><article><Star size={17} /><span>Avaliacoes</span><strong>{query.data?.reviews.length ?? 0}</strong></article></section>
      <div className="data-workspace has-drawer">
        <section className="panel list-panel data-panel">{query.isLoading ? <LoadingBlock /> : query.data?.reviews.length ? <div className="record-list">{query.data.reviews.map((review) => <article className="record-card" key={review.id}><div><h3>{review.nota} estrelas</h3><div className="record-meta"><span>{review.clientes?.nome || 'Sem cliente'}</span><span>{review.origem}</span><span>{formatDate(review.avaliado_em)}</span></div>{review.comentario ? <p>{review.comentario}</p> : null}</div></article>)}</div> : <EmptyState title="Nenhuma avaliacao registrada" />}</section>
        <form className="panel form-panel drawer-panel" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}><div className="panel-header compact-header"><h2>Nova avaliacao</h2></div><label>Cliente<select value={draft.cliente_id} onChange={(event) => setDraft({ ...draft, cliente_id: event.target.value })}><option value="">Sem cliente</option>{(query.data?.clients || []).map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></label><div className="form-grid"><label>Origem<select value={draft.origem} onChange={(event) => setDraft({ ...draft, origem: event.target.value })}><option value="manual">Manual</option><option value="google">Google</option></select></label><label>Nota<input type="number" min={1} max={5} value={draft.nota} onChange={(event) => setDraft({ ...draft, nota: event.target.value })} /></label></div><label>Data<input type="date" value={draft.avaliado_em} onChange={(event) => setDraft({ ...draft, avaliado_em: event.target.value })} /></label><label>Link externo<input value={draft.link_externo} onChange={(event) => setDraft({ ...draft, link_externo: event.target.value })} /></label><label>Comentario<textarea rows={3} value={draft.comentario} onChange={(event) => setDraft({ ...draft, comentario: event.target.value })} /></label>{save.error ? <div className="form-alert">{save.error.message}</div> : null}<button className="primary-button" type="submit"><Save size={16} /> Salvar</button></form>
      </div>
    </main>
  )
}
