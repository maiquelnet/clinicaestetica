import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Check, Copy, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../../../components/PageHeader'
import { useClinic } from '../../../contexts/useClinic'
import { availabilityRows, cloneAvailability, copyAvailabilityToDays, draftFromRows, suggestedAvailability, validateAvailability, validateAvailabilityException, WEEKDAYS, type AvailabilityDraft, type AvailabilityPeriod } from '../../../lib/availability'
import { deleteAvailabilityException, saveAvailabilityException, saveWeeklyAvailability } from '../../../lib/rpc'
import { supabase } from '../../../lib/supabase'
import type { AvailabilityException, AvailabilityExceptionPeriod } from '../../../lib/types'

type ProfessionalOption = { perfil_id: string; nome: string; email: string; papel: string }
type ExceptionForm = { id: string | null; data: string; naoAtende: boolean; observacao: string; periodos: AvailabilityPeriod[] }

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

function localDateValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return year && month && day ? `${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year}` : value
}

function dateWeekday(value: string) {
  return new Date(`${value}T12:00:00`).getDay()
}

function isPastDate(value: string) {
  return value < localDateValue()
}

function periodWithoutIdentity(period: AvailabilityPeriod, day: number): AvailabilityPeriod {
  return { dia_semana: day, inicio: period.inicio.slice(0, 5), fim: period.fim.slice(0, 5) }
}

function emptyPeriod(day: number): AvailabilityPeriod {
  return { dia_semana: day, inicio: '08:00', fim: '12:00' }
}

