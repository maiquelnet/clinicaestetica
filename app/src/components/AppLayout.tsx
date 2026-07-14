import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardPlus,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Package,
  Settings,
  Settings2,
  Sparkles,
  Star,
  Target,
  Users,
  Bell,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { useClinic } from '../contexts/useClinic'
import { buildAlerts, messagingQueryOptions } from '../lib/messaging'

const navGroups = [
  {
    label: 'Visão geral',
    items: [{ to: '/dashboard', label: 'Início', icon: LayoutDashboard }],
  },
  {
    label: 'Atendimento',
    items: [
      { to: '/agenda', label: 'Agenda', icon: CalendarDays },
      { to: '/agenda/fila-espera', label: 'Encaixes', icon: ClipboardPlus },
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/servicos', label: 'Serviços', icon: Sparkles },
      { to: '/planos-tratamento', label: 'Tratamentos', icon: FileText },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/financeiro/fluxo-caixa', label: 'Financeiro', icon: CircleDollarSign },
      { to: '/estoque/itens', label: 'Estoque', icon: Package },
      { to: '/equipamentos', label: 'Equipamentos', icon: Settings2 },
      { to: '/mensagens', label: 'Mensagens', icon: MessageCircle },
    ],
  },
  {
    label: 'Relacionamento',
    items: [
      { to: '/marketing/campanhas', label: 'Campanhas', icon: Target },
      { to: '/marketing/satisfacao', label: 'Satisfação', icon: Star },
      { to: '/configuracoes/parametros', label: 'Configurações', icon: Settings },
    ],
  },
]

const mobileNav = [
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/financeiro/fluxo-caixa', label: 'Financeiro', icon: CreditCard },
  { to: '/mensagens', label: 'Mensagens', icon: MessageCircle },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth()
  const { activeClinic, memberships, activeClinicId, setActiveClinicId, profile } = useClinic()
  const displayName = profile?.nome?.split(' ')[0] || 'Thais'
  const messagingQuery = useQuery(messagingQueryOptions(activeClinicId))
  const pendingMessageCount = useMemo(
    () => (messagingQuery.data ? buildAlerts(messagingQuery.data).length : 0),
    [messagingQuery.data],
  )
  const notificationLabel = pendingMessageCount
    ? `${pendingMessageCount} ${pendingMessageCount === 1 ? 'mensagem pendente' : 'mensagens pendentes'}`
    : 'Abrir controle de mensagens'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink className="brand-lockup" to="/dashboard">
          <span className="brand-mark">TS</span>
          <span className="brand-copy">
            <strong>Thais Schneider</strong>
            <small>Estética & bem-estar</small>
          </span>
        </NavLink>

        <div className="clinic-switcher">
          <span>Espaço de trabalho</span>
          {memberships.length > 1 ? (
            <label>
              <select value={activeClinicId ?? ''} onChange={(event) => setActiveClinicId(event.target.value)}>
                {memberships.map((membership) => (
                  <option key={membership.clinica_id} value={membership.clinica_id}>
                    {membership.clinica.nome_publico || membership.clinica.nome}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          ) : (
            <strong>{activeClinic?.nome_publico || activeClinic?.nome}</strong>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Navegação administrativa">
          {navGroups.map((group) => (
            <section className="nav-section" key={group.label}>
              <span className="nav-section-label">{group.label}</span>
              {group.items.map((item) => (
                  <NavLink key={`${group.label}-${item.label}`} to={item.to} end={item.to === '/dashboard'}>
                  <item.icon size={18} strokeWidth={1.7} />
                  {item.label}
                </NavLink>
              ))}
            </section>
          ))}
        </nav>

        <button className="logout-button" type="button" onClick={() => void signOut()}>
          <LogOut size={17} />
          <span>Sair da conta</span>
        </button>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <NavLink className="mobile-brand" to="/dashboard">
            <span className="brand-mark">TS</span>
          </NavLink>
          <div className="topbar-welcome">
            <span>Olá, {displayName}</span>
            <strong>{activeClinic?.nome_publico || activeClinic?.nome}</strong>
          </div>
          <div className="topbar-actions">
            <NavLink className="icon-button notification-button" to="/mensagens" aria-label={notificationLabel}>
              <Bell size={18} />
              {pendingMessageCount > 0 ? <span aria-hidden="true" /> : null}
            </NavLink>
            <span className="profile-avatar" aria-label={profile?.nome || user?.email || 'Perfil'}>
              {(profile?.nome || user?.email || 'TS').slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        {children}
      </div>

      <nav className="bottom-nav" aria-label="Navegação principal">
        {mobileNav.map((item) => (
          <NavLink key={item.to} to={item.to}>
            <item.icon size={21} strokeWidth={1.8} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
