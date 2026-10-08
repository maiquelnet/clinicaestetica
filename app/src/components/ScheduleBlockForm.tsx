import { Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toInputDate, toInputDateTime } from '../lib/format'
import {
  BLOCK_TYPE_LABELS,
  DEFAULT_RECURRENCE,
  presetForRecurrence,
  recurrenceForPreset,
  type RecurrencePreset,
  type ScheduleBlockDraft,
} from '../lib/schedule-blocks'
import type { ScheduleBlock, ScheduleBlockRecurrence, ScheduleBlockType } from '../lib/types'

const weekdays = [
  { value: 1, label: 'SEG' },
  { value: 2, label: 'TER' },
  { value: 3, label: 'QUA' },
  { value: 4, label: 'QUI' },
  { value: 5, label: 'SEX' },
  { value: 6, label: 'SÁB' },
  { value: 0, label: 'DOM' },
]

function baseDateTime(date: Date, hour: number) {
  const value = new Date(date)
  value.setHours(hour, 0, 0, 0)
  return toInputDateTime(value)
}

function initialDraft(block: ScheduleBlock | null, date: Date): ScheduleBlockDraft {
  const start = block ? new Date(block.inicio_em) : new Date(baseDateTime(date, 9))
  const end = block ? new Date(block.fim_em) : new Date(baseDateTime(date, 10))
  const storedRecurrence = block?.recorrencia || null
  const repetition = presetForRecurrence(storedRecurrence)
  return {
    tipo: block?.tipo || 'particular',
    titulo: block?.titulo || '',
    inicio_em: block?.inicio_em ? toInputDateTime(start) : baseDateTime(date, 9),
    fim_em: block?.fim_em ? toInputDateTime(end) : baseDateTime(date, 10),
    dia_inteiro: block?.dia_inteiro || false,
    repetition,
    recurrence: storedRecurrence || recurrenceForPreset(repetition, start),
  }
}

function recurrenceOrDefault(recurrence: ScheduleBlockRecurrence | null) {
  return recurrence || { ...DEFAULT_RECURRENCE }
}

