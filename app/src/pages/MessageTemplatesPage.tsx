import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, Eraser, Pencil, Plus, Save, Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { MessageSectionNav } from '../components/MessageSectionNav'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, LoadingBlock } from '../components/Ui'
import { useClinic } from '../contexts/useClinic'
import { activeRule, buildAlerts, messagingQueryOptions, messagesQueryKey } from '../lib/messaging'
import type { MessageTemplate } from '../lib/types'
import { supabase } from '../lib/supabase'
import { validateWhatsAppTemplate } from '../lib/whatsapp'

type TemplateDraft = {
  id: string
  ruleId: string
  tipo: string
  nome: string
  texto: string
  ativo: boolean
  prioridade: string
  gatilho: string
  quantidade: string
  unidade: string
  direcao: string
  janela_alerta_dias: string
  canal_padrao: 'whatsapp_manual' | 'whatsapp_business'
  whatsapp_template_name: string
  whatsapp_template_language: string
  automacao_iniciada_em: string
}

const emptyTemplateDraft: TemplateDraft = {
  id: '', ruleId: '', tipo: '', nome: '', texto: '', ativo: true, prioridade: '9', gatilho: 'manual',
  quantidade: '', unidade: '', direcao: '', janela_alerta_dias: '', canal_padrao: 'whatsapp_manual',
  whatsapp_template_name: '', whatsapp_template_language: 'pt_BR', automacao_iniciada_em: '',
}

const triggerLabels: Record<string, string> = {
  manual: 'Envio manual',
  agendamento_criado: 'Ao criar agendamento',
  inicio_agendamento: 'Pr?ximo ao agendamento',
  aniversario: 'Anivers?rio da cliente',
  ultimo_agendamento: 'Ap?s o ?ltimo atendimento',
}

function draftFromTemplate(template: MessageTemplate): TemplateDraft {
  const rule = activeRule(template)
  return {
    id: template.id,
    ruleId: rule?.id || '',
    tipo: template.tipo,
    nome: template.nome,
    texto: template.texto,
    ativo: template.ativo,
    prioridade: String(template.prioridade || 9),
    gatilho: rule?.gatilho || 'manual',
    quantidade: rule?.quantidade == null ? '' : String(rule.quantidade),
    unidade: rule?.unidade || '',
    direcao: rule?.direcao || '',
    janela_alerta_dias: rule?.janela_alerta_dias == null ? '' : String(rule.janela_alerta_dias),
    canal_padrao: rule?.canal_padrao === 'whatsapp_business' ? 'whatsapp_business' : 'whatsapp_manual',
    whatsapp_template_name: template.whatsapp_template_name || '',
    whatsapp_template_language: template.whatsapp_template_language || 'pt_BR',
    automacao_iniciada_em: rule?.automacao_iniciada_em || '',
  }
}

