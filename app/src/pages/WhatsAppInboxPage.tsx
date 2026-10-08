import { useQuery } from '@tanstack/react-query'
import { MessageCircle, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MessageSectionNav } from '../components/MessageSectionNav'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, LoadingBlock } from '../components/Ui'
import { useClinic } from '../contexts/useClinic'
import { formatDateTime } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { WhatsAppConversation, WhatsAppMessage } from '../lib/types'

export function WhatsAppInboxPage() {
  const { activeClinicId } = useClinic()
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)

  const conversationsQuery = useQuery({
    queryKey: ['whatsapp-conversations', activeClinicId],
    enabled: Boolean(activeClinicId),
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_conversas')
        .select('*,clientes(id,nome,telefone)')
        .eq('clinica_id', activeClinicId!)
        .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data || []) as unknown as WhatsAppConversation[]
    },
  })

  const selectedId = selectedConversationId || conversationsQuery.data?.[0]?.id || null
  const selectedConversation = conversationsQuery.data?.find((conversation) => conversation.id === selectedId) || null

  const messagesQuery = useQuery({
    queryKey: ['whatsapp-conversation-messages', activeClinicId, selectedId],
    enabled: Boolean(activeClinicId && selectedId),
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_mensagens')
        .select('*')
        .eq('clinica_id', activeClinicId!)
        .eq('conversa_id', selectedId!)
        .order('evento_em', { ascending: true })
      if (error) throw error
      return (data || []) as unknown as WhatsAppMessage[]
    },
  })

  const conversationName = useMemo(() => {
    if (!selectedConversation) return ''
    return selectedConversation.clientes?.nome || selectedConversation.nome_contato || selectedConversation.telefone
  }, [selectedConversation])

  return (
    <main className="content-page message-control-page">
      <PageHeader eyebrow="WhatsApp" title="Conversas recebidas" description="Mensagens que chegaram pelo número oficial da clínica." />
      <MessageSectionNav />
      {conversationsQuery.error ? <div className="form-alert">{conversationsQuery.error.message}</div> : null}
      {conversationsQuery.isLoading ? <LoadingBlock /> : (
        <section className="panel whatsapp-inbox-panel">
          <div className="panel-header">
            <div><h2>Caixa de entrada</h2><p>Atualização automática a cada 10 segundos.</p></div>
            <button className="ghost-button" type="button" onClick={() => void conversationsQuery.refetch()}><RefreshCw size={16} /> Atualizar</button>
          </div>
          {!conversationsQuery.data?.length ? <EmptyState title="Nenhuma conversa recebida">Quando alguém enviar uma mensagem para o WhatsApp da clínica, ela aparecerá aqui.</EmptyState> : (
            <div className="whatsapp-inbox-grid">
              <div className="whatsapp-conversation-list" aria-label="Conversas">
                {conversationsQuery.data.map((conversation) => {
                  const name = conversation.clientes?.nome || conversation.nome_contato || conversation.telefone
                  return (
                    <button className={`whatsapp-conversation-item ${conversation.id === selectedId ? 'active' : ''}`} type="button" key={conversation.id} onClick={() => setSelectedConversationId(conversation.id)}>
                      <span className="conversation-avatar"><MessageCircle size={17} /></span>
                      <span className="conversation-summary"><strong>{name}</strong><small>{conversation.ultima_mensagem_preview || 'Mensagem recebida'}</small></span>
                      <small>{conversation.ultima_mensagem_em ? formatDateTime(conversation.ultima_mensagem_em) : ''}</small>
                    </button>
                  )
                })}
              </div>
              <div className="whatsapp-conversation-detail">
                {selectedConversation ? <>
                  <header className="conversation-detail-header"><div><h3>{conversationName}</h3><p>{selectedConversation.telefone} · Janela até {selectedConversation.janela_atendimento_ate ? formatDateTime(selectedConversation.janela_atendimento_ate) : 'não identificada'}</p></div><span className="badge success">{selectedConversation.status}</span></header>
                  {messagesQuery.error ? <div className="form-alert">{messagesQuery.error.message}</div> : null}
                  {messagesQuery.isLoading ? <LoadingBlock /> : <div className="conversation-message-list">{messagesQuery.data?.map((message) => <article className={`conversation-message ${message.direcao}`} key={message.id}><span>{message.texto || `[${message.tipo}]`}</span><small>{formatDateTime(message.evento_em)}</small></article>)}</div>}
                </> : <EmptyState title="Selecione uma conversa">Escolha uma conversa para visualizar as mensagens.</EmptyState>}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
