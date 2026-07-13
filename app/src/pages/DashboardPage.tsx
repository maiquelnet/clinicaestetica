import { useQuery } from '@tanstack/react-query'
import { addDays, endOfDay, format, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarPlus, CircleDollarSign, Clock3, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadingBlock } from '../components/Ui'
import { PageHeader } from '../components/PageHeader'
import { useClinic } from '../contexts/useClinic'
import { formatMoney, formatTime, toInputDate } from '../lib/format'
import { supabase } from '../lib/supabase'
import type {
  Appointment,
  CampaignRecipient,
  Client,
  ClientReview,
  FinancialMovement,
  Service,
  StockItem,
  WaitlistEntry,
} from '../lib/types'

async function fetchDashboard(clinicId: string) {
  const todayStart = startOfDay(new Date()).toISOString()
  const today = toInputDate()
  const weekEnd = endOfDay(addDays(new Date(), 6)).toISOString()

  const [clients, services, appointments, finances, waitlist, stockItems, recipients, reviews] = await Promise.all([
    supabase
      .from('clientes')
      .select('id,ativo')
      .eq('clinica_id', clinicId)
      .is('arquivado_em', null),
    supabase
      .from('servicos')
      .select('id,ativo')
      .eq('clinica_id', clinicId)
      .is('arquivado_em', null),
    supabase
      .from('agendamentos')
      .select('*,clientes(id,nome,telefone),servicos(id,nome,categoria,duracao_minutos)')
      .eq('clinica_id', clinicId)
      .gte('inicio_em', todayStart)
      .lte('inicio_em', weekEnd)
      .is('arquivado_em', null)
      .order('inicio_em', { ascending: true }),
    supabase
      .from('movimentacoes_financeiras')
      .select('*')
      .eq('clinica_id', clinicId)
      .lte('vencimento_em', weekEnd.slice(0, 10))
      .is('arquivado_em', null),
    supabase
      .from('lista_espera')
      .select('*')
      .eq('clinica_id', clinicId)
      .eq('status', 'em_espera')
      .is('arquivado_em', null),
    supabase
      .from('itens_estoque')
      .select('*')
      .eq('clinica_id', clinicId)
      .eq('ativo', true)
      .is('arquivado_em', null),
    supabase
      .from('destinatarios_campanhas')
      .select('*')
      .eq('clinica_id', clinicId)
      .eq('status', 'pendente'),
    supabase
      .from('avaliacoes_clientes')
      .select('*')
      .eq('clinica_id', clinicId)
      .is('arquivado_em', null)
      .order('avaliado_em', { ascending: false })
      .limit(20),
  ])

  if (clients.error) throw clients.error
  if (services.error) throw services.error
  if (appointments.error) throw appointments.error
  if (finances.error) throw finances.error
  if (waitlist.error) throw waitlist.error
  if (stockItems.error) throw stockItems.error
  if (recipients.error) throw recipients.error
  if (reviews.error) throw reviews.error

  return {
    clients: (clients.data || []) as Pick<Client, 'id' | 'ativo'>[],
    services: (services.data || []) as Pick<Service, 'id' | 'ativo'>[],
    appointments: (appointments.data || []) as Appointment[],
    finances: (finances.data || []) as FinancialMovement[],
    waitlist: (waitlist.data || []) as WaitlistEntry[],
    stockItems: (stockItems.data || []) as StockItem[],
    recipients: (recipients.data || []) as CampaignRecipient[],
    reviews: (reviews.data || []) as ClientReview[],
    today,
  }
}

const hours = Array.from({ length: 12 }, (_item, index) => `${String(index + 8).padStart(2, '0')}:00`)

