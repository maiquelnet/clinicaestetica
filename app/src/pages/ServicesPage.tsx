import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { EmptyState, FieldError, LoadingBlock } from '../components/Ui'
import { useClinic } from '../contexts/useClinic'
import { currentPrice, formatDate, formatMoney, parseCurrency, toInputDate } from '../lib/format'
import { saveServiceWithPrice } from '../lib/rpc'
import { supabase } from '../lib/supabase'
import type { Service } from '../lib/types'
import { ManagementFormActions, ManagementFormPage, ManagementListPage, ManagementToolbar } from './admin/shared/ManagementPage'

const listPath = '/servicos'

const serviceSchema = z.object({
  nome: z.string().min(2, 'Informe o nome.'),
  categoria: z.string().optional(),
  descricao: z.string().optional(),
  duracao_minutos: z.coerce.number().min(1, 'A duração precisa ser maior que zero.'),
  intervalo_retorno_dias: z.coerce.number().min(0).optional().or(z.literal('')),
  valor: z.string().optional(),
  preco_sob_consulta: z.boolean(),
  observacao_preco: z.string().optional(),
  inicio_validade: z.string().optional(),
  ativo: z.boolean(),
})

type ServiceFormInput = z.input<typeof serviceSchema>
type ServiceForm = z.output<typeof serviceSchema>

const defaultValues: ServiceFormInput = {
  nome: '', categoria: '', descricao: '', duracao_minutos: 60, intervalo_retorno_dias: '', valor: '',
  preco_sob_consulta: false, observacao_preco: '', inicio_validade: toInputDate(), ativo: true,
}

async function fetchServices(clinicId: string) {
  const { data, error } = await supabase.from('servicos').select('*,precos_servicos(*)').eq('clinica_id', clinicId).is('arquivado_em', null).order('categoria').order('nome')
  if (error) throw error
  return (data || []) as Service[]
}

export function ServicesPage() {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [category, setCategory] = useState('todas')
  const query = useQuery({ queryKey: ['services', activeClinicId], enabled: Boolean(activeClinicId), queryFn: () => fetchServices(activeClinicId!) })

  const archiveService = useMutation({
    mutationFn: async (service: Service) => {
      if (!activeClinicId) throw new Error('Clínica ativa não encontrada.')
      const { data, error } = await supabase.from('servicos').update({ ativo: false, arquivado_em: new Date().toISOString() }).eq('id', service.id).eq('clinica_id', activeClinicId).select('id').maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Serviço não encontrado nesta clínica.')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', activeClinicId] }),
  })

  const services = useMemo(() => query.data || [], [query.data])
  const categories = useMemo(() => [...new Set(services.map((service) => service.categoria || 'Sem categoria'))].sort(), [services])
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return services.filter((service) => {
      const matchesStatus = status === 'todos' || (status === 'ativos' ? service.ativo : !service.ativo)
      const matchesCategory = category === 'todas' || (service.categoria || 'Sem categoria') === category
      const content = `${service.nome} ${service.categoria || ''} ${service.descricao || ''}`.toLocaleLowerCase('pt-BR')
      return matchesStatus && matchesCategory && (!term || content.includes(term))
    })
  }, [category, search, services, status])

  function requestArchive(service: Service) {
    if (!window.confirm(`Arquivar o serviço “${service.nome}”?`)) return
    void archiveService.mutateAsync(service)
  }

  return (
    <ManagementListPage eyebrow="Serviços" title="Serviços e preços" description="Consulte procedimentos, duração e histórico de valores em um só catálogo." newTo={`${listPath}/novo`} newLabel="Novo serviço" error={(query.error || archiveService.error) as Error | null}>
      <section className="management-summary" aria-label="Resumo dos serviços">
        <article><strong>{services.length}</strong><span>Cadastrados</span></article>
        <article><strong>{services.filter((service) => service.ativo).length}</strong><span>Ativos</span></article>
        <article><strong>{categories.length}</strong><span>Categorias</span></article>
      </section>
      <section className="panel management-catalog">
        <ManagementToolbar search={search} onSearch={setSearch} searchPlaceholder="Buscar serviço">
          <select aria-label="Filtrar por situação" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="todos">Todos</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option></select>
          <select aria-label="Filtrar por categoria" value={category} onChange={(event) => setCategory(event.target.value)}><option value="todas">Todas as categorias</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </ManagementToolbar>
        {query.isLoading ? <LoadingBlock /> : filtered.length ? <div className="record-list">{filtered.map((service) => (
          <article className="record-card" key={service.id}>
            <div><h3>{service.nome}</h3><div className="record-meta"><span>{service.categoria || 'Sem categoria'}</span><span>{service.duracao_minutos} min</span>{service.intervalo_retorno_dias ? <span>Retorno em {service.intervalo_retorno_dias} dias</span> : null}<span>{service.preco_sob_consulta ? 'Sob avaliação' : formatMoney(currentPrice(service))}</span><span className={`badge ${service.ativo ? 'success' : 'warning'}`}>{service.ativo ? 'Ativo' : 'Inativo'}</span></div>{service.descricao ? <p>{service.descricao}</p> : null}{(service.precos_servicos || []).length ? <ul className="price-history">{(service.precos_servicos || []).map((price) => <li key={price.id}>{formatMoney(price.valor)} · {formatDate(price.inicio_validade)}{price.fim_validade ? ` até ${formatDate(price.fim_validade)}` : ' · atual'}</li>)}</ul> : null}</div>
            <div className="record-actions"><Link className="ghost-button" to={`${listPath}/${service.id}/editar`}><Pencil size={15} /> Editar</Link><button className="danger-button" type="button" onClick={() => requestArchive(service)}><Archive size={16} /> Arquivar</button></div>
          </article>
        ))}</div> : <EmptyState title="Nenhum serviço encontrado">Ajuste os filtros ou cadastre um novo serviço.</EmptyState>}
      </section>
    </ManagementListPage>
  )
}

