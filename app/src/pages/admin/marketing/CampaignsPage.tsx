import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, PackagePlus, Users } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../../contexts/useAuth'
import { useClinic } from '../../../contexts/useClinic'
import { saveCampaignWithRecipients } from '../../../lib/rpc'
import { supabase } from '../../../lib/supabase'
import type { Campaign, MessageTemplate, Service } from '../../../lib/types'
import { CrudHeader, SimpleCrudPage } from '../shared/CrudPage'
import { statusBadge } from '../shared/utils'

type CampaignDraft = {
  titulo: string
  modelo_mensagem_id: string
  mensagem: string
  publico: string
  status: string
  servicos_alvo: string[]
}

const emptyDraft: CampaignDraft = {
  titulo: '',
  modelo_mensagem_id: '',
  mensagem: '',
  publico: 'todos',
  status: 'rascunho',
  servicos_alvo: [],
}

const audienceLabels: Record<string, string> = {
  todos: 'Todos os clientes',
  marketing: 'Aceitam marketing',
  parceiras: 'Parceiras',
  interesses: 'Interesse em serviços',
}

export function CampaignsPage() {
  const { activeClinicId } = useClinic()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [draft, setDraft] = useState<CampaignDraft>(emptyDraft)

  const query = useQuery({
    queryKey: ['campaigns', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const [campaigns, templates, services] = await Promise.all([
        supabase
          .from('campanhas')
          .select('*,modelos_mensagens(id,nome,tipo),destinatarios_campanhas(*),campanhas_servicos_alvo(*,servicos(id,nome,categoria,ativo,arquivado_em))')
          .eq('clinica_id', activeClinicId)
          .is('arquivado_em', null)
          .order('criado_em', { ascending: false }),
        supabase
          .from('modelos_mensagens')
          .select('*')
          .eq('clinica_id', activeClinicId)
          .is('arquivado_em', null)
          .order('nome'),
        supabase
          .from('servicos')
          .select('*')
          .eq('clinica_id', activeClinicId)
          .eq('ativo', true)
          .is('arquivado_em', null)
          .order('nome'),
      ])
      if (campaigns.error) throw campaigns.error
      if (templates.error) throw templates.error
      if (services.error) throw services.error
      return {
        campaigns: (campaigns.data || []) as Campaign[],
        templates: (templates.data || []) as MessageTemplate[],
        services: (services.data || []) as Service[],
      }
    },
  })

  const previewQuery = useQuery({
    queryKey: ['campaign-audience-preview', activeClinicId, draft.publico, draft.servicos_alvo],
    enabled: Boolean(activeClinicId) && (draft.publico !== 'interesses' || draft.servicos_alvo.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('prever_publico_campanha', {
        p_clinica_id: activeClinicId!,
        p_publico: draft.publico,
        p_servicos_alvo: draft.publico === 'interesses' ? draft.servicos_alvo : [],
      })
      if (error) throw error
      return Number(data || 0)
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const template = query.data?.templates.find((item) => item.id === draft.modelo_mensagem_id)
      const titulo = draft.titulo.trim()
      const mensagem = draft.mensagem.trim() || template?.texto || ''
      if (!activeClinicId) throw new Error('Clínica ativa não encontrada.')
      if (!titulo || !mensagem) throw new Error('Informe titulo e mensagem.')
      if (draft.publico === 'interesses' && draft.servicos_alvo.length === 0) {
        throw new Error('Selecione pelo menos um serviço de interesse.')
      }
      await saveCampaignWithRecipients({
        p_campanha_id: editing?.id ?? null,
        p_clinica_id: activeClinicId,
        p_modelo_mensagem_id: draft.modelo_mensagem_id || null,
        p_titulo: titulo,
        p_mensagem: mensagem,
        p_publico: draft.publico,
        p_status: draft.status,
        p_criado_por: user?.id ?? null,
        p_servicos_alvo: draft.publico === 'interesses' ? draft.servicos_alvo : [],
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['campaigns', activeClinicId] })
      await queryClient.invalidateQueries({ queryKey: ['dispatches', activeClinicId] })
      clearDraft()
    },
  })

  function clearDraft() {
    setEditing(null)
    setDraft(emptyDraft)
  }

  function edit(campaign: Campaign) {
    setEditing(campaign)
    setDraft({
      titulo: campaign.titulo,
      modelo_mensagem_id: campaign.modelo_mensagem_id || '',
      mensagem: campaign.mensagem,
      publico: campaign.publico,
      status: campaign.status,
      servicos_alvo: campaign.campanhas_servicos_alvo?.map((target) => target.servico_id) || [],
    })
  }

  function toggleService(serviceId: string) {
    setDraft((current) => ({
      ...current,
      servicos_alvo: current.servicos_alvo.includes(serviceId)
        ? current.servicos_alvo.filter((id) => id !== serviceId)
        : [...current.servicos_alvo, serviceId],
    }))
  }

  return (
    <SimpleCrudPage
      title="Campanhas"
      eyebrow="Marketing"
      description="Crie campanhas segmentadas e gere a fila para disparo manual pelo WhatsApp."
      loading={query.isLoading}
      records={query.data?.campaigns || []}
      renderRecord={(campaign: Campaign) => (
        <article className="record-card" key={campaign.id}>
          <div>
            <h3>{campaign.titulo}</h3>
            <div className="record-meta">
              <span>{audienceLabels[campaign.publico] || campaign.publico}</span>
              <span>{campaign.destinatarios_campanhas?.length || 0} destinatarios</span>
              <span className={`badge ${statusBadge(campaign.status)}`}>{campaign.status}</span>
            </div>
            {campaign.campanhas_servicos_alvo?.length ? (
              <div className="interest-badges campaign-targets">
                {campaign.campanhas_servicos_alvo.map((target) => (
                  <span className="badge" key={target.servico_id}>
                    {target.servicos?.nome || 'Serviço arquivado'}
                  </span>
                ))}
              </div>
            ) : null}
            <p>{campaign.mensagem}</p>
          </div>
          <div className="record-actions">
            <button className="ghost-button" type="button" onClick={() => edit(campaign)}>Editar</button>
          </div>
        </article>
      )}
      form={(
        <form
          className="panel form-panel drawer-panel"
          onSubmit={(event) => {
            event.preventDefault()
            void save.mutateAsync()
          }}
        >
          <CrudHeader title={editing ? 'Editar campanha' : 'Nova campanha'} onClear={clearDraft} />
          <label>
            Título
            <input value={draft.titulo} onChange={(event) => setDraft({ ...draft, titulo: event.target.value })} />
          </label>
          <label>
            Modelo
            <select
              value={draft.modelo_mensagem_id}
              onChange={(event) => {
                const template = query.data?.templates.find((item) => item.id === event.target.value)
                setDraft({ ...draft, modelo_mensagem_id: event.target.value, mensagem: template?.texto || draft.mensagem })
              }}
            >
              <option value="">Sem modelo</option>
              {(query.data?.templates || []).map((template) => (
                <option key={template.id} value={template.id}>{template.nome}</option>
              ))}
            </select>
          </label>
          <label>
            Público
            <select
              value={draft.publico}
              onChange={(event) => setDraft({
                ...draft,
                publico: event.target.value,
                servicos_alvo: event.target.value === 'interesses' ? draft.servicos_alvo : [],
              })}
            >
              <option value="todos">Todos os clientes</option>
              <option value="marketing">Aceitam marketing</option>
              <option value="parceiras">Parceiras</option>
              <option value="interesses">Interesse em serviços</option>
            </select>
          </label>
          {draft.publico === 'interesses' ? (
            <>
              <fieldset className="interest-fieldset">
                <legend>Serviços da campanha</legend>
                <p className="field-help">A cliente entra no público se tiver interesse em qualquer serviço selecionado.</p>
                <div className="interest-options">
                  {(query.data?.services || []).map((service) => (
                    <label className="check-row interest-option" key={service.id}>
                      <input
                        type="checkbox"
                        checked={draft.servicos_alvo.includes(service.id)}
                        onChange={() => toggleService(service.id)}
                      />
                      <span>{service.nome}{service.categoria ? <small>{service.categoria}</small> : null}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="form-alert warning-alert" role="note">
                <AlertTriangle size={18} />
                Este público inclui todas as clientes interessadas, inclusive quem não aceitou comunicações de marketing.
              </div>
            </>
          ) : null}
          <div className="audience-preview" aria-live="polite">
            <Users size={18} />
            <span>
              {previewQuery.isFetching
                ? 'Calculando público...'
                : `${draft.publico === 'interesses' && draft.servicos_alvo.length === 0 ? 0 : previewQuery.data || 0} destinatarios estimados`}
            </span>
          </div>
          <label>
            Mensagem
            <textarea rows={5} value={draft.mensagem} onChange={(event) => setDraft({ ...draft, mensagem: event.target.value })} />
          </label>
          <label>
            Status
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
              <option value="rascunho">Rascunho</option>
              <option value="ativa">Ativa</option>
              <option value="pausada">Pausada</option>
              <option value="concluida">Concluida</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </label>
          {save.error ? <div className="form-alert">{save.error.message}</div> : null}
          {previewQuery.error ? <div className="form-alert">Não foi possível calcular a audiência.</div> : null}
          <button className="primary-button" type="submit" disabled={save.isPending}>
            <PackagePlus size={16} />
            {save.isPending ? 'Salvando...' : 'Salvar e gerar destinatarios'}
          </button>
        </form>
      )}
    />
  )
}