export function ScheduleBlockForm({
  block,
  date,
  onClose,
  onSubmit,
  onDelete,
  saving = false,
  error,
}: {
  block: ScheduleBlock | null
  date: Date
  onClose: () => void
  onSubmit: (draft: ScheduleBlockDraft) => void
  onDelete?: () => void
  saving?: boolean
  error?: string | null
}) {
  const [draft, setDraft] = useState(() => initialDraft(block, date))
  const recurrence = recurrenceOrDefault(draft.recurrence)
  const dateValue = draft.inicio_em.slice(0, 10) || toInputDate(date)
  const startTime = draft.inicio_em.slice(11, 16) || '09:00'
  const endTime = draft.fim_em.slice(11, 16) || '10:00'

  function updateDateTime(part: 'date' | 'start' | 'end', value: string) {
    if (part === 'date') {
      const nextStart = `${value}T${startTime}`
      const nextEnd = `${value}T${endTime}`
      setDraft((current) => ({ ...current, inicio_em: nextStart, fim_em: nextEnd }))
      return
    }
    setDraft((current) => ({ ...current, [part === 'start' ? 'inicio_em' : 'fim_em']: `${dateValue}T${value}` }))
  }

  function updateRecurrence(changes: Partial<ScheduleBlockRecurrence>) {
    setDraft((current) => ({ ...current, recurrence: { ...recurrenceOrDefault(current.recurrence), ...changes } }))
  }

  function changeRepetition(next: RecurrencePreset) {
    const nextRecurrence = recurrenceForPreset(next, new Date(draft.inicio_em))
    setDraft((current) => ({ ...current, repetition: next, recurrence: nextRecurrence }))
  }

  function toggleWeekday(day: number) {
    const next = recurrence.weekdays.includes(day)
      ? recurrence.weekdays.filter((item) => item !== day)
      : [...recurrence.weekdays, day].sort((a, b) => a - b)
    updateRecurrence({ weekdays: next })
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const start = new Date(draft.inicio_em)
    let end = new Date(draft.fim_em)
    if (draft.dia_inteiro) {
      start.setHours(0, 0, 0, 0)
      end = new Date(start)
      end.setDate(end.getDate() + 1)
    }
    if (!draft.titulo.trim()) return
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return
    onSubmit({
      ...draft,
      titulo: draft.titulo.trim(),
      inicio_em: toInputDateTime(start),
      fim_em: toInputDateTime(end),
      recurrence: draft.repetition === 'none' ? null : recurrence,
    })
  }

  return (
    <div className="sheet-layer" role="presentation">
      <button className="sheet-overlay" type="button" aria-label="Fechar bloqueio" onClick={onClose} />
      <form className="bottom-sheet schedule-block-form" onSubmit={submit}>
        <div className="sheet-handle" />
        <header>
          <div><p className="eyebrow">Agenda</p><h2>{block ? 'Editar bloqueio' : 'Bloquear agenda'}</h2></div>
          <button className="icon-button" type="button" aria-label="Fechar bloqueio" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="sheet-form-grid">
          <label>
            Tipo
            <select value={draft.tipo} onChange={(event) => setDraft((current) => ({ ...current, tipo: event.target.value as ScheduleBlockType }))}>
              {Object.entries(BLOCK_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Descrição do compromisso
            <input required value={draft.titulo} onChange={(event) => setDraft((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Consulta médica" />
            <small className="field-help">Visível apenas na agenda administrativa.</small>
          </label>

          <label>Data<input type="date" value={dateValue} onChange={(event) => updateDateTime('date', event.target.value)} /></label>
          {!draft.dia_inteiro ? (
            <div className="form-grid">
              <label>Início<input type="time" value={startTime} onChange={(event) => updateDateTime('start', event.target.value)} /></label>
              <label>Fim<input type="time" value={endTime} onChange={(event) => updateDateTime('end', event.target.value)} /></label>
            </div>
          ) : <p className="all-day-note">O dia inteiro ficará indisponível para novos atendimentos.</p>}
          <label className="check-row"><input type="checkbox" checked={draft.dia_inteiro} onChange={(event) => setDraft((current) => ({ ...current, dia_inteiro: event.target.checked }))} /> Bloquear dia inteiro</label>

          <label>
            Repetição
            <select value={draft.repetition} onChange={(event) => changeRepetition(event.target.value as RecurrencePreset)}>
              <option value="none">Não repetir</option>
              <option value="daily">Todos os dias</option>
              <option value="weekly">Toda semana</option>
              <option value="monthly">Todo mês</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>

          {draft.repetition !== 'none' ? (
            <div className="recurrence-options">
              {draft.repetition === 'custom' ? (
                <div className="form-grid recurrence-frequency">
                  <label>Repetir a cada<input type="number" min={1} value={recurrence.interval} onChange={(event) => updateRecurrence({ interval: Math.max(1, Number(event.target.value) || 1) })} /></label>
                  <label>Unidade<select value={recurrence.unit} onChange={(event) => updateRecurrence({ unit: event.target.value as ScheduleBlockRecurrence['unit'] })}><option value="day">dia</option><option value="week">semana</option><option value="month">mês</option></select></label>
                </div>
              ) : null}
              {draft.repetition === 'custom' && recurrence.unit === 'week' ? (
                <fieldset className="weekday-picker"><legend>Dias</legend><div>{weekdays.map((day) => <label key={day.value} className={recurrence.weekdays.includes(day.value) ? 'selected' : ''}><input type="checkbox" checked={recurrence.weekdays.includes(day.value)} onChange={() => toggleWeekday(day.value)} />{day.label}</label>)}</div></fieldset>
              ) : null}
              <label>
                Termina
                <select value={recurrence.ends} onChange={(event) => updateRecurrence({ ends: event.target.value as ScheduleBlockRecurrence['ends'] })}>
                  <option value="never">Nunca</option>
                  <option value="date">Em uma data</option>
                  <option value="occurrences">Após X ocorrências</option>
                </select>
              </label>
              {recurrence.ends === 'date' ? <label>Até<input type="date" value={recurrence.endDate || dateValue} min={dateValue} onChange={(event) => updateRecurrence({ endDate: event.target.value })} /></label> : null}
              {recurrence.ends === 'occurrences' ? <label>Quantidade<input type="number" min={1} value={recurrence.occurrenceCount || 1} onChange={(event) => updateRecurrence({ occurrenceCount: Math.max(1, Number(event.target.value) || 1) })} /></label> : null}
            </div>
          ) : null}
        </div>

        {error ? <div className="form-alert">{error}</div> : null}
        <div className="schedule-block-actions">
          {onDelete ? <button className="danger-button" type="button" onClick={onDelete} disabled={saving}><Trash2 size={16} /> Excluir bloqueio</button> : null}
          <button className="gold-button sheet-submit" type="submit" disabled={saving}>{saving ? 'Salvando…' : block ? 'Salvar bloqueio' : 'Bloquear agenda'}</button>
        </div>
      </form>
    </div>
  )
}
