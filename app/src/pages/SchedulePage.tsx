import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDays,
  endOfDay,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripHorizontal,
  MessageCircle,
  MoreHorizontal,
  NotebookPen,
  Play,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { EmptyState, FieldError, LoadingBlock } from '../components/Ui'
import { ScheduleActionSheet } from '../components/ScheduleActionSheet'
import { ScheduleBlockForm } from '../components/ScheduleBlockForm'
import { useClinic } from '../contexts/useClinic'
import { currentPrice, formatMoney, formatTime, parseCurrency, toInputDate, toInputDateTime } from '../lib/format'
import { saveAppointment as saveAppointmentRpc } from '../lib/rpc'
import { requestGoogleCalendarSync } from '../lib/google-calendar'
import { BLOCK_TYPE_LABELS, buildBlockOccurrences, type ScheduleBlockDraft } from '../lib/schedule-blocks'
import { supabase } from '../lib/supabase'
import type { Appointment, AppointmentStatus, Client, ScheduleBlock, Service, WaitlistEntry } from '../lib/types'

const statusOptions: AppointmentStatus[] = ['agendado', 'confirmado', 'em_atendimento', 'concluido', 'cancelado']
const hours = Array.from({ length: 13 }, (_, index) => index + 8)
const weekDays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const viewOptions = [
  { value: 'three_days', label: '3 dias' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
] as const

const appointmentSchema = z.object({
  cliente_id: z.string().min(1, 'Selecione a cliente.'),
  servico_id: z.string().min(1, 'Selecione o serviço.'),
  inicio_em: z.string().min(1, 'Informe o início.'),
  fim_em: z.string().optional(),
  valor_aplicado: z.string().optional(),
  status: z.enum(statusOptions),
  observacoes: z.string().optional(),
})

type AppointmentForm = z.infer<typeof appointmentSchema>
type ScheduleData = {
  clients: Client[]
  services: Service[]
  appointments: Appointment[]
  waitlist: WaitlistEntry[]
  blocks: ScheduleBlock[]
}
type CalendarView = (typeof viewOptions)[number]['value']

const defaultValues: AppointmentForm = {
  cliente_id: '',
  servico_id: '',
  inicio_em: toInputDateTime(new Date()),
  fim_em: '',
  valor_aplicado: '',
  status: 'agendado',
  observacoes: '',
}

type BlockScope = 'single' | 'following' | 'series'
type BlockSaveOperation = { kind: 'save'; block: ScheduleBlock | null; draft: ScheduleBlockDraft; scope: BlockScope }
type BlockDeleteOperation = { kind: 'delete'; block: ScheduleBlock; scope: BlockScope }
type BlockOperation = BlockSaveOperation | BlockDeleteOperation
type BlockConflict = { id: string; inicio_em: string; fim_em: string; clientes?: { nome: string } | null }

async function fetchSchedule(clinicId: string, fromDate: string, toDate: string): Promise<ScheduleData> {
  const from = startOfDay(new Date(`${fromDate}T00:00:00`)).toISOString()
  const to = endOfDay(new Date(`${toDate}T00:00:00`)).toISOString()
  const [clients, services, appointments, waitlist, blocks] = await Promise.all([
    supabase.from('clientes').select('*').eq('clinica_id', clinicId).eq('ativo', true).is('arquivado_em', null).order('nome'),
    supabase.from('servicos').select('*,precos_servicos(*)').eq('clinica_id', clinicId).eq('ativo', true).is('arquivado_em', null).order('nome'),
    supabase
      .from('agendamentos')
      .select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos),itens_plano_tratamento(id,numero_sessao,situacao,planos_tratamento(id,nome,total_sessoes))')
      .eq('clinica_id', clinicId)
      .gte('inicio_em', from)
      .lte('inicio_em', to)
      .is('arquivado_em', null)
      .order('inicio_em'),
    supabase
      .from('lista_espera')
      .select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos)')
      .eq('clinica_id', clinicId)
      .eq('status', 'em_espera')
      .is('arquivado_em', null)
      .order('prioridade'),
    supabase.from('bloqueios_agenda').select('id,clinica_id,profissional_id,titulo,motivo,tipo,inicio_em,fim_em,dia_inteiro,serie_id,recorrencia,ocorrencia_numero,criado_em,atualizado_em,google_event_id,origem,google_atualizado_em')
      .eq('clinica_id', clinicId).lt('inicio_em', to).gt('fim_em', from).order('inicio_em'),
  ])
  if (clients.error) throw clients.error
  if (services.error) throw services.error
  if (appointments.error) throw appointments.error
  if (waitlist.error) throw waitlist.error
  if (blocks.error) throw blocks.error
  return {
    clients: (clients.data || []) as Client[],
    services: (services.data || []) as Service[],
    appointments: (appointments.data || []) as Appointment[],
    waitlist: (waitlist.data || []) as WaitlistEntry[],
    blocks: (blocks.data || []) as ScheduleBlock[],
  }
}

