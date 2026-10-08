import { useQuery } from '@tanstack/react-query'
import { addDays, endOfDay, format, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, Check, Clock3, RotateCcw, Send, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LoadingBlock } from '../components/Ui'
import { PageHeader } from '../components/PageHeader'
import { useClinic } from '../contexts/useClinic'
import { clinicDateForInstant, clinicDateToday, nextSevenClinicDates, type RadarDay } from '../lib/capacity'
import { formatTime } from '../lib/format'
import { buildAlerts, messagingQueryOptions } from '../lib/messaging'
import { fetchOccupancyRadarPeriod } from '../lib/rpc'
import { supabase } from '../lib/supabase'
import type { Appointment, AppointmentStatus } from '../lib/types'

type DashboardData = {
  appointments: Appointment[]
}

async function fetchDashboard(clinicId: string): Promise<DashboardData> {
  const from = startOfDay(new Date()).toISOString()
  const to = endOfDay(addDays(new Date(), 6)).toISOString()
  const appointments = await supabase
    .from('agendamentos')
    .select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos)')
    .eq('clinica_id', clinicId)
    .gte('inicio_em', from)
    .lte('inicio_em', to)
    .is('arquivado_em', null)
    .order('inicio_em', { ascending: true })

  if (appointments.error) throw appointments.error
  return {
    appointments: (appointments.data || []) as Appointment[],
  }
}

