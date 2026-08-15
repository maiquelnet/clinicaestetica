import { ChevronLeft, Plus, Save, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { PageHeader } from '../../../components/PageHeader'
import { LoadingBlock } from '../../../components/Ui'

export type ManagementNavItem = {
  to: string
  label: string
}

export function ManagementSectionNav({ label, items }: { label: string; items: ManagementNavItem[] }) {
  return (
    <nav className="management-section-nav" aria-label={label}>
      {items.map((item) => <NavLink key={item.to} to={item.to}>{item.label}</NavLink>)}
    </nav>
  )
}

export function ManagementListPage({
  eyebrow,
  title,
  description,
  newTo,
  newLabel,
  nav,
  error,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  newTo: string
  newLabel: string
  nav?: ReactNode
  error?: Error | null
  children: ReactNode
}) {
  return (
    <main className="content-page management-page management-list-page">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={<Link className="primary-button" to={newTo}><Plus size={17} /> {newLabel}</Link>}
      />
      {nav}
      {error ? <div className="form-alert">{error.message}</div> : null}
      {children}
    </main>
  )
}

export function ManagementFormPage({
  eyebrow,
  title,
  description,
  backTo,
  nav,
  loading,
  error,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  backTo: string
  nav?: ReactNode
  loading?: boolean
  error?: Error | null
  children: ReactNode
}) {
  return (
    <main className="content-page management-page management-form-page">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={<Link className="ghost-button" to={backTo}><ChevronLeft size={17} /> Voltar à lista</Link>}
      />
      {nav}
      {error ? <div className="form-alert">{error.message}</div> : null}
      {loading ? <LoadingBlock /> : children}
    </main>
  )
}

export function ManagementToolbar({
  search,
  onSearch,
  searchPlaceholder,
  children,
}: {
  search: string
  onSearch: (value: string) => void
  searchPlaceholder: string
  children?: ReactNode
}) {
  return (
    <div className="management-toolbar">
      <label className="search-field">
        <Search size={17} />
        <span className="sr-only">Pesquisar</span>
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={searchPlaceholder} />
      </label>
      {children}
    </div>
  )
}

export function ManagementFormActions({
  backTo,
  pending,
  saveLabel,
}: {
  backTo: string
  pending: boolean
  saveLabel: string
}) {
  return (
    <div className="management-form-actions">
      <Link className="ghost-button" to={backTo}>Cancelar</Link>
      <button className="primary-button" type="submit" disabled={pending}>
        <Save size={17} /> {pending ? 'Salvando...' : saveLabel}
      </button>
    </div>
  )
}