export function MessageTemplatesPage() {
  const { activeClinicId, activeMembership } = useClinic()
  const canConfigureAutomation = ['proprietario', 'administrador'].includes(activeMembership?.papel || '')
  const queryClient = useQueryClient()
  const formRef = useRef<HTMLElement>(null)
  const [draft, setDraft] = useState<TemplateDraft>(emptyTemplateDraft)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'todos' | 'ativos' | 'automaticos'>('todos')
  const query = useQuery(messagingQueryOptions(activeClinicId))
  const data = query.data
  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data])
  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return (data?.templates || []).filter((template) => {
      const rule = activeRule(template)
      const matchesFilter = filter === 'todos' || (filter === 'ativos' && template.ativo) || (filter === 'automaticos' && rule?.canal_padrao === 'whatsapp_business')
      return matchesFilter && (!term || `${template.nome} ${template.tipo} ${template.texto}`.toLocaleLowerCase('pt-BR').includes(term))
    })
  }, [data?.templates, filter, search])
  const automaticCount = data?.templates.filter((template) => activeRule(template)?.canal_padrao === 'whatsapp_business').length || 0

  const saveTemplate = useMutation({
    mutationFn: async (templateDraft: TemplateDraft) => {
      const tipo = templateDraft.tipo.trim()
      const isAutomatic = templateDraft.canal_padrao === 'whatsapp_business'
      const templateName = templateDraft.whatsapp_template_name.trim()
      const templateLanguage = templateDraft.whatsapp_template_language.trim() || 'pt_BR'
      if (!tipo || !templateDraft.nome.trim() || !templateDraft.texto.trim()) throw new Error('Informe tipo, nome e texto da mensagem.')
      if (isAutomatic && !['confirmacao_agendamento', 'lembrete_agendamento'].includes(tipo)) throw new Error('Apenas confirma??o e lembrete de agendamento podem ser autom?ticos nesta vers?o.')
      if (isAutomatic && !/^[a-z0-9_]+$/.test(templateName)) throw new Error('Informe o nome exato aprovado pela Meta, com letras min?sculas, n?meros e sublinhado.')
      if (!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(templateLanguage)) throw new Error('Informe um idioma v?lido, por exemplo pt_BR.')
      if (isAutomatic && tipo === 'confirmacao_agendamento' && templateDraft.gatilho !== 'agendamento_criado') throw new Error('A confirma??o autom?tica deve usar ?Ao criar agendamento?.')
      if (isAutomatic && tipo === 'lembrete_agendamento' && templateDraft.gatilho !== 'inicio_agendamento') throw new Error('O lembrete autom?tico deve usar ?Pr?ximo ao agendamento?.')
      if (isAutomatic) await validateWhatsAppTemplate(activeClinicId!, templateName, templateLanguage)
      const { error } = await supabase.rpc('salvar_modelo_mensagem_e_regra', {
        p_clinica_id: activeClinicId,
        p_modelo_id: templateDraft.id || null,
        p_regra_id: templateDraft.ruleId || null,
        p_tipo: tipo,
        p_nome: templateDraft.nome.trim(),
        p_texto: templateDraft.texto.trim(),
        p_modelo_ativo: templateDraft.ativo,
        p_prioridade: Number(templateDraft.prioridade || 9),
        p_whatsapp_template_name: templateName || null,
        p_whatsapp_template_language: templateLanguage,
        p_gatilho: templateDraft.gatilho,
        p_quantidade: templateDraft.quantidade === '' ? null : Number(templateDraft.quantidade),
        p_unidade: templateDraft.unidade || null,
        p_direcao: templateDraft.direcao || null,
        p_janela_alerta_dias: templateDraft.janela_alerta_dias === '' ? null : Number(templateDraft.janela_alerta_dias),
        p_canal_padrao: templateDraft.canal_padrao,
        p_automacao_iniciada_em: isAutomatic ? templateDraft.automacao_iniciada_em || new Date().toISOString() : null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setDraft(emptyTemplateDraft)
      await queryClient.invalidateQueries({ queryKey: messagesQueryKey(activeClinicId) })
    },
  })

  function focusForm(template?: MessageTemplate) {
    setDraft(template ? draftFromTemplate(template) : emptyTemplateDraft)
    window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <main className="content-page message-templates-page">
      <PageHeader eyebrow="Mensagens" title="Modelos e automa??es" description="Cadastre textos, defina quando enviar e conecte modelos aprovados pela Meta." actions={<button className="primary-button" type="button" onClick={() => focusForm()}><Plus size={17} /> Novo modelo</button>} />
      <MessageSectionNav pendingCount={alerts.length} />
      {query.error ? <div className="form-alert">{query.error.message}</div> : null}
      {query.isLoading ? <LoadingBlock /> : <>
        <section className="template-summary" aria-label="Resumo dos modelos">
          <article><strong>{data?.templates.length || 0}</strong><span>modelos cadastrados</span></article>
          <article><CheckCircle2 size={18} /><strong>{data?.templates.filter((template) => template.ativo).length || 0}</strong><span>ativos</span></article>
          <article><Bot size={18} /><strong>{automaticCount}</strong><span>autom?ticos</span></article>
        </section>

        <div className="template-management-layout">
          <section className="panel template-catalog">
            <div className="panel-header"><div><h2>Modelos cadastrados</h2><p>Selecione um modelo para editar.</p></div></div>
            <div className="template-catalog-tools">
              <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar modelo" /></label>
              <select aria-label="Filtrar modelos" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="todos">Todos</option><option value="ativos">Ativos</option><option value="automaticos">Autom?ticos</option></select>
            </div>
            {filteredTemplates.length ? <div className="template-catalog-list">{filteredTemplates.map((template) => {
              const rule = activeRule(template)
              return <button className={`template-catalog-card ${draft.id === template.id ? 'selected' : ''}`} type="button" key={template.id} onClick={() => focusForm(template)}>
                <span className="template-card-heading"><strong>{template.nome}</strong><Pencil size={15} /></span>
                <span className="template-card-badges"><small className={`badge ${template.ativo ? 'success' : 'warning'}`}>{template.ativo ? 'Ativo' : 'Inativo'}</small><small className={`badge ${rule?.canal_padrao === 'whatsapp_business' ? 'success' : ''}`}>{rule?.canal_padrao === 'whatsapp_business' ? 'Autom?tico' : 'Manual'}</small></span>
                <span>{triggerLabels[rule?.gatilho || 'manual'] || rule?.gatilho}</span>
                <p>{template.texto}</p>
              </button>
            })}</div> : <EmptyState title="Nenhum modelo encontrado">Ajuste a busca ou crie um novo modelo.</EmptyState>}
          </section>

          <section className="panel form-panel template-editor" ref={formRef}>
            <div className="panel-header"><div><p className="eyebrow">{draft.id ? 'Editando modelo' : 'Novo cadastro'}</p><h2>{draft.id ? draft.nome || 'Modelo sem nome' : 'Criar modelo de mensagem'}</h2></div><button className="ghost-button" type="button" onClick={() => setDraft(emptyTemplateDraft)}><Eraser size={16} /> Limpar</button></div>
            <fieldset><legend>Conte?do da mensagem</legend>
              <div className="form-grid"><label>Nome para identifica??o<input value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} placeholder="Ex.: Lembrete de amanh?" /></label><label>Tipo da mensagem<input list="message-types" value={draft.tipo} onChange={(event) => setDraft({ ...draft, tipo: event.target.value })} placeholder="Selecione ou digite" /><datalist id="message-types"><option value="confirmacao_agendamento" /><option value="lembrete_agendamento" /><option value="aniversario" /><option value="lembrete_retorno" /><option value="pedido_avaliacao" /></datalist></label></div>
              <label>Texto<textarea rows={6} value={draft.texto} onChange={(event) => setDraft({ ...draft, texto: event.target.value })} placeholder="Ol?, {nome}! Seu hor?rio ? dia {data}, ?s {hora}." /><small>Campos dispon?veis: {'{nome}'}, {'{data}'}, {'{hora}'}, {'{servico}'} e {'{link_avaliacao_google}'}.</small></label>
            </fieldset>

            <fieldset><legend>Regra de envio</legend>
              <div className="form-grid"><label>Quando preparar a mensagem<select value={draft.gatilho} onChange={(event) => setDraft({ ...draft, gatilho: event.target.value })}><option value="manual">Somente quando eu enviar</option><option value="agendamento_criado">Ao criar agendamento</option><option value="inicio_agendamento">Pr?ximo ao agendamento</option><option value="aniversario">No anivers?rio da cliente</option><option value="ultimo_agendamento">Ap?s o ?ltimo atendimento</option></select></label><label>Prioridade<input type="number" min={1} value={draft.prioridade} onChange={(event) => setDraft({ ...draft, prioridade: event.target.value })} /><small>1 aparece antes; n?meros maiores aparecem depois.</small></label></div>
              {draft.gatilho !== 'manual' ? <div className="form-grid rule-offset-grid"><label>Tempo<input type="number" min={0} value={draft.quantidade} onChange={(event) => setDraft({ ...draft, quantidade: event.target.value })} /></label><label>Unidade<select value={draft.unidade} onChange={(event) => setDraft({ ...draft, unidade: event.target.value })}><option value="">Selecione</option><option value="horas">Horas</option><option value="dias">Dias</option></select></label><label>Dire??o<select value={draft.direcao} onChange={(event) => setDraft({ ...draft, direcao: event.target.value })}><option value="">Selecione</option><option value="antes">Antes</option><option value="depois">Depois</option></select></label></div> : null}
              {draft.gatilho === 'aniversario' ? <label>Janela de alerta em dias<input type="number" min={0} value={draft.janela_alerta_dias} onChange={(event) => setDraft({ ...draft, janela_alerta_dias: event.target.value })} placeholder="7" /></label> : null}
            </fieldset>

            <fieldset><legend>Canal e automa??o</legend>
              <div className="form-grid"><label>Modo de envio<select value={draft.canal_padrao} disabled={!canConfigureAutomation} onChange={(event) => setDraft({ ...draft, canal_padrao: event.target.value as TemplateDraft['canal_padrao'] })}><option value="whatsapp_manual">Manual pelo WhatsApp</option><option value="whatsapp_business">Autom?tico pela Meta</option></select></label><label className="check-row template-active-check"><input type="checkbox" checked={draft.ativo} onChange={(event) => setDraft({ ...draft, ativo: event.target.checked })} /> Dispon?vel para uso</label></div>
              {draft.canal_padrao === 'whatsapp_business' ? <><div className="form-grid"><label>Nome aprovado na Meta<input disabled={!canConfigureAutomation} value={draft.whatsapp_template_name} onChange={(event) => setDraft({ ...draft, whatsapp_template_name: event.target.value })} placeholder="confirmacao_agendamento_v1" /></label><label>Idioma<input disabled={!canConfigureAutomation} value={draft.whatsapp_template_language} onChange={(event) => setDraft({ ...draft, whatsapp_template_language: event.target.value })} placeholder="pt_BR" /></label></div><div className="form-alert">A automa??o come?a ao salvar. O sistema valida se o modelo est? aprovado pela Meta.</div></> : null}
            </fieldset>
            {saveTemplate.error ? <div className="form-alert">{saveTemplate.error.message}</div> : null}
            {!canConfigureAutomation && draft.canal_padrao === 'whatsapp_business' ? <div className="form-alert">Apenas propriet?rios e administradores podem alterar automa??es.</div> : null}
            <div className="template-editor-actions"><button className="primary-button" type="button" disabled={saveTemplate.isPending || (!canConfigureAutomation && draft.canal_padrao === 'whatsapp_business')} onClick={() => void saveTemplate.mutateAsync(draft)}><Save size={18} /> {saveTemplate.isPending ? 'Salvando...' : 'Salvar modelo'}</button></div>
          </section>
        </div>
      </>}
    </main>
  )
}
