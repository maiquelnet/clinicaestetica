import { ClipboardList, PlusCircle } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export function TreatmentSectionNav() {
  return (
    <nav className="treatment-section-nav" aria-label="Seções dos planos de tratamento">
      <NavLink to="/planos-tratamento" end>
        <ClipboardList size={18} />
        <span>Planos cadastrados</span>
      </NavLink>
      <NavLink to="/planos-tratamento/novo">
        <PlusCircle size={18} />
        <span>Novo tratamento</span>
      </NavLink>
    </nav>
  )
}
