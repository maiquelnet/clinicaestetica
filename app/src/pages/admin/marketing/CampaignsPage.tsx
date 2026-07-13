import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackagePlus } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../../contexts/useAuth'
import { useClinic } from '../../../contexts/useClinic'
import { saveCampaignWithRecipients } from '../../../lib/rpc'
import { supabase } from '../../../lib/supabase'
import type { Campaign, Client, MessageTemplate } from '../../../lib/types'
import { CrudHeader, SimpleCrudPage } from '../shared/CrudPage'
import { statusBadge } from '../shared/utils'
export function CampaignsPage() {
  const { activeClinicId } = useClinic()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [draft, setDraft] = useState({ titulo: '', modelo_mensagem_id: '', mensagem: '', publico: 'todos', status: 'rascunho' })
  const query = useQuery({
    queryKey: ['campaigns', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const [campaigns, templates, clients] = await Promise.all([
        supabase.from('campanhas').select('*,modelos_mensagens(id,nome,tipo),destinatarios_campanhas(*)').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('criado_em', { ascending: false }),
        supabase.from('modelos_mensagens').select('*').eq('clinica_id', activeClinicId).is('arquivado_em', null).order('nome'),
        supabase.from('clientes').select('*').eq('clinica_id', activeClinicId).eq('ativo', true).is('arquivado_em', null).order('nome'),
      ])
      if (campaigns.error) throw campaigns.error
      if (templates.error) throw templates.error
      if (clients.error) throw clients.error
      return { campaigns: (campaigns.data || []) as Campaign[], templates: (templates.data || []) as MessageTemplate[], clients: (clients.data || []) as Client[] }
    },
  })
  const save = useMutation({
    mutationFn: async () => {
      const template = query.data?.templates.find((item) => item.id === draft.modelo_mensagem_id)
      const titulo = draft.titulo.trim()
      const mensagem = draft.mensagem.trim() || template?.texto || ''
      if (!activeClinicId) throw new Error('Clinica ativa nao encontrada.')
      if (!titulo || !mensagem) throw new Error('Informe titulo e mensagem.')
      await saveCampaignWithRecipients({
        p_campanha_id: editing?.id ?? null,
        p_clinica_id: activeClinicId,
        p_modelo_mensagem_id: draft.modelo_mensagem_id || null,
        p_titulo: titulo,
        p_mensagem: mensagem,
        p_publico: draft.publico,
        p_status: draft.status,
        p_criado_por: user?.id ?? null,
      })
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['campaigns', activeClinicId] }); await queryClient.invalidateQueries({ queryKey: ['dispatches', activeClinicId] }); setEditing(null) },
  })
  function edit(campaign: Campaign) {
    setEditing(campaign)
    setDraft({ titulo: campaign.titulo, modelo_mensagem_id: campaign.modelo_mensagem_id || '', mensagem: campaign.mensagem, publico: campaign.publico, status: campaign.status })
  }
  return (
    <SimpleCrudPage
      title="Campanhas"
      eyebrow="Marketing"
      description="Use modelos de mensagens com publico-alvo e gere destinatarios para disparo manual."
      loading={query.isLoading}
      records={query.data?.campaigns || []}
      renderRecord={(campaign: Campaign) => <article className="record-card" key={campaign.id}><div><h3>{campaign.titulo}</h3><div className="record-meta"><span>{campaign.publico}</span><span>{campaign.destinatarios_campanhas?.length || 0} destinatarios</span><span className={`badge ${statusBadge(campaign.status)}`}>{campaign.status}</span></div><p>{campaign.mensagem}</p></div><div className="record-actions"><button className="ghost-button" type="button" onClick={() => edit(campaign)}>Editar</button></div></article>}
      form={<form className="panel form-panel drawer-panel" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}><CrudHeader title={editing ? 'Editar campanha' : 'Nova campanha'} onClear={() => setEditing(null)} /><label>Titulo<input value={draft.titulo} onChange={(event) => setDraft({ ...draft, titulo: event.target.value })} /></label><label>Modelo<select value={draft.modelo_mensagem_id} onChange={(event) => { const template = query.data?.templates.find((item) => item.id === event.target.value); setDraft({ ...draft, modelo_mensagem_id: event.target.value, mensagem: template?.texto || draft.mensagem }) }}><option value="">Sem modelo</option>{(query.data?.templates || []).map((template) => <option key={template.id} value={template.id}>{template.nome}</option>)}</select></label><label>Publico<select value={draft.publico} onChange={(event) => setDraft({ ...draft, publico: event.target.value })}><option value="todos">Todos os clientes</option><option value="marketing">Aceitam marketing</option><option value="parceiras">Parceiras</option></select></label><label>Mensagem<textarea rows={5} value={draft.mensagem} onChange={(event) => setDraft({ ...draft, mensagem: event.target.value })} /></label><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="rascunho">Rascunho</option><option value="ativa">Ativa</option><option value="pausada">Pausada</option><option value="concluida">Concluida</option><option value="cancelada">Cancelada</option></select></label>{save.error ? <div className="form-alert">{save.error.message}</div> : null}<button className="primary-button" type="submit"><PackagePlus size={16} /> Salvar e gerar destinatarios</button></form>}
    />
  )
}