export function AvailabilityPage() {
  const { activeClinicId, activeMembership, profile } = useClinic()
  const queryClient = useQueryClient()
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [draft, setDraft] = useState<AvailabilityDraft>(() => cloneAvailability(suggestedAvailability))
  const [copySourceDay, setCopySourceDay] = useState<number | null>(null)
  const [copyTargets, setCopyTargets] = useState<number[]>([])
  const [dirty, setDirty] = useState(false)
  const [exceptionForm, setExceptionForm] = useState<ExceptionForm | null>(null)

  const canManageOthers = ['proprietario', 'administrador'].includes(activeMembership?.papel || '')
  const professionalsQuery = useQuery({
    queryKey: ['availability-professionals', activeClinicId],
    enabled: Boolean(activeClinicId && canManageOthers),
    queryFn: async () => {
      const { data, error } = await supabase.from('usuarios_clinicas').select('perfil_id,papel,perfis(id,nome,email)').eq('clinica_id', activeClinicId!).eq('ativo', true).order('criado_em', { ascending: true })
      if (error) throw error
      return ((data || []) as Array<{ perfil_id: string; papel: string; perfis: { id: string; nome: string; email: string } | Array<{ id: string; nome: string; email: string }> | null }>).map((item) => {
        const person = Array.isArray(item.perfis) ? item.perfis[0] : item.perfis
        return person ? { perfil_id: item.perfil_id, nome: person.nome, email: person.email, papel: item.papel } : null
      }).filter((item): item is ProfessionalOption => Boolean(item))
    },
  })

  const professionalOptions = useMemo(() => {
    if (!canManageOthers && activeMembership?.perfil_id && profile) return [{ perfil_id: activeMembership.perfil_id, nome: profile.nome, email: profile.email, papel: activeMembership.papel }]
    return professionalsQuery.data || []
  }, [activeMembership, canManageOthers, profile, professionalsQuery.data])

  const targetProfileId = canManageOthers ? selectedProfileId || activeMembership?.perfil_id || '' : activeMembership?.perfil_id || ''

  useEffect(() => {
    setSelectedProfileId(activeMembership?.perfil_id || '')
  }, [activeClinicId, activeMembership?.perfil_id])

  const availabilityQuery = useQuery({
    queryKey: ['weekly-availability', activeClinicId, targetProfileId],
    enabled: Boolean(activeClinicId && targetProfileId),
    queryFn: async () => {
      const { data, error } = await supabase.from('disponibilidade_semanal').select('id,clinica_id,profissional_id,dia_semana,inicio,fim,criado_em,atualizado_em').eq('clinica_id', activeClinicId!).eq('profissional_id', targetProfileId).order('dia_semana').order('inicio')
      if (error) throw error
      return (data || []) as AvailabilityPeriod[]
    },
  })

  useEffect(() => {
    if (!availabilityQuery.isSuccess) return
    setDraft(availabilityQuery.data.length ? draftFromRows(availabilityQuery.data) : cloneAvailability(suggestedAvailability))
    setDirty(false)
  }, [availabilityQuery.data, availabilityQuery.isSuccess, targetProfileId])

  const exceptionsQuery = useQuery({
    queryKey: ['availability-exceptions', activeClinicId, targetProfileId],
    enabled: Boolean(activeClinicId && targetProfileId),
    queryFn: async () => {
      const { data: exceptions, error: exceptionError } = await supabase.from('disponibilidade_excecoes').select('id,clinica_id,profissional_id,data,nao_atende,observacao,criado_em,atualizado_em').eq('clinica_id', activeClinicId!).eq('profissional_id', targetProfileId).order('data', { ascending: true })
      if (exceptionError) throw exceptionError
      const rows = (exceptions || []) as AvailabilityException[]
      if (!rows.length) return rows
      const { data: periods, error: periodError } = await supabase.from('disponibilidade_excecao_periodos').select('id,clinica_id,excecao_id,inicio,fim,criado_em,atualizado_em').eq('clinica_id', activeClinicId!).in('excecao_id', rows.map((row) => row.id)).order('inicio')
      if (periodError) throw periodError
      const periodsByException = new Map<string, AvailabilityExceptionPeriod[]>()
      for (const period of (periods || []) as AvailabilityExceptionPeriod[]) periodsByException.set(period.excecao_id, [...(periodsByException.get(period.excecao_id) || []), period])
      return rows.map((row) => ({ ...row, periodos: periodsByException.get(row.id) || [] }))
    },
  })

  const sortedExceptions = useMemo(() => [...(exceptionsQuery.data || [])].sort((a, b) => Number(isPastDate(a.data)) - Number(isPastDate(b.data)) || a.data.localeCompare(b.data)), [exceptionsQuery.data])

  const save = useMutation({
    mutationFn: async () => {
      if (!activeClinicId || !targetProfileId) throw new Error('Profissional não encontrado.')
      const validationError = validateAvailability(draft)
      if (validationError) throw new Error(validationError)
      await saveWeeklyAvailability({ p_clinica_id: activeClinicId, p_profissional_id: targetProfileId, p_periodos: availabilityRows(draft) })
    },
    onSuccess: async () => {
      setDirty(false)
      await queryClient.invalidateQueries({ queryKey: ['weekly-availability', activeClinicId, targetProfileId] })
    },
  })

  const saveException = useMutation({
    mutationFn: async (form: ExceptionForm) => {
      if (!activeClinicId || !targetProfileId) throw new Error('Profissional não encontrado.')
      if (!form.data) throw new Error('Informe a data da exceção.')
      const validationError = validateAvailabilityException({ nao_atende: form.naoAtende, periodos: form.periodos })
      if (validationError) throw new Error(validationError)
      await saveAvailabilityException({ p_excecao_id: form.id, p_clinica_id: activeClinicId, p_profissional_id: targetProfileId, p_data: form.data, p_nao_atende: form.naoAtende, p_observacao: form.observacao.trim() || null, p_periodos: form.naoAtende ? [] : form.periodos.map(({ inicio, fim }) => ({ inicio, fim })) })
    },
    onSuccess: async () => {
      setExceptionForm(null)
      await queryClient.invalidateQueries({ queryKey: ['availability-exceptions', activeClinicId, targetProfileId] })
    },
  })

  const deleteException = useMutation({
    mutationFn: async (exception: AvailabilityException) => {
      if (!activeClinicId || !targetProfileId) throw new Error('Profissional não encontrado.')
      await deleteAvailabilityException({ p_excecao_id: exception.id, p_clinica_id: activeClinicId, p_profissional_id: targetProfileId })
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['availability-exceptions', activeClinicId, targetProfileId] }),
  })

  function updateDraft(next: AvailabilityDraft) { setDraft(next); setDirty(true) }

  function updatePeriod(day: number, index: number, field: 'inicio' | 'fim', value: string) {
    const next = cloneAvailability(draft)
    const current = next[day]?.[index]
    if (!current) return
    current[field] = value
    updateDraft(next)
  }

  function addPeriod(day: number) {
    const next = cloneAvailability(draft)
    next[day] = [...(next[day] || []), emptyPeriod(day)]
    updateDraft(next)
  }

  function removePeriod(day: number, index: number) {
    const next = cloneAvailability(draft)
    next[day] = (next[day] || []).filter((_, periodIndex) => periodIndex !== index)
    updateDraft(next)
  }

  function openCopySheet(day: number) { setCopySourceDay(day); setCopyTargets([]) }
  function closeCopySheet() { setCopySourceDay(null); setCopyTargets([]) }

  function applyCopy() {
    if (copySourceDay === null || !copyTargets.length) return
    updateDraft(copyAvailabilityToDays(draft, copySourceDay, copyTargets))
    closeCopySheet()
  }

  function weeklyPeriodsForDate(date: string) {
    const day = dateWeekday(date)
    return (draft[day] || []).map((period) => periodWithoutIdentity(period, day))
  }

  function openNewException() {
    const date = localDateValue()
    setExceptionForm({ id: null, data: date, naoAtende: false, observacao: '', periodos: weeklyPeriodsForDate(date) })
  }

  function openEditException(exception: AvailabilityException & { periodos?: AvailabilityExceptionPeriod[] }) {
    setExceptionForm({ id: exception.id, data: exception.data, naoAtende: exception.nao_atende, observacao: exception.observacao || '', periodos: (exception.periodos || []).map((period) => ({ dia_semana: dateWeekday(exception.data), inicio: period.inicio.slice(0, 5), fim: period.fim.slice(0, 5) })) })
  }

  function changeExceptionDate(value: string) {
    setExceptionForm((current) => current ? { ...current, data: value, periodos: current.id ? current.periodos : weeklyPeriodsForDate(value) } : current)
  }

  function updateExceptionPeriod(index: number, field: 'inicio' | 'fim', value: string) {
    setExceptionForm((current) => {
      if (!current) return current
      return { ...current, periodos: current.periodos.map((period, periodIndex) => periodIndex === index ? { ...period, [field]: value } : period) }
    })
  }

  function addExceptionPeriod() {
    setExceptionForm((current) => current ? { ...current, naoAtende: false, periodos: [...current.periodos, emptyPeriod(dateWeekday(current.data))] } : current)
  }

  function removeExceptionPeriod(index: number) {
    setExceptionForm((current) => current ? { ...current, periodos: current.periodos.filter((_, periodIndex) => periodIndex !== index) } : current)
  }

  const selectedProfessional = professionalOptions.find((item) => item.perfil_id === targetProfileId)
  const loading = availabilityQuery.isLoading || professionalsQuery.isLoading

  return (
    <main className="content-page">
      <PageHeader eyebrow="Configurações" title="Horários de atendimento" description="Defina os períodos em que você normalmente recebe clientes." />
      {canManageOthers ? <section className="panel availability-professional-panel"><label htmlFor="availability-professional">Profissional</label><select id="availability-professional" value={targetProfileId} onChange={(event) => { setSelectedProfileId(event.target.value); setDirty(false) }}>{professionalOptions.map((item) => <option key={item.perfil_id} value={item.perfil_id}>{item.nome}</option>)}</select><small>Você pode configurar a sua disponibilidade e a de outros profissionais vinculados a esta clínica.</small></section> : null}
      <section className="panel form-panel availability-panel">
        <div className="availability-intro"><div><h2>{selectedProfessional?.nome || 'Sua disponibilidade semanal'}</h2><p>Um dia sem períodos cadastrados significa que não atende normalmente nesse dia.</p></div><span className="availability-timezone">Horários locais da clínica</span></div>
        {loading ? <div className="loading-block">Carregando horários...</div> : <div className="availability-week">{WEEKDAYS.map((day) => {
          const periods = draft[day.value] || []
          return <article className="availability-day" key={day.value}><div className="availability-day-header"><div><strong>{day.label}</strong><span>{periods.length ? `${periods.length} ${periods.length === 1 ? 'período' : 'períodos'}` : 'Não atende'}</span></div>{periods.length ? <button className="ghost-button compact-action" type="button" onClick={() => openCopySheet(day.value)}><Copy size={15} /> Copiar</button> : null}</div>{periods.length ? <div className="availability-period-list">{periods.map((period, index) => <div className="availability-period" key={period.id || `${day.value}-${index}`}><label><span className="sr-only">Início {day.label}, período {index + 1}</span><input type="time" value={period.inicio} onChange={(event) => updatePeriod(day.value, index, 'inicio', event.target.value)} /></label><span className="availability-separator">até</span><label><span className="sr-only">Fim {day.label}, período {index + 1}</span><input type="time" value={period.fim} onChange={(event) => updatePeriod(day.value, index, 'fim', event.target.value)} /></label><button className="icon-button availability-remove" type="button" aria-label={`Remover período ${index + 1} de ${day.label}`} onClick={() => removePeriod(day.value, index)}><Trash2 size={17} /></button></div>)}</div> : <p className="availability-empty">Nenhum horário configurado.</p>}<button className="ghost-link availability-add" type="button" onClick={() => addPeriod(day.value)}><Plus size={16} /> Adicionar período</button></article>
        })}</div>}
        <div className="availability-footer"><p>{availabilityQuery.data?.length ? 'Sua configuração está salva. Você pode ajustá-la quando quiser.' : 'Sugestão inicial: segunda a sexta, das 08:00 às 12:00 e das 13:00 às 18:00. Nada é salvo até você confirmar.'}</p>{save.error ? <div className="form-alert" role="alert">{save.error.message}</div> : null}{save.isSuccess && !dirty ? <div className="form-success" role="status"><Check size={16} /> Disponibilidade salva.</div> : null}<button className="primary-button" type="button" disabled={loading || save.isPending || !targetProfileId} onClick={() => void save.mutateAsync()}><Save size={16} /> {save.isPending ? 'Salvando...' : 'Salvar horários'}</button></div>
      </section>
      <section className="panel form-panel availability-exceptions-panel"><div className="availability-exceptions-header"><div><p className="eyebrow">Disponibilidade por data</p><h2>Exceções de horário</h2><p>Defina dias em que seus horários serão diferentes do habitual.</p></div><button className="primary-button" type="button" disabled={loading} onClick={openNewException}><Plus size={16} /> Adicionar exceção</button></div>
        {exceptionsQuery.isLoading ? <div className="loading-block">Carregando exceções...</div> : exceptionsQuery.error ? <div className="form-alert" role="alert">{(exceptionsQuery.error as Error).message}</div> : sortedExceptions.length ? <div className="availability-exception-list">{sortedExceptions.map((exception) => <article className={`availability-exception-card${isPastDate(exception.data) ? ' is-past' : ''}`} key={exception.id}><div className="availability-exception-date"><CalendarDays size={18} /><strong>{dateLabel(exception.data)}</strong><span>{isPastDate(exception.data) ? 'Passada' : 'Próxima'}</span></div><div className="availability-exception-content"><strong>{exception.nao_atende ? 'Não atende' : (exception.periodos || []).map((period) => `${period.inicio.slice(0, 5)}–${period.fim.slice(0, 5)}`).join(' · ')}</strong>{exception.observacao ? <p>{exception.observacao}</p> : <p>{exception.nao_atende ? 'Disponibilidade comercial zero nesta data.' : 'Horário especial'}</p>}</div><div className="record-actions"><button className="ghost-button" type="button" onClick={() => openEditException(exception)}><Pencil size={15} /> Editar</button><button className="icon-button availability-remove" type="button" aria-label={`Excluir exceção de ${dateLabel(exception.data)}`} disabled={deleteException.isPending} onClick={() => { if (window.confirm(`Excluir a exceção de ${dateLabel(exception.data)}? A data voltará a usar o horário semanal.`)) deleteException.mutate(exception) }}><Trash2 size={17} /></button></div></article>)}</div> : <div className="availability-exceptions-empty"><CalendarDays size={21} /><div><strong>Nenhuma exceção cadastrada</strong><p>Quando um dia fugir do padrão, adicione a alteração aqui.</p></div></div>}
        {deleteException.error ? <div className="form-alert" role="alert">{(deleteException.error as Error).message}</div> : null}
      </section>
      {copySourceDay !== null ? <div className="sheet-layer availability-copy-layer"><button className="sheet-overlay" type="button" aria-label="Fechar cópia de horários" onClick={closeCopySheet} /><section className="bottom-sheet availability-copy-sheet" role="dialog" aria-modal="true" aria-labelledby="copy-availability-title"><div className="sheet-handle" /><header><div><p className="eyebrow">Disponibilidade semanal</p><h2 id="copy-availability-title">Copiar horários</h2></div><button className="icon-button" type="button" aria-label="Fechar" onClick={closeCopySheet}><X size={20} /></button></header><p>Copiar os períodos de {WEEKDAYS[copySourceDay]?.label.toLowerCase()} para:</p><div className="availability-copy-grid">{WEEKDAYS.filter((day) => day.value !== copySourceDay).map((day) => <label className="availability-copy-option" key={day.value}><input type="checkbox" checked={copyTargets.includes(day.value)} onChange={(event) => setCopyTargets((current) => event.target.checked ? [...current, day.value] : current.filter((value) => value !== day.value))} /><span>{day.label}</span></label>)}</div><button className="primary-button sheet-submit" type="button" disabled={!copyTargets.length} onClick={applyCopy}><Copy size={16} /> Copiar períodos</button></section></div> : null}
      {exceptionForm ? <div className="sheet-layer availability-exception-layer"><button className="sheet-overlay" type="button" aria-label="Fechar exceção" onClick={() => setExceptionForm(null)} /><section className="bottom-sheet availability-exception-sheet" role="dialog" aria-modal="true" aria-labelledby="exception-title"><div className="sheet-handle" /><header><div><p className="eyebrow">Disponibilidade por data</p><h2 id="exception-title">{exceptionForm.id ? 'Editar exceção' : 'Adicionar exceção'}</h2></div><button className="icon-button" type="button" aria-label="Fechar" onClick={() => setExceptionForm(null)}><X size={20} /></button></header><div className="availability-exception-form"><label>Data<input type="date" value={exceptionForm.data} onChange={(event) => changeExceptionDate(event.target.value)} /></label><fieldset><legend>Como será este dia?</legend><label className="availability-radio"><input type="radio" name="exception-mode" checked={!exceptionForm.naoAtende} onChange={() => setExceptionForm((current) => current ? { ...current, naoAtende: false, periodos: current.periodos.length ? current.periodos : weeklyPeriodsForDate(current.data) } : current)} /> Horários diferentes</label><label className="availability-radio"><input type="radio" name="exception-mode" checked={exceptionForm.naoAtende} onChange={() => setExceptionForm((current) => current ? { ...current, naoAtende: true, periodos: [] } : current)} /> Não atenderei neste dia</label></fieldset>{!exceptionForm.naoAtende ? <div className="availability-exception-periods"><div className="availability-exception-periods-header"><strong>Períodos desta data</strong><span>O padrão semanal foi usado como ponto de partida.</span></div>{exceptionForm.periodos.map((period, index) => <div className="availability-period" key={`${index}-${period.inicio}`}><label><span className="sr-only">Início do período {index + 1}</span><input type="time" value={period.inicio} onChange={(event) => updateExceptionPeriod(index, 'inicio', event.target.value)} /></label><span className="availability-separator">até</span><label><span className="sr-only">Fim do período {index + 1}</span><input type="time" value={period.fim} onChange={(event) => updateExceptionPeriod(index, 'fim', event.target.value)} /></label><button className="icon-button availability-remove" type="button" aria-label={`Remover período ${index + 1}`} onClick={() => removeExceptionPeriod(index)}><Trash2 size={17} /></button></div>)}<button className="ghost-link availability-add" type="button" onClick={addExceptionPeriod}><Plus size={16} /> Adicionar período</button></div> : <div className="availability-no-service"><CalendarDays size={18} /><span>Esta data ficará sem disponibilidade comercial.</span></div>}<label>Observação <span className="optional-label">(opcional)</span><textarea rows={2} value={exceptionForm.observacao} onChange={(event) => setExceptionForm((current) => current ? { ...current, observacao: event.target.value } : current)} placeholder="Ex.: Horário reduzido" /></label>{saveException.error ? <div className="form-alert" role="alert">{(saveException.error as Error).message}</div> : null}<button className="primary-button sheet-submit" type="button" disabled={saveException.isPending || !exceptionForm.data} onClick={() => void saveException.mutateAsync(exceptionForm)}><Save size={16} /> {saveException.isPending ? 'Salvando...' : 'Salvar exceção'}</button></div></section></div> : null}
    </main>
  )
}