export function DashboardPage() {
  const { activeClinicId, profile } = useClinic()
  const query = useQuery({
    queryKey: ['dashboard', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: () => fetchDashboard(activeClinicId!),
  })

  const today = startOfDay(new Date())
  const appointments = query.data?.appointments ?? []
  const finances = query.data?.finances ?? []
  const todayAppointments = appointments.filter((appointment) => {
    const date = new Date(appointment.inicio_em)
    return date >= today && date <= endOfDay(today)
  })
  const weekAppointments = appointments.filter((appointment) => appointment.status !== 'cancelado')
  const nextAppointment = appointments.find((appointment) => new Date(appointment.inicio_em) >= new Date())
  const estimatedToday = todayAppointments.reduce((sum, appointment) => appointment.status === 'cancelado' ? sum : sum + Number(appointment.valor_aplicado || 0), 0)
  const cashToday = finances
    .filter((item) => item.status === 'pago' && item.pago_em === query.data?.today)
    .reduce((sum, item) => sum + (item.tipo === 'receita' ? Number(item.valor || 0) : -Number(item.valor || 0)), 0)
  const receivableWeek = finances
    .filter((item) => item.tipo === 'receita' && item.status === 'pendente')
    .reduce((sum, item) => sum + Number(item.valor || 0), 0)
  const overdueBills = finances.filter((item) => item.status === 'pendente' && item.vencimento_em && item.vencimento_em < (query.data?.today || '')).length
  const lowStock = (query.data?.stockItems || []).filter((item) => Number(item.quantidade_atual) <= Number(item.estoque_minimo)).length
  const avgReview = query.data?.reviews.length
    ? query.data.reviews.reduce((sum, review) => sum + review.nota, 0) / query.data.reviews.length
    : 0
  const confirmed = todayAppointments.filter((appointment) => appointment.status === 'confirmado').length
  const inProgress = todayAppointments.filter((appointment) => appointment.status === 'em_atendimento').length

  return (
    <main className="content-page operational-page">
      <PageHeader
        eyebrow={format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
        title={`Bom dia, ${profile?.nome?.split(' ')[0] || 'Thais'}.`}
        description={`Você tem ${todayAppointments.length} atendimentos hoje e ${query.data?.waitlist.length ?? 0} encaixes pendentes.`}
        actions={
          <Link className="primary-button compact-action" to="/agenda">
            <CalendarPlus size={16} />
            Novo agendamento
          </Link>
        }
      />

      {query.isLoading ? (
        <LoadingBlock />
      ) : (
        <>
          <section className="ops-metrics">
            <article><CalendarPlus size={17} /><span>Agenda hoje</span><strong>{todayAppointments.length}</strong></article>
            <article><Clock3 size={17} /><span>Agenda semana</span><strong>{weekAppointments.length}</strong></article>
            <article><Users size={17} /><span>Fila de espera</span><strong>{query.data?.waitlist.length ?? 0}</strong></article>
            <article><CircleDollarSign size={17} /><span>Caixa hoje</span><strong>{formatMoney(cashToday)}</strong></article>
            <article><Sparkles size={17} /><span>A receber</span><strong>{formatMoney(receivableWeek)}</strong></article>
          </section>

          <section className="ops-metrics">
            <article><Clock3 size={17} /><span>Confirmados</span><strong>{confirmed}</strong></article>
            <article><Users size={17} /><span>Em atendimento</span><strong>{inProgress}</strong></article>
            <article><CircleDollarSign size={17} /><span>Previsto hoje</span><strong>{formatMoney(estimatedToday)}</strong></article>
            <article><Sparkles size={17} /><span>Estoque baixo</span><strong>{lowStock}</strong></article>
            <article><CalendarPlus size={17} /><span>Disparos</span><strong>{query.data?.recipients.length ?? 0}</strong></article>
          </section>

          <section className="ops-grid">
            <article className="panel calendar-panel">
              <div className="panel-header compact-header">
                <div>
                  <h2>Agenda de hoje</h2>
                  <span>{todayAppointments.length} atendimentos no dia</span>
                </div>
                <Link className="ghost-link" to="/agenda">Ver semana</Link>
              </div>

              {todayAppointments.length ? (
                <div className="day-calendar">
                  {hours.map((hour) => {
                    const hourAppointments = todayAppointments.filter((appointment) => format(new Date(appointment.inicio_em), 'HH:00') === hour)
                    return (
                      <div className="calendar-row" key={hour}>
                        <time>{hour}</time>
                        <div className="calendar-slot">
                          {hourAppointments.map((appointment) => (
                            <article className={`calendar-event ${appointment.status}`} key={appointment.id}>
                              <strong>{formatTime(appointment.inicio_em)} - {appointment.clientes?.nome}</strong>
                              <span>{appointment.servicos?.nome}</span>
                              <small>{formatMoney(appointment.valor_aplicado)} - {appointment.status.replace('_', ' ')}</small>
                            </article>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyState title="Nenhum atendimento hoje" />
              )}
            </article>

            <aside className="side-stack">
              <article className="panel compact-panel">
                <div className="panel-header compact-header"><h2>Proximo atendimento</h2></div>
                {nextAppointment ? (
                  <div className="next-appointment compact-next">
                    <time>{formatTime(nextAppointment.inicio_em)}</time>
                    <strong>{nextAppointment.clientes?.nome}</strong>
                    <span>{nextAppointment.servicos?.nome}</span>
                    <span className={`badge ${nextAppointment.status}`}>{nextAppointment.status.replace('_', ' ')}</span>
                  </div>
                ) : (
                  <EmptyState title="Sem proximo horario" />
                )}
              </article>

              <article className="panel compact-panel">
                <div className="panel-header compact-header"><h2>Pendencias rapidas</h2></div>
                <div className="task-list">
                  <span>Clientes ativos: {query.data?.clients.filter((client) => client.ativo).length ?? 0}</span>
                  <span>Confirmacoes pendentes: {todayAppointments.filter((item) => item.status === 'agendado').length}</span>
                  <span>Contas vencidas: {overdueBills}</span>
                  <span>Avaliacao media: {avgReview.toFixed(1)}</span>
                </div>
              </article>
            </aside>
          </section>
        </>
      )}
    </main>
  )
}