function whatsappUrl(appointment: Appointment) {
  const phone = appointment.clientes?.telefone?.replace(/\D/g, '') || ''
  const normalized = phone.startsWith('55') ? phone : `55${phone}`
  const message = `Olá, ${appointment.clientes?.nome}! Confirmamos seu horário para ${formatTime(appointment.inicio_em)}. ✨`
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

function treatmentLabel(appointment: Appointment) {
  const item = appointment.itens_plano_tratamento?.[0]
  const plan = item?.planos_tratamento
  return item && plan ? `Tratamento · Atendimento ${item.numero_sessao}/${plan.total_sessoes}` : null
}
export function SchedulePage() {
  const { activeClinicId, activeMembership } = useClinic()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [selectedDate, setSelectedDate] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('data') || '') ? searchParams.get('data')! : toInputDate())
  const [calendarView, setCalendarView] = useState<CalendarView>('three_days')
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [preview, setPreview] = useState<Appointment | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [waitlistOpen, setWaitlistOpen] = useState(false)
  const [durationNotice, setDurationNotice] = useState<number | null>(null)
  const [actionSheetOpen, setActionSheetOpen] = useState(false)
  const [blockFormOpen, setBlockFormOpen] = useState(false)
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null)
  const [blockSaving, setBlockSaving] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [scopePrompt, setScopePrompt] = useState<{ block: ScheduleBlock; kind: 'save' | 'delete'; draft?: ScheduleBlockDraft } | null>(null)
  const [blockOperation, setBlockOperation] = useState<BlockOperation | null>(null)
  const [blockConflicts, setBlockConflicts] = useState<BlockConflict[] | null>(null)
  const dragStart = useRef<{ y: number; end: Date; appointment: Appointment } | null>(null)

  const form = useForm<AppointmentForm>({ resolver: zodResolver(appointmentSchema), defaultValues })
  const selectedDay = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate])
  const selectedRange = useMemo(() => {
    if (calendarView === 'month') {
      const from = startOfWeek(startOfMonth(selectedDay))
      return {
        from,
        to: addDays(from, 41),
      }
    }
    if (calendarView === 'week') {
      const from = startOfWeek(selectedDay)
      return {
        from,
        to: addDays(from, 6),
      }
    }
    return {
      from: selectedDay,
      to: addDays(selectedDay, 2),
    }
  }, [calendarView, selectedDay])
  const query = useQuery({
    queryKey: ['schedule', activeClinicId, format(selectedRange.from, 'yyyy-MM-dd'), format(selectedRange.to, 'yyyy-MM-dd')],
    enabled: Boolean(activeClinicId),
    queryFn: () => fetchSchedule(activeClinicId!, format(selectedRange.from, 'yyyy-MM-dd'), format(selectedRange.to, 'yyyy-MM-dd')),
  })

  const visibleDays = useMemo(() => {
    const days = Math.round((selectedRange.to.getTime() - selectedRange.from.getTime()) / 86_400_000) + 1
    return Array.from({ length: days }, (_, index) => addDays(selectedRange.from, index))
  }, [selectedRange])
  const services = query.data?.services || []
  const watchedServiceId = useWatch({ control: form.control, name: 'servico_id' })
  const startValue = useWatch({ control: form.control, name: 'inicio_em' })
  const endValue = useWatch({ control: form.control, name: 'fim_em' })
  const selectedService = services.find((service) => service.id === watchedServiceId)

  useEffect(() => {
    if (!selectedService || !startValue || editing) return
    const start = new Date(startValue)
    if (Number.isNaN(start.getTime())) return
    form.setValue('fim_em', toInputDateTime(new Date(start.getTime() + selectedService.duracao_minutos * 60_000)), { shouldDirty: false })
    form.setValue('valor_aplicado', selectedService.preco_sob_consulta ? '' : String(currentPrice(selectedService)).replace('.', ','), { shouldDirty: false })
  }, [editing, form, selectedService, startValue])

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] })
    await queryClient.invalidateQueries({ queryKey: ['dashboard', activeClinicId] })
  }

  const triggerCalendarSync = () => {
    if (activeClinicId) void requestGoogleCalendarSync(activeClinicId).catch(() => undefined)
  }

  function openBlockForm(block: ScheduleBlock | null = null, date = selectedDay) {
    if (block?.origem === 'google') return
    setBlockError(null)
    setEditingBlock(block)
    setBlockFormOpen(true)
    setSelectedDate(format(new Date(block?.inicio_em || date), 'yyyy-MM-dd'))
  }

  function closeBlockForm() {
    setBlockFormOpen(false)
    setEditingBlock(null)
    setBlockError(null)
    setScopePrompt(null)
    setBlockOperation(null)
    setBlockConflicts(null)
  }

  function blockRowsForDraft(draft: ScheduleBlockDraft, serieId: string | null) {
    if (!activeClinicId) return []
    const occurrences = buildBlockOccurrences(new Date(draft.inicio_em), new Date(draft.fim_em), draft.recurrence)
    return occurrences.map((occurrence) => ({
      clinica_id: activeClinicId,
      profissional_id: activeMembership?.perfil_id ?? null,
      titulo: draft.titulo,
      motivo: draft.titulo,
      tipo: draft.tipo,
      inicio_em: occurrence.start.toISOString(),
      fim_em: occurrence.end.toISOString(),
      dia_inteiro: draft.dia_inteiro,
      serie_id: serieId,
      recorrencia: draft.recurrence,
      ocorrencia_numero: occurrence.occurrenceNumber,
      origem: 'sistema' as const,
    }))
  }

  async function findBlockConflicts(rows: ReturnType<typeof blockRowsForDraft>) {
    if (!activeClinicId || !rows.length) return []
    const firstRow = rows[0]
    if (!firstRow) return []
    const minStart = rows.reduce((value, row) => row.inicio_em < value ? row.inicio_em : value, firstRow.inicio_em)
    const maxEnd = rows.reduce((value, row) => row.fim_em > value ? row.fim_em : value, firstRow.fim_em)
    const result = await supabase
      .from('agendamentos')
      .select('id,inicio_em,fim_em,clientes(nome)')
      .eq('clinica_id', activeClinicId)
      .is('arquivado_em', null)
      .neq('status', 'cancelado')
      .lt('inicio_em', maxEnd)
      .gt('fim_em', minStart)
      .order('inicio_em')
    if (result.error) throw result.error
    return (result.data || []) as unknown as BlockConflict[]
  }

  function overlapsBlockConflict(row: { inicio_em: string; fim_em: string }, conflict: BlockConflict) {
    return row.inicio_em < conflict.fim_em && row.fim_em > conflict.inicio_em
  }

  async function persistBlockOperation(operation: BlockOperation, ignoreConflicts = false) {
    if (!activeClinicId) return
    setBlockSaving(true)
    setBlockError(null)
    try {
      if (operation.kind === 'delete') {
        let request = supabase.from('bloqueios_agenda').delete().eq('clinica_id', activeClinicId)
        if (operation.scope === 'single' || !operation.block.serie_id) {
          request = request.eq('id', operation.block.id)
        } else if (operation.scope === 'following') {
          request = request.eq('serie_id', operation.block.serie_id).gte('inicio_em', operation.block.inicio_em)
        } else {
          request = request.eq('serie_id', operation.block.serie_id)
        }
        const result = await request
        if (result.error) throw result.error
        await refresh()
        closeBlockForm()
        return
      }

      const block = operation.block
      const recurrence = block && operation.scope === 'single' ? null : operation.draft.recurrence
      const draft = recurrence === operation.draft.recurrence
        ? operation.draft
        : { ...operation.draft, recurrence, repetition: 'none' as const }
      const serieId = recurrence ? (block?.serie_id || crypto.randomUUID()) : null
      const allRows = blockRowsForDraft(draft, serieId)
      const conflicts = await findBlockConflicts(allRows)
      if (conflicts.length && !ignoreConflicts) {
        setBlockOperation(operation)
        setBlockConflicts(conflicts)
        return
      }
      const rows = ignoreConflicts
        ? allRows.filter((row) => !conflicts.some((conflict) => overlapsBlockConflict(row, conflict)))
        : allRows
      if (!rows.length) throw new Error('Nenhuma data livre para criar este bloqueio.')

      if (block) {
        if (operation.scope === 'single' || !block.serie_id) {
          const row = rows[0]
          if (!row) throw new Error('Não foi possível preparar o bloqueio.')
          const result = await supabase.from('bloqueios_agenda').update(row).eq('id', block.id).eq('clinica_id', activeClinicId)
          if (result.error) throw result.error
        } else {
          let remove = supabase.from('bloqueios_agenda').delete().eq('clinica_id', activeClinicId).eq('serie_id', block.serie_id)
          if (operation.scope === 'following') remove = remove.gte('inicio_em', block.inicio_em)
          const removed = await remove
          if (removed.error) throw removed.error
          const inserted = await supabase.from('bloqueios_agenda').insert(rows)
          if (inserted.error) throw inserted.error
        }
      } else {
        const inserted = await supabase.from('bloqueios_agenda').insert(rows)
        if (inserted.error) throw inserted.error
      }
      await refresh()
      closeBlockForm()
    } catch (error) {
      setBlockError(error instanceof Error ? error.message : 'Não foi possível salvar o bloqueio.')
    } finally {
      setBlockSaving(false)
    }
  }

  function handleBlockSubmit(draft: ScheduleBlockDraft) {
    if (editingBlock?.serie_id) {
      setScopePrompt({ block: editingBlock, kind: 'save', draft })
      return
    }
    void persistBlockOperation({ kind: 'save', block: editingBlock, draft, scope: 'single' })
  }

  function handleBlockDelete() {
    if (!editingBlock) return
    if (editingBlock.serie_id) {
      setScopePrompt({ block: editingBlock, kind: 'delete' })
      return
    }
    void persistBlockOperation({ kind: 'delete', block: editingBlock, scope: 'single' })
  }

  function chooseBlockScope(scope: BlockScope) {
    if (!scopePrompt) return
    const operation: BlockOperation = scopePrompt.kind === 'save'
      ? { kind: 'save', block: scopePrompt.block, draft: scopePrompt.draft!, scope }
      : { kind: 'delete', block: scopePrompt.block, scope }
    setScopePrompt(null)
    void persistBlockOperation(operation)
  }

  const appointmentsByDayHour = useMemo(() => {
    const groups = new Map<string, Map<number, Appointment[]>>()
    for (const appointment of query.data?.appointments || []) {
      const start = new Date(appointment.inicio_em)
      const dayKey = format(start, 'yyyy-MM-dd')
      const hour = start.getHours()
      const byHour = groups.get(dayKey) ?? new Map<number, Appointment[]>()
      byHour.set(hour, [...(byHour.get(hour) ?? []), appointment])
      groups.set(dayKey, byHour)
    }
    return groups
  }, [query.data?.appointments])

  const appointmentsForDay = (day: Date) => {
    const byHour = appointmentsByDayHour.get(format(day, 'yyyy-MM-dd'))
    return byHour ? Array.from(byHour.values()).flat() : []
  }

  const blocksForDay = (day: Date) => (query.data?.blocks || []).filter((block) =>
    new Date(block.inicio_em) < endOfDay(day) && new Date(block.fim_em) > startOfDay(day))

  const appointmentsForHour = (day: Date, hour: number) =>
    appointmentsByDayHour.get(format(day, 'yyyy-MM-dd'))?.get(hour) ?? []

  const blocksForHour = (day: Date, hour: number) => (query.data?.blocks || []).filter((block) => {
    const start = new Date(block.inicio_em)
    const end = new Date(block.fim_em)
    const timelineStart = new Date(day); timelineStart.setHours(hours[0] ?? 8, 0, 0, 0)
    const slotStart = new Date(day); slotStart.setHours(hour, 0, 0, 0)
    const slotEnd = new Date(slotStart.getTime() + 60 * 60_000)
    const firstVisibleStart = start < timelineStart ? timelineStart : start
    return start < slotEnd && end > slotStart && firstVisibleStart >= slotStart && firstVisibleStart < slotEnd
  })

  const saveAppointment = useMutation({
    mutationFn: async (values: AppointmentForm) => {
      const service = services.find((item) => item.id === values.servico_id)
      const start = new Date(values.inicio_em)
      const end = values.fim_em ? new Date(values.fim_em) : new Date(start.getTime() + Number(service?.duracao_minutos || 60) * 60_000)
      if (end <= start) throw new Error('O horário final precisa ser depois do início.')
      const conflict = appointmentsForDay(start).find((item) =>
        item.id !== editing?.id && !['cancelado', 'concluido'].includes(item.status) &&
        start < new Date(item.fim_em) && end > new Date(item.inicio_em))
      if (conflict) throw new Error(`Conflito com ${conflict.clientes?.nome}, às ${formatTime(conflict.inicio_em)}.`)
      const blocked = (query.data?.blocks || []).find((item) => start < new Date(item.fim_em) && end > new Date(item.inicio_em))
      if (blocked) throw new Error(`Horário bloqueado por ${blocked.titulo}.`)
      if (!activeClinicId) throw new Error('Clinica ativa nao encontrada.')
      await saveAppointmentRpc({
        p_agendamento_id: editing?.id ?? null,
        p_clinica_id: activeClinicId,
        p_cliente_id: values.cliente_id,
        p_servico_id: values.servico_id,
        p_profissional_id: editing?.itens_plano_tratamento?.length ? editing.profissional_id : activeMembership?.perfil_id ?? null,
        p_inicio_em: start.toISOString(),
        p_fim_em: end.toISOString(),
        p_valor_aplicado: values.valor_aplicado ? parseCurrency(values.valor_aplicado) : currentPrice(service),
        p_status: values.status,
        p_observacoes: values.observacoes?.trim() || null,
      })
    },
    onSuccess: async () => {
      await refresh()
      triggerCalendarSync()
      closeSheet()
    },
  })

  const updateStatus = useMutation({
    mutationFn: async ({ appointment, status }: { appointment: Appointment; status: AppointmentStatus }) => {
      const { error } = await supabase.from('agendamentos').update({ status, atualizado_em: new Date().toISOString() }).eq('id', appointment.id)
      if (error) throw error
    },
    onSuccess: async () => {
      setPreview(null)
      await refresh()
      triggerCalendarSync()
    },
  })

  const resizeAppointment = useMutation({
    mutationFn: async ({ appointment, end }: { appointment: Appointment; end: Date }) => {
      const conflict = appointmentsForDay(new Date(appointment.inicio_em)).find((item) =>
        item.id !== appointment.id && !['cancelado', 'concluido'].includes(item.status) &&
        new Date(appointment.inicio_em) < new Date(item.fim_em) && end > new Date(item.inicio_em))
      if (conflict) throw new Error(`Não é possível estender: ${conflict.clientes?.nome} ocupa o próximo horário.`)
      const { error } = await supabase.from('agendamentos').update({ fim_em: end.toISOString(), atualizado_em: new Date().toISOString() }).eq('id', appointment.id)
      if (error) throw error
    },
    onSuccess: async (_data, variables) => {
      const oldMinutes = (new Date(variables.appointment.fim_em).getTime() - new Date(variables.appointment.inicio_em).getTime()) / 60_000
      const newMinutes = (variables.end.getTime() - new Date(variables.appointment.inicio_em).getTime()) / 60_000
      setDurationNotice(newMinutes - oldMinutes)
      await refresh()
      triggerCalendarSync()
    },
  })

  function openNewAt(hour = 9, waitlist?: WaitlistEntry, baseDay = selectedDay) {
    const start = new Date(baseDay)
    start.setHours(hour, 0, 0, 0)
    const service = services.find((item) => item.id === waitlist?.servico_id)
    const end = new Date(start.getTime() + Number(service?.duracao_minutos || 60) * 60_000)
    setEditing(null)
    setPreview(null)
    form.reset({
      ...defaultValues,
      cliente_id: waitlist?.cliente_id || '',
      servico_id: waitlist?.servico_id || '',
      inicio_em: toInputDateTime(start),
      fim_em: service ? toInputDateTime(end) : '',
      valor_aplicado: service && !service.preco_sob_consulta ? String(currentPrice(service)).replace('.', ',') : '',
      observacoes: waitlist?.observacoes || '',
    })
    setSheetOpen(true)
    setWaitlistOpen(false)
    window.setTimeout(() => document.querySelector<HTMLSelectElement>('#appointment-client')?.focus(), 180)
  }

  function editAppointment(appointment: Appointment) {
    setEditing(appointment)
    setPreview(null)
    form.reset({
      cliente_id: appointment.cliente_id,
      servico_id: appointment.servico_id || '',
      inicio_em: toInputDateTime(new Date(appointment.inicio_em)),
      fim_em: toInputDateTime(new Date(appointment.fim_em)),
      valor_aplicado: String(appointment.valor_aplicado).replace('.', ','),
      status: appointment.status,
      observacoes: appointment.observacoes || '',
    })
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setEditing(null)
    form.reset(defaultValues)
  }

  function beginResize(event: ReactPointerEvent, appointment: Appointment) {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = { y: event.clientY, end: new Date(appointment.fim_em), appointment }
    navigator.vibrate?.(18)
  }

  function resizeMove(event: ReactPointerEvent) {
    if (!dragStart.current) return
    const steps = Math.round((event.clientY - dragStart.current.y) / 18)
    const minutes = Math.max(15, steps * 15)
    const end = new Date(dragStart.current.end.getTime() + minutes * 60_000)
    event.currentTarget.setAttribute('data-time', format(end, 'HH:mm'))
  }

  function finishResize(event: ReactPointerEvent) {
    if (!dragStart.current) return
    const { y, end: originalEnd, appointment } = dragStart.current
    const steps = Math.round((event.clientY - y) / 18)
    dragStart.current = null
    event.currentTarget.removeAttribute('data-time')
    if (!steps) return
    const minimumEnd = new Date(new Date(appointment.inicio_em).getTime() + 15 * 60_000)
    const end = new Date(Math.max(minimumEnd.getTime(), originalEnd.getTime() + steps * 15 * 60_000))
    navigator.vibrate?.(12)
    void resizeAppointment.mutateAsync({ appointment, end })
  }

  const dayStrip = Array.from({ length: 5 }, (_, index) => addDays(selectedDay, index - 2))
  const periodLabel = calendarView === 'month'
    ? format(selectedDay, "MMMM 'de' yyyy", { locale: ptBR })
    : `${format(selectedRange.from, "d 'de' MMM", { locale: ptBR })} — ${format(selectedRange.to, "d 'de' MMM", { locale: ptBR })}`
  const monthGridStart = startOfWeek(startOfMonth(selectedDay))
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index))

  return (
    <main className="content-page schedule-focus-page">
      <header className="schedule-hero">
        <div>
          <h1>{periodLabel}</h1>
        </div>
        <button className="gold-button desktop-new-appointment" type="button" onClick={() => setActionSheetOpen(true)}>
          <Plus size={18} /> Novo agendamento
        </button>
      </header>

      <section className="calendar-toolbar" aria-label="Controles da agenda">
        <div className="calendar-view-switch" role="tablist" aria-label="Modo de visualização">
          <button className="today-button" type="button" onClick={() => setSelectedDate(toInputDate())}>Hoje</button>
          {viewOptions.map((option) => (
            <button
              aria-selected={calendarView === option.value}
              className={calendarView === option.value ? 'active' : ''}
              key={option.value}
              role="tab"
              type="button"
              onClick={() => setCalendarView(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="calendar-legend" aria-label="Legenda dos status">
          <span><i className="legend-dot confirmed" />Confirmado</span>
          <span><i className="legend-dot waiting" />Aguardando</span>
        </div>
      </section>

      {calendarView !== 'month' ? <nav className="date-carousel" aria-label="Escolher dia">
        <button type="button" aria-label="Dia anterior" onClick={() => setSelectedDate(format(addDays(selectedDay, -1), 'yyyy-MM-dd'))}><ChevronLeft /></button>
        {dayStrip.map((day) => {
          const active = isSameDay(day, selectedDay)
          return (
            <button className={active ? 'active' : ''} type="button" key={day.toISOString()} onClick={() => setSelectedDate(format(day, 'yyyy-MM-dd'))}>
              <span>{format(day, 'EEE', { locale: ptBR }).replace('.', '')}</span>
              <strong>{format(day, 'd')}</strong>
              <small>{format(day, 'MMM', { locale: ptBR }).replace('.', '')}</small>
            </button>
          )
        })}
        <button type="button" aria-label="Próximo dia" onClick={() => setSelectedDate(format(addDays(selectedDay, 1), 'yyyy-MM-dd'))}><ChevronRight /></button>
      </nav> : null}

      {query.isError ? <div className="form-alert">Não foi possível carregar sua agenda agora. Tente novamente em instantes.</div> : query.isLoading ? <LoadingBlock label="Preparando sua agenda" /> : (
        calendarView === 'month' ? (
          <section className="month-calendar" aria-label="Visualização mensal">
            <div className="month-weekdays">
              {weekDays.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="month-grid">
              {monthDays.map((day) => {
                const appointments = appointmentsForDay(day)
                const blocks = blocksForDay(day)
                const confirmed = appointments.filter((item) => ['confirmado', 'concluido'].includes(item.status)).length
                const waiting = appointments.filter((item) => item.status === 'agendado').length
                return (
                  <article
                    className={`month-day ${isSameMonth(day, selectedDay) ? '' : 'outside'} ${isSameDay(day, new Date()) ? 'today' : ''}`}
                    key={day.toISOString()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      const entry = query.data?.waitlist.find((item) => item.id === event.dataTransfer.getData('waitlist-id'))
                      if (entry) openNewAt(9, entry, day)
                    }}
                  >
                    <header>
                      <button type="button" onClick={() => {
                        setSelectedDate(format(day, 'yyyy-MM-dd'))
                        openNewAt(9, undefined, day)
                      }}>
                        {format(day, 'd')}
                      </button>
                      {appointments.length || blocks.length ? <span>{appointments.length + blocks.length}</span> : null}
                    </header>
                    <div className="month-status-line">
                      {confirmed ? <span className="confirmed"><CheckCircle2 size={12} />{confirmed}</span> : null}
                      {waiting ? <span className="waiting"><Clock3 size={12} />{waiting}</span> : null}
                    </div>
                    <div className="month-appointments">
                      {appointments.slice(0, 3).map((appointment) => (
                        <button
                          className={`month-chip ${appointment.status}`}
                          key={appointment.id}
                          type="button"
                          onClick={() => {
                            setSelectedDate(format(day, 'yyyy-MM-dd'))
                            setPreview(appointment)
                          }}
                        >
                          <span className={`mini-status ${appointment.status}`} />
                          {formatTime(appointment.inicio_em)} {appointment.clientes?.nome}
                        </button>
                      ))}
                      {appointments.length > 3 ? <small>+{appointments.length - 3} agendamentos</small> : null}
                      {blocks.slice(0, Math.max(0, 3 - appointments.length)).map((block) => (
                        <button
                          className="month-chip schedule-block-chip"
                          key={`block-${block.id}`}
                          type="button"
                          onClick={() => openBlockForm(block, day)}
                          disabled={block.origem === 'google'}
                          title={block.origem === 'google' ? 'Evento importado da agenda externa' : 'Editar bloqueio'}
                        >
                          <span className="mini-status schedule-block-status" />
                          {block.dia_inteiro ? 'Dia inteiro' : formatTime(block.inicio_em)} {block.titulo}
                        </button>
                      ))}
                    </div>
                    {!appointments.length && !blocks.length ? (
                      <button className="month-empty-action" type="button" onClick={() => openNewAt(9, undefined, day)}>
                        <Plus size={14} /> Agendar
                      </button>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        ) : (
          <section className={`focus-timeline multi-day-timeline ${calendarView}`} aria-label="Visualização por horários">
            <div className="multi-day-header" style={{ gridTemplateColumns: `66px repeat(${visibleDays.length}, minmax(178px, 1fr))` }}>
              <span />
              {visibleDays.map((day) => (
                <button
                  className={isSameDay(day, selectedDay) ? 'active' : ''}
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setSelectedDate(format(day, 'yyyy-MM-dd'))}
                >
                  <span>{format(day, 'EEE', { locale: ptBR }).replace('.', '')}</span>
                  <strong>{format(day, 'd')}</strong>
                </button>
              ))}
            </div>
            {hours.map((hour) => (
              <div className="focus-hour multi-day-hour" key={hour} style={{ gridTemplateColumns: `66px repeat(${visibleDays.length}, minmax(178px, 1fr))` }}>
                <time>{String(hour).padStart(2, '0')}:00</time>
                {visibleDays.map((day) => {
                  const appointments = appointmentsForHour(day, hour)
                  const blocks = blocksForHour(day, hour)
                  return (
                    <div className="hour-track" key={day.toISOString()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                      const entry = query.data?.waitlist.find((item) => item.id === event.dataTransfer.getData('waitlist-id'))
                      if (entry) openNewAt(hour, entry, day)
                    }}>
                      {!appointments.length && !blocks.length ? (
                        <button className="empty-slot-action" type="button" onClick={() => openNewAt(hour, undefined, day)} aria-label={`Agendar às ${hour} horas`}>
                          <Plus size={17} /><span>Adicionar horário</span>
                        </button>
                      ) : null}
                      {blocks.map((block) => (
                        <article className="schedule-block" key={`block-${block.id}`} title={block.motivo || block.titulo}>
                          <button
                            className="schedule-block-main"
                            type="button"
                            onClick={() => openBlockForm(block, day)}
                            disabled={block.origem === 'google'}
                          >
                            <span className="appointment-time">{block.dia_inteiro ? 'Dia inteiro' : <>{formatTime(block.inicio_em)}<small>{formatTime(block.fim_em)}</small></>}</span>
                            <span className="appointment-info"><strong>{block.titulo}</strong><span>{block.origem === 'google' ? 'Google Agenda' : BLOCK_TYPE_LABELS[block.tipo] || 'Bloqueio'}</span>{block.serie_id ? <small>Recorrente</small> : null}</span>
                          </button>
                        </article>
                      ))}
                      {appointments.map((appointment) => (
                        <AppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          onOpen={() => setPreview(appointment)}
                          onComplete={() => void updateStatus.mutateAsync({ appointment, status: 'concluido' })}
                          onEdit={() => editAppointment(appointment)}
                          onResizeStart={(event) => beginResize(event, appointment)}
                          onResizeMove={resizeMove}
                          onResizeEnd={finishResize}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </section>
        )
      )}


      <button className={`waitlist-tab ${waitlistOpen ? 'active' : ''}`} type="button" onClick={() => setWaitlistOpen((value) => !value)}>
        <UserRound size={18} /><span>Encaixes</span><strong>{query.data?.waitlist.length || 0}</strong>
      </button>

      {waitlistOpen ? (
        <aside className="waitlist-drawer">
          <header>
            <div><span className="eyebrow">Fila de espera</span><h2>Encaixes</h2></div>
            <button className="icon-button" type="button" onClick={() => setWaitlistOpen(false)}><X size={18} /></button>
          </header>
          <p>Arraste uma cliente para um horário livre ou toque para encaixar.</p>
          <div className="waitlist-items">
            {query.data?.waitlist.length ? query.data.waitlist.map((entry) => (
              <button
                className="waitlist-card"
                draggable
                key={entry.id}
                type="button"
                onDragStart={(event) => event.dataTransfer.setData('waitlist-id', entry.id)}
                onClick={() => openNewAt(9, entry)}
              >
                <span className="client-monogram">{entry.clientes?.nome?.slice(0, 2).toUpperCase()}</span>
                <span><strong>{entry.clientes?.nome}</strong><small>{entry.servicos?.nome || 'Serviço a definir'}</small></span>
                <GripHorizontal size={17} />
              </button>
            )) : <EmptyState title="Nenhum encaixe pendente" />}
          </div>
        </aside>
      ) : null}

      {preview ? (
        <>
          <button className="popover-scrim" type="button" aria-label="Fechar detalhes" onClick={() => setPreview(null)} />
          <aside className="appointment-popover" role="dialog" aria-label="Detalhes do agendamento">
            <header>
              <span className={`status-dot ${preview.status}`} />
              <span>{preview.status.replace('_', ' ')}</span>
              <button type="button" onClick={() => setPreview(null)}><X size={17} /></button>
            </header>
            <h2>{preview.clientes?.nome}</h2>
            <p>{preview.servicos?.nome}</p>
            {treatmentLabel(preview) ? <p className="treatment-appointment-label">{treatmentLabel(preview)}</p> : null}
            <dl>
              <div><dt>Horário</dt><dd>{formatTime(preview.inicio_em)} — {formatTime(preview.fim_em)}</dd></div>
              <div><dt>Valor</dt><dd>{formatMoney(preview.valor_aplicado)}</dd></div>
              {preview.observacoes ? <div><dt>Observação</dt><dd>{preview.observacoes}</dd></div> : null}
            </dl>
            <div className="popover-actions">
              <button className="primary-button" type="button" onClick={() => void updateStatus.mutateAsync({ appointment: preview, status: 'em_atendimento' })}>
                <Play size={16} /> Iniciar atendimento
              </button>
              <button className="ghost-button" type="button" onClick={() => editAppointment(preview)}>
                <RotateCcw size={16} /> Reagendar
              </button>
            </div>
          </aside>
        </>
      ) : null}

      <button className="floating-add" type="button" aria-label="Adicionar à agenda" onClick={() => setActionSheetOpen(true)}><Plus size={25} /></button>

      {sheetOpen ? (
        <div className="sheet-layer" role="presentation">
          <button className="sheet-overlay" type="button" aria-label="Fechar formulário" onClick={closeSheet} />
          <form className="bottom-sheet" onSubmit={(event) => void form.handleSubmit((values) => saveAppointment.mutateAsync(values))(event)}>
            <div className="sheet-handle" />
            <header>
              <div><span className="eyebrow">{editing ? 'Ajustar horário' : 'Novo horário'}</span><h2>{editing ? 'Editar agendamento' : 'Novo agendamento'}</h2></div>
              <button className="icon-button" type="button" onClick={closeSheet}><X size={18} /></button>
            </header>
            <div className="sheet-form-grid">
              <label>
                Cliente
                <select id="appointment-client" {...form.register('cliente_id')}>
                  <option value="">Busque ou selecione</option>
                  {(query.data?.clients || []).map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}
                </select>
                <FieldError message={form.formState.errors.cliente_id?.message} />
              </label>
              <label>
                Serviço
                <select {...form.register('servico_id')}>
                  <option value="">Selecione o procedimento</option>
                  {services.map((service) => <option key={service.id} value={service.id}>{service.nome} · {service.duracao_minutos} min</option>)}
                </select>
                <FieldError message={form.formState.errors.servico_id?.message} />
              </label>
              <label>Quando<input type="datetime-local" {...form.register('inicio_em')} /></label>
              {selectedService ? (
                <div className="derived-appointment-summary">
                  <Clock3 size={17} />
                  <span><strong>{selectedService.duracao_minutos} min de atendimento</strong><small>O horário termina às {endValue ? format(new Date(endValue), 'HH:mm') : '—'}.</small></span>
                </div>
              ) : <p className="field-help">Escolha um serviço para calcular automaticamente o horário final.</p>}
              <details className="advanced-appointment-options">
                <summary>Opções avançadas</summary>
                <div className="form-grid">
                  {editing ? <label>Fim<input type="datetime-local" {...form.register('fim_em')} /></label> : null}
                  <label>Valor<input inputMode="decimal" placeholder="R$ 0,00" {...form.register('valor_aplicado')} /></label>
                  {editing ? <label>Status<select {...form.register('status')}>{statusOptions.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></label> : null}
                </div>
              </details>
              <details className="appointment-notes">
                <summary>+ Adicionar observação</summary>
                <textarea rows={2} placeholder="Preferências, cuidados ou observações clínicas" {...form.register('observacoes')} />
              </details>
            </div>
            {saveAppointment.error ? <div className="form-alert">{saveAppointment.error.message}</div> : null}
            <button className="gold-button sheet-submit" type="submit" disabled={saveAppointment.isPending}>
              {editing ? <Save size={17} /> : <CalendarPlus size={17} />}
              {saveAppointment.isPending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Confirmar agendamento'}
            </button>
          </form>
        </div>
      ) : null}

      {actionSheetOpen ? (
        <ScheduleActionSheet
          onClose={() => setActionSheetOpen(false)}
          onNewAppointment={() => { setActionSheetOpen(false); openNewAt() }}
          onBlockAgenda={() => { setActionSheetOpen(false); openBlockForm() }}
        />
      ) : null}

      {blockFormOpen ? (
        <ScheduleBlockForm
          block={editingBlock}
          date={selectedDay}
          onClose={closeBlockForm}
          onSubmit={handleBlockSubmit}
          {...(editingBlock ? { onDelete: handleBlockDelete } : {})}
          saving={blockSaving}
          error={blockError}
        />
      ) : null}

      {scopePrompt ? (
        <div className="sheet-layer" role="presentation">
          <button className="sheet-overlay" type="button" aria-label="Fechar opções de recorrência" onClick={() => setScopePrompt(null)} />
          <section className="bottom-sheet schedule-scope-sheet" role="dialog" aria-modal="true" aria-labelledby="schedule-scope-title">
            <div className="sheet-handle" />
            <header><div><p className="eyebrow">Bloqueio recorrente</p><h2 id="schedule-scope-title">Aplicar a alteração em…</h2></div><button className="icon-button" type="button" onClick={() => setScopePrompt(null)}><X size={18} /></button></header>
            <div className="schedule-action-options">
              <button className="schedule-action-option" type="button" onClick={() => chooseBlockScope('single')}><span><strong>Somente este dia</strong><small>Altera ou remove apenas esta ocorrência.</small></span></button>
              <button className="schedule-action-option" type="button" onClick={() => chooseBlockScope('following')}><span><strong>Este e os próximos</strong><small>Mantém o histórico e atualiza o restante da série.</small></span></button>
              <button className="schedule-action-option" type="button" onClick={() => chooseBlockScope('series')}><span><strong>Toda a série</strong><small>Aplica a alteração em todas as ocorrências.</small></span></button>
            </div>
          </section>
        </div>
      ) : null}

      {blockConflicts && blockOperation?.kind === 'save' ? (
        <div className="sheet-layer" role="presentation">
          <button className="sheet-overlay" type="button" aria-label="Fechar conflitos" onClick={() => setBlockConflicts(null)} />
          <section className="bottom-sheet schedule-conflict-sheet" role="dialog" aria-modal="true" aria-labelledby="schedule-conflict-title">
            <div className="sheet-handle" />
            <header><div><p className="eyebrow">Agenda protegida</p><h2 id="schedule-conflict-title">Há atendimentos nestes horários</h2></div><button className="icon-button" type="button" onClick={() => setBlockConflicts(null)}><X size={18} /></button></header>
            <p>Os atendimentos serão preservados. Revise as datas ou ignore os conflitos para bloquear somente os outros períodos.</p>
            <div className="conflict-list">{blockConflicts.slice(0, 8).map((conflict) => <div className="conflict-item" key={conflict.id}><strong>{formatTime(conflict.inicio_em)} — {formatTime(conflict.fim_em)}</strong><span>{conflict.clientes?.nome || 'Atendimento agendado'}</span></div>)}</div>
            {blockConflicts.length > 8 ? <small>+ {blockConflicts.length - 8} outros horários</small> : null}
            <div className="popover-actions"><button className="ghost-button" type="button" onClick={() => setBlockConflicts(null)}>Revisar bloqueio</button><button className="gold-button" type="button" onClick={() => blockOperation && void persistBlockOperation(blockOperation, true)} disabled={blockSaving}>Ignorar conflitos</button></div>
          </section>
        </div>
      ) : null}

      {durationNotice !== null ? (
        <aside className="duration-notice">
          <Sparkles size={18} />
          <div><strong>Tempo {durationNotice > 0 ? 'estendido' : 'reduzido'} em {Math.abs(durationNotice)} min</strong><span>Deseja adicionar um serviço ou alterar o valor?</span></div>
          <button type="button" onClick={() => setDurationNotice(null)}>Agora não</button>
        </aside>
      ) : null}

      {resizeAppointment.error ? <div className="floating-error">{resizeAppointment.error.message}</div> : null}
    </main>
  )
}

function AppointmentCard({
  appointment,
  onOpen,
  onComplete,
  onEdit,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: {
  appointment: Appointment
  onOpen: () => void
  onComplete: () => void
  onEdit: () => void
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onResizeMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onResizeEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  const pointerX = useRef<number | null>(null)
  const confirmed = appointment.status === 'confirmado' || appointment.status === 'concluido'
  return (
    <article
      className={`focus-appointment ${appointment.status}`}
      onPointerDown={(event) => { pointerX.current = event.clientX }}
      onPointerUp={(event) => {
        if (pointerX.current === null) return
        const distance = event.clientX - pointerX.current
        pointerX.current = null
        if (distance > 72) {
          navigator.vibrate?.(15)
          onComplete()
        } else if (distance < -72) onEdit()
      }}
    >
      <div
        className="appointment-main"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onOpen()
        }}
      >
        <span className="appointment-time">{formatTime(appointment.inicio_em)}<small>{formatTime(appointment.fim_em)}</small></span>
        <span className="appointment-info">
          <strong>{appointment.clientes?.nome}</strong>
          <span>{appointment.servicos?.nome || 'Procedimento'}</span>
          {treatmentLabel(appointment) ? <small className="treatment-appointment-label">{treatmentLabel(appointment)}</small> : null}
          <small><span className={`mini-status ${appointment.status}`} />{appointment.status.replace('_', ' ')}</small>
        </span>
        <span className="appointment-indicators">
          {appointment.observacoes ? <NotebookPen size={16} aria-label="Possui observação" /> : null}
          <a href={whatsappUrl(appointment)} target="_blank" rel="noreferrer" aria-label="Conversar no WhatsApp" onClick={(event) => event.stopPropagation()}>
            {confirmed ? <CheckCircle2 size={19} /> : <MessageCircle size={19} />}
          </a>
          <MoreHorizontal size={18} />
        </span>
      </div>
      <button
        className="resize-handle"
        type="button"
        aria-label="Ajustar duração"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
      >
        <GripHorizontal size={20} />
      </button>
      {appointment.status === 'concluido' ? <span className="swipe-success"><Check size={15} /> Concluído</span> : null}
    </article>
  )
}
