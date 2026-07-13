import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Send } from 'lucide-react'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { PageHeader } from '../../../components/PageHeader'
import { useClinic } from '../../../contexts/useClinic'
import { supabase } from '../../../lib/supabase'
import type { CampaignRecipient } from '../../../lib/types'
import { buildWhatsAppUrl, statusBadge } from '../shared/utils'
export function DispatchesPage() {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['dispatches', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('destinatarios_campanhas')
        .select('*,clientes(id,nome,telefone),campanhas(id,titulo,mensagem)')
        .eq('clinica_id', activeClinicId)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return (data || []) as CampaignRecipient[]
    },
  })
  const updateStatus = useMutation({
    mutationFn: async ({ recipient, status }: { recipient: CampaignRecipient; status: 'enviado' | 'falha' | 'cancelado' }) => {
      const sentAt = status === 'enviado' ? new Date().toISOString() : null
      const update = await supabase.from('destinatarios_campanhas').update({ status, enviado_em: sentAt, atualizado_em: new Date().toISOString() }).eq('id', recipient.id)
      if (update.error) throw update.error
      if (status === 'enviado' && recipient.clientes) {
        const log = await supabase.from('logs_mensagens').insert({ clinica_id: activeClinicId, cliente_id: recipient.cliente_id, campanha_id: recipient.campanha_id, canal: 'whatsapp_manual', texto: recipient.texto || recipient.campanhas?.mensagem || '', ciclo: `campanha:${recipient.campanha_id}:${recipient.cliente_id}`, status: 'enviado', enviado_em: sentAt, observacao: 'Disparo manual de campanha' })
        if (log.error) throw log.error
      }
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['dispatches', activeClinicId] }); await queryClient.invalidateQueries({ queryKey: ['messages', activeClinicId] }) },
  })
  function send(recipient: CampaignRecipient) {
    if (!recipient.clientes?.telefone) return
    window.open(buildWhatsAppUrl(recipient.clientes.telefone, recipient.texto || recipient.campanhas?.mensagem || ''), '_blank', 'noopener,noreferrer')
  }
  return (
    <main className="content-page">
      <PageHeader eyebrow="Marketing" title="Gerenciar Disparos" description="Abra o WhatsApp, acompanhe status e registre envios de campanhas." />
      <section className="panel list-panel">
        <div className="panel-header compact-header"><h2>Fila de disparos</h2><span>{query.data?.filter((item) => item.status === 'pendente').length ?? 0} pendentes</span></div>
        {query.isLoading ? <LoadingBlock /> : query.data?.length ? <div className="record-list">{query.data.map((recipient) => <article className="record-card" key={recipient.id}><div><h3>{recipient.clientes?.nome}</h3><div className="record-meta"><span>{recipient.campanhas?.titulo}</span><span>{recipient.clientes?.telefone}</span><span className={`badge ${statusBadge(recipient.status)}`}>{recipient.status}</span></div><p>{recipient.texto}</p></div><div className="record-actions"><button className="primary-button" type="button" onClick={() => send(recipient)}><Send size={16} /> WhatsApp</button><button className="ghost-button" type="button" onClick={() => void updateStatus.mutateAsync({ recipient, status: 'enviado' })}><Check size={16} /> Enviado</button><button className="danger-button" type="button" onClick={() => void updateStatus.mutateAsync({ recipient, status: 'falha' })}>Falha</button></div></article>)}</div> : <EmptyState title="Nenhum disparo gerado" />}
      </section>
    </main>
  )
}
