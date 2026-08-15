import { useQuery } from '@tanstack/react-query'
import {
  Bell,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardPlus,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Settings,
  Settings2,
  Sparkles,
  Star,
  Target,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { useClinic } from '../contexts/useClinic'
import { buildAlerts, messagingQueryOptions } from '../lib/messaging'

type NavigationChild = { to: string; label: string }
type NavigationItem = { to: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; children?: NavigationChild[] }
type NavigationGroup = { label: string; items: NavigationItem[] }

const navGroups: NavigationGroup[] = [
  { label: 'Visão geral', items: [{ to: '/dashboard', label: 'Início', icon: LayoutDashboard }] },
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
      { to: '/financeiro/fluxo-caixa', label: 'Financeiro', icon: CircleDollarSign, children: [{ to: '/financeiro/contas-a-receber', label: 'Contas a receber' }, { to: '/financeiro/contas-a-pagar', label: 'Contas a pagar' }] },
      { to: '/estoque/itens', label: 'Estoque', icon: Package, children: [{ to: '/estoque/fornecedores', label: 'Fornecedores' }] },
      { to: '/equipamentos', label: 'Equipamentos', icon: Settings2 },
      { to: '/mensagens', label: 'Mensagens', icon: MessageCircle, children: [{ to: '/mensagens/modelos', label: 'Modelos e automações' }] },
    ],
  },
  {
    label: 'Relacionamento',
    items: [
      { to: '/marketing/campanhas', label: 'Campanhas', icon: Target, children: [{ to: '/marketing/disparos', label: 'Disparos' }] },
      { to: '/marketing/satisfacao', label: 'Satisfação', icon: Star },
    ],
  },
  {
    label: 'Configurações',
    items: [{ to: '/configuracoes/parametros', label: 'Parâmetros', icon: Settings, children: [{ to: '/configuracoes/usuarios', label: 'Usuários e acessos' }] }],
  },
]