export function ServiceFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const initialized = useRef('')
  const form = useForm<ServiceFormInput, unknown, ServiceForm>({ resolver: zodResolver(serviceSchema), defaultValues })
  const priceOnRequest = useWatch({ control: form.control, name: 'preco_sob_consulta' })

  const query = useQuery({
    queryKey: ['service-form', activeClinicId, id || 'new'],
    enabled: Boolean(activeClinicId),
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase.from('servicos').select('*,precos_servicos(*)').eq('id', id).eq('clinica_id', activeClinicId).is('arquivado_em', null).maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Serviço não encontrado nesta clínica.')
      return data as Service
    },
  })

  useEffect(() => {
    if (query.isLoading) return
    const key = id || 'new'
    if (initialized.current === key) return
    initialized.current = key
    const service = query.data
    form.reset(service ? {
      nome: service.nome, categoria: service.categoria || '', descricao: service.descricao || '', duracao_minutos: service.duracao_minutos,
      intervalo_retorno_dias: service.intervalo_retorno_dias ?? '', valor: service.preco_sob_consulta ? '' : String(currentPrice(service)).replace('.', ','),
      preco_sob_consulta: service.preco_sob_consulta, observacao_preco: service.observacao_preco || '', inicio_validade: toInputDate(), ativo: service.ativo,
    } : defaultValues)
  }, [form, id, query.data, query.isLoading])

  const save = useMutation({
    mutationFn: async (values: ServiceForm) => {
      if (!activeClinicId) throw new Error('Clínica ativa não encontrada.')
      await saveServiceWithPrice({
        p_servico_id: id || null, p_clinica_id: activeClinicId, p_nome: values.nome.trim(), p_categoria: values.categoria?.trim() || null,
        p_descricao: values.descricao?.trim() || null, p_duracao_minutos: values.duracao_minutos,
        p_intervalo_retorno_dias: values.intervalo_retorno_dias === '' ? null : Number(values.intervalo_retorno_dias),
        p_preco_sob_consulta: values.preco_sob_consulta, p_observacao_preco: values.observacao_preco?.trim() || null,
        p_ativo: values.ativo, p_valor: !values.preco_sob_consulta && values.valor ? parseCurrency(values.valor) : null,
        p_inicio_validade: values.inicio_validade || toInputDate(),
      })
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['services', activeClinicId] }); navigate(listPath) },
  })

  return (
    <ManagementFormPage eyebrow="Serviços" title={editing ? 'Editar serviço' : 'Novo serviço'} description="Defina o procedimento, a duração e as condições comerciais." backTo={listPath} loading={query.isLoading} error={query.error as Error | null}>
      {!editing || query.data ? <form className="panel management-editor" onSubmit={(event) => void form.handleSubmit((values) => save.mutateAsync(values))(event)}>
        <fieldset><legend>Identificação</legend><label>Nome<input {...form.register('nome')} /><FieldError message={form.formState.errors.nome?.message} /></label><div className="form-grid"><label>Categoria<select {...form.register('categoria')}><option value="">Selecione</option><option value="Depilação">Depilação</option><option value="Procedimentos">Procedimentos</option><option value="Micropigmentação">Micropigmentação</option><option value="Maquiagem">Maquiagem</option></select></label><label>Duração em minutos<input type="number" min={1} {...form.register('duracao_minutos')} /><FieldError message={form.formState.errors.duracao_minutos?.message} /></label></div><label>Descrição<textarea rows={4} {...form.register('descricao')} /></label><label>Retorno em dias<input type="number" min={0} placeholder="Regra geral" {...form.register('intervalo_retorno_dias')} /></label></fieldset>
        <fieldset><legend>Preço</legend><div className="form-grid"><label>Valor<input inputMode="decimal" disabled={priceOnRequest} placeholder="150,00" {...form.register('valor')} /></label><label>Início do valor<input type="date" {...form.register('inicio_validade')} /></label></div><label className="check-row"><input type="checkbox" {...form.register('preco_sob_consulta')} /> Preço sob avaliação</label><label>Observação do preço<input placeholder="Ex.: 2x R$ 300,00" {...form.register('observacao_preco')} /></label></fieldset>
        <fieldset><legend>Disponibilidade</legend><label className="check-row"><input type="checkbox" {...form.register('ativo')} /> Serviço ativo</label></fieldset>
        {save.error ? <div className="form-alert">{save.error.message}</div> : null}
        <ManagementFormActions backTo={listPath} pending={save.isPending} saveLabel={editing ? 'Salvar alterações' : 'Salvar serviço'} />
      </form> : null}
    </ManagementFormPage>
  )
}
