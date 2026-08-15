import { ListChecks, MessagesSquare } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export function MessageSectionNav({ pendingCount = 0 }: { pendingCount?: number }) {
  return (
    <nav className="message-section-nav" aria-label="Seções de mensagens">
      <NavLink to="/mensagens" end>
        <MessagesSquare size={18} />
        <span>Controle de envios</span>
        {pendingCount > 0 ? <strong aria-label={`${pendingCount} pendentes`}>{pendingCount}</strong> : null}
      </NavLink>
      <NavLink to="/mensagens/modelos">
        <ListChecks size={18} />
        <span>Modelos e automações</span>
      </NavLink>
    </nav>
  )
}