const mobileNav = [
  { to: '/agenda', match: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/clientes', match: '/clientes', label: 'Clientes', icon: Users },
  { to: '/financeiro/fluxo-caixa', match: '/financeiro', label: 'Financeiro', icon: CreditCard },
  { to: '/mensagens', match: '/mensagens', label: 'Mensagens', icon: MessageCircle },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth()
  const { activeClinic, memberships, activeClinicId, setActiveClinicId, profile } = useClinic()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreDialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const displayName = profile?.nome?.split(' ')[0] || 'Thais'
  const messagingQuery = useQuery(messagingQueryOptions(activeClinicId))
  const pendingMessageCount = useMemo(() => (messagingQuery.data ? buildAlerts(messagingQuery.data).length : 0), [messagingQuery.data])
  const notificationLabel = pendingMessageCount ? `${pendingMessageCount} ${pendingMessageCount === 1 ? 'mensagem pendente' : 'mensagens pendentes'}` : 'Abrir controle de mensagens'
  const moreIsActive = !mobileNav.some((item) => location.pathname.startsWith(item.match))

  useEffect(() => {
    if (!moreOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMoreOpen(false)
        window.requestAnimationFrame(() => moreButtonRef.current?.focus())
        return
      }
      if (event.key !== 'Tab' || !moreDialogRef.current) return
      const focusable = [...moreDialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled])')]
      if (!focusable.length) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleKeyDown) }
  }, [moreOpen])

  function closeMore(restoreFocus = true) {
    setMoreOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => moreButtonRef.current?.focus())
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink className="brand-lockup" to="/dashboard"><span className="brand-mark">TS</span><span className="brand-copy"><strong>Thais Schneider</strong><small>Estética & bem-estar</small></span></NavLink>
        <div className="clinic-switcher"><span>Espaço de trabalho</span>{memberships.length > 1 ? <label><select value={activeClinicId ?? ''} onChange={(event) => setActiveClinicId(event.target.value)}>{memberships.map((membership) => <option key={membership.clinica_id} value={membership.clinica_id}>{membership.clinica.nome_publico || membership.clinica.nome}</option>)}</select><ChevronDown size={14} /></label> : <strong>{activeClinic?.nome_publico || activeClinic?.nome}</strong>}</div>
        <nav className="sidebar-nav" aria-label="Navegação administrativa">{navGroups.map((group) => <section className="nav-section" key={group.label}><span className="nav-section-label">{group.label}</span>{group.items.map((item) => <div className="sidebar-nav-tree" key={`${group.label}-${item.label}`}><NavLink to={item.to} end={item.to === '/dashboard'}><item.icon size={18} strokeWidth={1.7} />{item.label}</NavLink>{item.children?.length ? <div className="sidebar-subnav">{item.children.map((child) => <NavLink key={child.to} to={child.to}>{child.label}</NavLink>)}</div> : null}</div>)}</section>)}</nav>
        <button className="logout-button" type="button" onClick={() => void signOut()}><LogOut size={17} /><span>Sair da conta</span></button>
      </aside>

      <div className="main-shell">
        <header className="topbar"><NavLink className="mobile-brand" to="/dashboard"><span className="brand-mark">TS</span></NavLink><div className="topbar-welcome"><span>Olá, {displayName}</span><strong>{activeClinic?.nome_publico || activeClinic?.nome}</strong></div><div className="topbar-actions"><NavLink className="icon-button notification-button" to="/mensagens" aria-label={notificationLabel}><Bell size={18} />{pendingMessageCount > 0 ? <span aria-hidden="true" /> : null}</NavLink><span className="profile-avatar" aria-label={profile?.nome || user?.email || 'Perfil'}>{(profile?.nome || user?.email || 'TS').slice(0, 2).toUpperCase()}</span></div></header>
        {children}
      </div>

      <nav className="bottom-nav" aria-label="Navegação principal">{mobileNav.map((item) => <Link className={location.pathname.startsWith(item.match) ? 'active' : ''} key={item.to} to={item.to}><item.icon size={21} strokeWidth={1.8} /><span>{item.label}</span></Link>)}<button ref={moreButtonRef} className={moreOpen || moreIsActive ? 'active' : ''} type="button" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}><Menu size={21} strokeWidth={1.8} /><span>Mais</span></button></nav>

      {moreOpen ? <div className="sheet-layer mobile-more-layer"><button className="sheet-overlay" type="button" aria-label="Fechar menu" onClick={() => closeMore()} /><section className="bottom-sheet mobile-more-sheet" ref={moreDialogRef} role="dialog" aria-modal="true" aria-labelledby="mobile-more-title"><div className="sheet-handle" /><header><div><p className="eyebrow">Navegação</p><h2 id="mobile-more-title">Todos os menus</h2></div><button className="icon-button" ref={closeButtonRef} type="button" aria-label="Fechar menu" onClick={() => closeMore()}><X size={20} /></button></header><div className="mobile-workspace"><span>Espaço de trabalho</span>{memberships.length > 1 ? <select value={activeClinicId ?? ''} onChange={(event) => setActiveClinicId(event.target.value)}>{memberships.map((membership) => <option key={membership.clinica_id} value={membership.clinica_id}>{membership.clinica.nome_publico || membership.clinica.nome}</option>)}</select> : <strong>{activeClinic?.nome_publico || activeClinic?.nome}</strong>}</div><nav className="mobile-menu-groups" aria-label="Todos os módulos">{navGroups.map((group) => <section key={group.label}><h3>{group.label}</h3><div>{group.items.map((item) => <div className="mobile-menu-tree" key={item.to}><NavLink to={item.to} end={item.to === '/dashboard'} onClick={() => closeMore(false)}><item.icon size={19} strokeWidth={1.7} /><span>{item.label}</span></NavLink>{item.children?.map((child) => <NavLink className="mobile-submenu-link" key={child.to} to={child.to} onClick={() => closeMore(false)}>{child.label}</NavLink>)}</div>)}</div></section>)}</nav><button className="logout-button mobile-logout" type="button" onClick={() => { closeMore(false); void signOut() }}><LogOut size={17} /><span>Sair da conta</span></button></section></div> : null}
    </div>
  )
}
