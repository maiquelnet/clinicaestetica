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
import { z } from 'zod'
import { EmptyState, FieldError, LoadingBlock } from '../components/Ui'
import { useClinic } from '../contexts/useClinic'
import { currentPrice, formatMoney, formatTime, parseCurrency, toInputDate, toInputDateTime } from '../lib/format'
import { saveAppointment as saveAppointmentRpc } from '../lib/rpc'
import { requestGoogleCalendarSync } from '../lib/google-calendar'
import { supabase } from '../lib/supabase'
import type { Appointment, AppointmentStatus, Client, Service, WaitlistEntry } from '../lib/types'

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
  blocks: CalendarBlock[]
}
type CalendarBlock = { id: string; titulo: string; motivo: string | null; inicio_em: string; fim_em: string; origem: string }
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

async function fetchSchedule(clinicId: string, fromDate: string, toDate: string): Promise<ScheduleData> {
  const from = startOfDay(new Date(`${fromDate}T00:00:00`)).toISOString()
  const to = endOfDay(new Date(`${toDate}T00:00:00`)).toISOString()
  const [clients, services, appointments, waitlist, blocks] = await Promise.all([
    supabase.from('clientes').select('*').eq('clinica_id', clinicId).eq('ativo', true).is('arquivado_em', null).order('nome'),
    supabase.from('servicos').select('*,precos_servicos(*)').eq('clinica_id', clinicId).eq('ativo', true).is('arquivado_em', null).order('nome'),
    supabase
      .from('agendamentos')
      .select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos)')
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
    supabase.from('bloqueios_agenda').select('id,titulo,motivo,inicio_em,fim_em,origem')
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
    blocks: (blocks.data || []) as CalendarBlock[],
  }
}

function whatsappUrl(appointment: Appointment) {
  const phone = appointment.clientes?.telefone?.replace(/\D/g, '') || ''
  const normalized = phone.startsWith('55') ? phone : `55${phone}`
  const message = `Olá, ${appointment.clientes?.nome}! Confirmamos seu horário para ${formatTime(appointment.inicio_em)}. ✨`
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

export function SchedulePage() {
  const { activeClinicId, activeMembership } = useClinic()
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(toInputDate())
  const [calendarView, setCalendarView] = useState<CalendarView>('three_days')
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [preview, setPreview] = useState<Appointment | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [waitlistOpen, setWaitlistOpen] = useState(false)
  const [durationNotice, setDurationNotice] = useState<number | null>(null)
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
  const selectedService = services.find((service) => service.id === watchedServiceId)

  useEffect(() => {
    if (!selectedService || !startValue || editing) return
    const start = new Date(startValue)
    if (Number.isNaN(start.getTime())) return
    if (!form.getValues('fim_em')) {
      form.setValue('fim_em', toInputDateTime(new Date(start.getTime() + selectedService.duracao_minutos * 60_000)))
    }
    if (!form.getValues('valor_aplicado')) {
      form.setValue('valor_aplicado', selectedService.preco_sob_consulta ? '' : String(currentPrice(selectedService)).replace('.', ','))
    }
  }, [editing, form, selectedService, startValue])

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] })
    await queryClient.invalidateQueries({ queryKey: ['dashboard', activeClinicId] })
  }

  const triggerCalendarSync = () => {
    if (activeClinicId) void requestGoogleCalendarSync(activeClinicId).catch(() => undefined)
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
    const slotStart = new Date(day); slotStart.setHours(hour, 0, 0, 0)
    const slotEnd = new Date(slotStart.getTime() + 60 * 60_000)
    return start < slotEnd && end > slotStart
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
        p_profissional_id: activeMembership?.perfil_id ?? null,
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
      fim_em: toInputDateTime(end),
      valor_aplicado: service ? String(currentPrice(service)).replace('.', ',') : '',
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
        <button className="gold-button desktop-new-appointment" type="button" onClick={() => openNewAt()}>
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

      {query.isLoading ? <LoadingBlock label="Preparando sua agenda" /> : (
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
                        <span className="month-chip cancelado" key={`block-${block.id}`}>{formatTime(block.inicio_em)} {block.titulo}</span>
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
                        <article className="focus-appointment cancelado" key={`block-${block.id}`} title={block.motivo || block.titulo}>
                          <div className="appointment-main">
                            <span className="appointment-time">{formatTime(block.inicio_em)}<small>{formatTime(block.fim_em)}</small></span>
                            <span className="appointment-info"><strong>{block.titulo}</strong><span>{block.origem === 'google' ? 'Google Agenda' : 'Bloqueio'}</span></span>
                          </div>
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

      <button className="floating-add" type="button" aria-label="Novo agendamento" onClick={() => openNewAt()}><Plus size={25} /></button>

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
              <div className="form-grid">
                <label>Início<input type="datetime-local" {...form.register('inicio_em')} /></label>
                <label>Fim<input type="datetime-local" {...form.register('fim_em')} /></label>
              </div>
              <div className="form-grid">
                <label>Valor<input inputMode="decimal" placeholder="R$ 0,00" {...form.register('valor_aplicado')} /></label>
                <label>Status<select {...form.register('status')}>{statusOptions.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></label>
              </div>
              <label>Observações<textarea rows={2} placeholder="Preferências, cuidados ou observações clínicas" {...form.register('observacoes')} /></label>
            </div>
            {saveAppointment.error ? <div className="form-alert">{saveAppointment.error.message}</div> : null}
            <button className="gold-button sheet-submit" type="submit" disabled={saveAppointment.isPending}>
              {editing ? <Save size={17} /> : <CalendarPlus size={17} />}
              {saveAppointment.isPending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Confirmar agendamento'}
            </button>
          </form>
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
