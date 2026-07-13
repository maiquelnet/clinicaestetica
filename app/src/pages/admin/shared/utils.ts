import { toInputDate } from '../../../lib/format'
import type { Profile } from '../../../lib/types'

export type Option = { id: string; nome: string; telefone?: string | null }
export type FinanceMode = 'cashflow' | 'receivable' | 'payable'
export type UserMembershipRow = { id: string; perfil_id: string; papel: string; ativo: boolean; perfis: Profile | Profile[] | null }

export const todayInput = toInputDate()

export function clean(value: string | null | undefined) {
  const text = value?.trim()
  return text || null
}

export function buildWhatsAppUrl(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`
}

export function statusBadge(status: string) {
  if (['pago', 'enviado', 'ativo', 'confirmado', 'concluido', 'concluida'].includes(status)) return 'success'
  if (['cancelado', 'cancelada', 'falha', 'inativo'].includes(status)) return 'cancelado'
  return 'warning'
}