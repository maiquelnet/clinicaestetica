import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Service } from './types'

export function formatMoney(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return format(parseISO(value), 'dd/MM/yyyy', { locale: ptBR })
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  return format(parseISO(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export function formatTime(value: string | null | undefined) {
  if (!value) return '--:--'
  return format(parseISO(value), 'HH:mm', { locale: ptBR })
}

export function toInputDateTime(value: Date) {
  const offset = value.getTimezoneOffset()
  const local = new Date(value.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

export function toInputDate(value = new Date()) {
  const offset = value.getTimezoneOffset()
  const local = new Date(value.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 10)
}

export function parseCurrency(value: string | number | null | undefined) {
  if (typeof value === 'number') return value
  const normalized = String(value || '0')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
  return Number(normalized || 0)
}

export function currentPrice(service: Service | null | undefined) {
  const prices = service?.precos_servicos || []
  const active = prices
    .filter((price) => !price.fim_validade)
    .sort((a, b) => b.inicio_validade.localeCompare(a.inicio_validade))[0]
  return active?.valor ?? 0
}