const statusLabels: Record<AppointmentStatus, string> = {
  agendado: 'Aguardando confirmação',
  confirmado: 'Confirmado',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

function uniqueClientCount(ids: string[]) {
  return new Set(ids).size
}

function weekdayLabel(date: Date) {
  return format(date, 'EEE', { locale: ptBR }).replace('.', '').toUpperCase()
}

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder}min`
  return remainder ? `${hours}h ${remainder}min` : `${hours}h`
}

export function DashboardPage() {
  const { activeClinicId, activeClinic, profile } = useClinic()
  const query = useQuery({
    queryKey: ['dashboard', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: () => fetchDashboard(activeClinicId!),
  })
  const messagingQuery = useQuery(messagingQueryOptions(activeClinicId))

  const now = new Date()
  const radarDates = activeClinic?.fuso_horario ? nextSevenClinicDates(activeClinic.fuso_horario, now) : null
  const radarQuery = useQuery({
    queryKey: ['occupancy-radar', activeClinicId, profile?.id, radarDates?.inicio, radarDates?.fim],
    enabled: Boolean(activeClinicId && profile?.id && radarDates),
    queryFn: () => fetchOccupancyRadarPeriod({
      p_clinica_id: activeClinicId!,
      p_profissional_id: profile!.id,
      p_data_inicio: radarDates!.inicio,
      p_data_fim: radarDates!.fim,
    }),
  })
  const appointments = query.data?.appointments ?? []
  const clinicTimeZone = activeClinic?.fuso_horario
  const today = clinicTimeZone ? clinicDateToday(clinicTimeZone, now) : format(now, 'yyyy-MM-dd')
  const todayAllAppointments = appointments.filter((appointment) => clinicTimeZone
    ? clinicDateForInstant(appointment.inicio_em, clinicTimeZone) === today
    : format(new Date(appointment.inicio_em), 'yyyy-MM-dd') === today)
  const todayAppointments = todayAllAppointments.filter((appointment) => appointment.status !== 'cancelado')
  const confirmed = todayAppointments.filter((appointment) => ['confirmado', 'concluido'].includes(appointment.status)).length
  const capacityDays: RadarDay[] = radarQuery.data ?? []
  const attentionDays = capacityDays.filter((day) => day.merece_atencao)
  const messagingData = messagingQuery.data
  const alerts = messagingData ? buildAlerts(messagingData) : []
  const readyToReturn = uniqueClientCount(alerts.filter((alert) => alert.tipo === 'lembrete_retorno').map((alert) => alert.clienteId))
  const waitingResponse = uniqueClientCount(todayAppointments.filter((appointment) => appointment.status === 'agendado').map((appointment) => appointment.cliente_id))
  const templateTypes = new Map((messagingData?.templates || []).map((template) => [template.id, template.tipo]))
  const remindersSent = (messagingData?.logs || []).filter((log) => {
    const templateType = log.modelo_mensagem_id ? templateTypes.get(log.modelo_mensagem_id) : null
    return new Date(log.enviado_em || log.criado_em).toDateString() === now.toDateString()
      && ['enviado', 'entregue', 'lido'].includes(log.status)
      && ['confirmacao_agendamento', 'lembrete_agendamento'].includes(templateType || '')
  }).length
  const hasTodaySecretaryActivity = confirmed > 0 || remindersSent > 0 || waitingResponse > 0 || readyToReturn > 0
  const displayName = profile?.nome?.split(' ')[0] || 'Thais'
  const dayDescription = todayAppointments.length
    ? `Hoje você tem ${todayAppointments.length} ${todayAppointments.length === 1 ? 'atendimento' : 'atendimentos'}. Sua secretária já confirmou ${confirmed} deles.`
    : `Sua agenda está livre hoje. ${readyToReturn ? `Há ${readyToReturn} ${readyToReturn === 1 ? 'cliente' : 'clientes'} que já podem ser chamados para retornar.` : 'Sua secretária está acompanhando os próximos dias.'}`

  return (
    <main className="content-page operational-page home-page">
      <PageHeader
        eyebrow={format(now, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        title={`Bom dia, ${displayName}.`}
        description={dayDescription}
        actions={<Link className="primary-button compact-action" to="/agenda"><CalendarDays size={16} /> Novo agendamento</Link>}
      />

      {query.isError || messagingQuery.isError || radarQuery.isError ? <div className="form-alert">Não foi possível carregar o resumo agora. Tente novamente em instantes.</div> : query.isLoading || messagingQuery.isLoading || radarQuery.isLoading ? <LoadingBlock /> : (
        <div className="home-sections">
          <section className="panel today-panel" aria-labelledby="today-title">
            <div className="panel-header compact-header">
              <div><p className="eyebrow">Resumo operacional</p><h2 id="today-title">Hoje</h2></div>
              <Link className="ghost-link" to="/agenda">Ver agenda completa →</Link>
            </div>
            {todayAppointments.length ? (
              <div className="today-events" aria-label="Próximos atendimentos de hoje">
                {todayAppointments.slice(0, 3).map((appointment) => (
                  <article className={`today-event ${appointment.status}`} key={appointment.id}>
                    <time>{formatTime(appointment.inicio_em)}</time>
                    <div className="today-event-content"><strong>{appointment.clientes?.nome || 'Cliente'}</strong><span>{appointment.servicos?.nome || 'Atendimento'}</span></div>
                    <span className={`today-status ${appointment.status}`}>{statusLabels[appointment.status]}</span>
                  </article>
                ))}
                {todayAppointments.length > 3 ? <small className="today-more">+ {todayAppointments.length - 3} na agenda completa</small> : null}
              </div>
            ) : (
              <div className="home-empty-today">
                <strong>Agenda livre</strong>
                <span>Nenhum atendimento agendado para hoje.</span>
                <span>Sua secretária está acompanhando os próximos dias.</span>
              </div>
            )}
          </section>

          <section className="panel next-days-panel" aria-labelledby="next-days-title">
            <div className="panel-header compact-header">
              <div><p className="eyebrow">Leitura da capacidade comercial</p><h2 id="next-days-title">Próximos 7 dias</h2></div>
              <Link className="ghost-link" to="/mensagens">Ver oportunidades →</Link>
            </div>
            {attentionDays.length ? <p className="attention-summary">{attentionDays.length} {attentionDays.length === 1 ? 'dia merece' : 'dias merecem'} atenção.</p> : <p className="attention-summary positive">Sua agenda está bem distribuída nos próximos dias.</p>}
            <div className="capacity-days" aria-label="Capacidade dos próximos sete dias">
              {capacityDays.map((day) => (
                <Link className={`capacity-day ${day.merece_atencao ? 'attention' : ''}`} key={day.data} to={`/agenda?data=${day.data}`}>
                  <span>{weekdayLabel(new Date(`${day.data}T12:00:00`))} {day.data.slice(8, 10)}/{day.data.slice(5, 7)}</span>
                  {day.ocupacao_percentual === null ? <strong>Indisponível</strong> : <><strong>{day.ocupacao_percentual}%</strong><small>{minutesLabel(day.livre_minutos)} livres</small></>}
                  <em>{minutesLabel(day.ocupado_minutos)} em atendimento{day.bloqueado_minutos ? ` · ${minutesLabel(day.bloqueado_minutos)} bloqueados` : ''}</em>
                </Link>
              ))}
            </div>
            {readyToReturn ? <p className="return-opportunity"><RotateCcw size={16} /> {readyToReturn} {readyToReturn === 1 ? 'cliente pode estar' : 'clientes podem estar'} próximo{readyToReturn === 1 ? '' : 's'} do período de retorno.</p> : null}
          </section>

          <section className="panel secretary-panel" aria-labelledby="secretary-title">
            <div className="panel-header compact-header">
              <div><p className="eyebrow">Acompanhamento contínuo</p><h2 id="secretary-title">Sua secretária hoje</h2></div>
              <Link className="ghost-link" to="/mensagens">Ver atividade →</Link>
            </div>
            {hasTodaySecretaryActivity ? (
              <div className="secretary-list">
                <span><Check size={17} aria-hidden="true" /> {confirmed} {confirmed === 1 ? 'cliente confirmada' : 'clientes confirmadas'}</span>
                <span><Send size={17} aria-hidden="true" /> {remindersSent} {remindersSent === 1 ? 'lembrete enviado' : 'lembretes enviados'}</span>
                <span><Clock3 size={17} aria-hidden="true" /> {waitingResponse} {waitingResponse === 1 ? 'cliente aguardando resposta' : 'clientes aguardando resposta'}</span>
                {readyToReturn ? <span><RotateCcw size={17} aria-hidden="true" /> {readyToReturn} {readyToReturn === 1 ? 'cliente pronta' : 'clientes prontas'} para retornar</span> : null}
                {attentionDays.length ? <p className="secretary-insight"><TriangleAlert size={16} /> A próxima semana tem {attentionDays.length} {attentionDays.length === 1 ? 'dia com espaço' : 'dias com espaço'} para novos atendimentos.</p> : null}
              </div>
            ) : (
              <div className="secretary-context">
                <p>{todayAppointments.length ? 'Tudo sob controle. Sua secretária está acompanhando os próximos dias.' : 'Sua secretária está acompanhando sua próxima semana.'}</p>
                {attentionDays.length ? <span><TriangleAlert size={16} /> Identifiquei {attentionDays.length} {attentionDays.length === 1 ? 'dia' : 'dias'} com baixa ocupação.</span> : null}
                {readyToReturn ? <span><RotateCcw size={16} /> {readyToReturn} {readyToReturn === 1 ? 'cliente pode estar' : 'clientes podem estar'} próximo{readyToReturn === 1 ? '' : 's'} do período de retorno.</span> : null}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
