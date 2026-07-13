import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '../../../components/PageHeader'
import { useClinic } from '../../../contexts/useClinic'
import { supabase } from '../../../lib/supabase'
import { clean } from '../shared/utils'
export function SettingsPage() {
  const { activeClinic, activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(() => ({
    nome: activeClinic?.nome || '',
    nome_publico: activeClinic?.nome_publico || '',
    telefone: activeClinic?.telefone || '',
    email: activeClinic?.email || '',
    endereco: activeClinic?.endereco || '',
    complemento: activeClinic?.complemento || '',
    cep: activeClinic?.cep || '',
    cidade: activeClinic?.cidade || '',
    estado: activeClinic?.estado || '',
    fuso_horario: activeClinic?.fuso_horario || 'America/Sao_Paulo',
    link_google_avaliacao: activeClinic?.link_google_avaliacao || '',
    google_place_id: activeClinic?.google_place_id || '',
  }))
  useEffect(() => {
    setDraft({
      nome: activeClinic?.nome || '',
      nome_publico: activeClinic?.nome_publico || '',
      telefone: activeClinic?.telefone || '',
      email: activeClinic?.email || '',
      endereco: activeClinic?.endereco || '',
      complemento: activeClinic?.complemento || '',
      cep: activeClinic?.cep || '',
      cidade: activeClinic?.cidade || '',
      estado: activeClinic?.estado || '',
      fuso_horario: activeClinic?.fuso_horario || 'America/Sao_Paulo',
      link_google_avaliacao: activeClinic?.link_google_avaliacao || '',
      google_place_id: activeClinic?.google_place_id || '',
    })
  }, [activeClinic])
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('clinicas').update({ ...draft, nome_publico: clean(draft.nome_publico), telefone: clean(draft.telefone), email: clean(draft.email), endereco: clean(draft.endereco), complemento: clean(draft.complemento), cep: clean(draft.cep), cidade: clean(draft.cidade), estado: clean(draft.estado), link_google_avaliacao: clean(draft.link_google_avaliacao), google_place_id: clean(draft.google_place_id), atualizado_em: new Date().toISOString() }).eq('id', activeClinicId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinic-context'] }),
  })
  return (
    <main className="content-page">
      <PageHeader eyebrow="Configuracoes" title="Parametros Gerais" description="Dados principais da clinica, endereco e links do Google." />
      <form className="panel form-panel" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync() }}>
        <div className="form-grid"><label>Nome interno<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label><label>Nome publico<input value={draft.nome_publico} onChange={(event) => setDraft({ ...draft, nome_publico: event.target.value })} /></label></div>
        <div className="form-grid"><label>Telefone<input value={draft.telefone} onChange={(event) => setDraft({ ...draft, telefone: event.target.value })} /></label><label>E-mail<input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label></div>
        <label>Endereco<input value={draft.endereco} onChange={(event) => setDraft({ ...draft, endereco: event.target.value })} /></label>
        <div className="form-grid"><label>Complemento<input value={draft.complemento} onChange={(event) => setDraft({ ...draft, complemento: event.target.value })} /></label><label>CEP<input value={draft.cep} onChange={(event) => setDraft({ ...draft, cep: event.target.value })} /></label></div>
        <div className="form-grid"><label>Cidade<input value={draft.cidade} onChange={(event) => setDraft({ ...draft, cidade: event.target.value })} /></label><label>Estado<input value={draft.estado} onChange={(event) => setDraft({ ...draft, estado: event.target.value })} /></label></div>
        <label>Fuso horario<input value={draft.fuso_horario} onChange={(event) => setDraft({ ...draft, fuso_horario: event.target.value })} /></label>
        <div className="form-grid"><label>Link Google avaliacao<input value={draft.link_google_avaliacao} onChange={(event) => setDraft({ ...draft, link_google_avaliacao: event.target.value })} /></label><label>Google Place ID<input value={draft.google_place_id} onChange={(event) => setDraft({ ...draft, google_place_id: event.target.value })} /></label></div>
        {save.error ? <div className="form-alert">{save.error.message}</div> : null}
        <button className="primary-button" type="submit"><Save size={16} /> Salvar parametros</button>
      </form>
    </main>
  )
}
