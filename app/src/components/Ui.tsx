import type { ReactNode } from 'react'

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  )
}

export function LoadingBlock({ label = 'Carregando' }: { label?: string }) {
  return <div className="loading-block">{label}...</div>
}

export function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null
  return <span className="field-error">{message}</span>
}
