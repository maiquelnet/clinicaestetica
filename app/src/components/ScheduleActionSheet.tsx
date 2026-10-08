import { CalendarClock, CalendarOff, X } from 'lucide-react'

export function ScheduleActionSheet({
  onClose,
  onNewAppointment,
  onBlockAgenda,
}: {
  onClose: () => void
  onNewAppointment: () => void
  onBlockAgenda: () => void
}) {
  return (
    <div className="sheet-layer" role="presentation">
      <button className="sheet-overlay" type="button" aria-label="Fechar opções" onClick={onClose} />
      <section className="bottom-sheet schedule-action-sheet" role="dialog" aria-modal="true" aria-labelledby="schedule-action-title">
        <div className="sheet-handle" />
        <header>
          <div>
            <p className="eyebrow">Agenda</p>
            <h2 id="schedule-action-title">O que você quer fazer?</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Fechar opções" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="schedule-action-options">
          <button className="schedule-action-option" type="button" onClick={onNewAppointment}>
            <span className="schedule-action-icon"><CalendarClock size={20} /></span>
            <span><strong>Novo atendimento</strong><small>Reserve um horário para uma cliente</small></span>
          </button>
          <button className="schedule-action-option" type="button" onClick={onBlockAgenda}>
            <span className="schedule-action-icon block"><CalendarOff size={20} /></span>
            <span><strong>Bloquear agenda</strong><small>Marque um período indisponível</small></span>
          </button>
        </div>
      </section>
    </div>
  )
}
