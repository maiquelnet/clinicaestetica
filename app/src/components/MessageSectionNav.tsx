import { Inbox, ListChecks, MessagesSquare } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export function MessageSectionNav({ pendingCount = 0 }: { pendingCount?: number }) {
  return (
    <nav className="message-section-nav" aria-label="Seções da secretária">
      <NavLink to="/mensagens" end>
        <MessagesSquare size={18} />
        <span>Atividade da secretária</span>
        {pendingCount > 0 ? <strong aria-label={`${pendingCount} pendentes`}>{pendingCount}</strong> : null}
      </NavLink>
      <NavLink to="/mensagens/modelos">
        <ListChecks size={18} />
        <span>Modelos de mensagens</span>
      </NavLink>
      <NavLink to="/mensagens/whatsapp">
        <Inbox size={18} />
        <span>Conversas WhatsApp</span>
      </NavLink>
    </nav>
  )
}
