import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Eraser, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { EmptyState, FieldError, LoadingBlock } from '../components/Ui'
import { PageHeader } from '../components/PageHeader'
import { useClinic } from '../contexts/useClinic'
import { currentPrice, formatDate, formatMoney, parseCurrency, toInputDate } from '../lib/format'
import { saveServiceWithPrice } from '../lib/rpc'
import { supabase } from '../lib/supabase'
import type { Service } from '../lib/types'

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
  nome: '',
  categoria: '',
  descricao: '',
  duracao_minutos: 60,
  intervalo_retorno_dias: '',
  valor: '',
  preco_sob_consulta: false,
  observacao_preco: '',
  inicio_validade: toInputDate(),
  ativo: true,
}

async function fetchServices(clinicId: string) {
  const { data, error } = await supabase
    .from('servicos')
    .select('*,precos_servicos(*)')
    .eq('clinica_id', clinicId)
    .is('arquivado_em', null)
    .order('categoria', { ascending: true })
    .order('nome', { ascending: true })

  if (error) throw error
  return (data || []) as Service[]
}

export function ServicesPage() {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Service | null>(null)
  const form = useForm<ServiceFormInput, unknown, ServiceForm>({
    resolver: zodResolver(serviceSchema),
    defaultValues,
  })
  const priceOnRequest = useWatch({ control: form.control, name: 'preco_sob_consulta' })

  const query = useQuery({
    queryKey: ['services', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: () => fetchServices(activeClinicId!),
  })

  const saveService = useMutation({
    mutationFn: async (values: ServiceForm) => {
      if (!activeClinicId) throw new Error('Clinica ativa nao encontrada.')
      const value = !values.preco_sob_consulta && values.valor ? parseCurrency(values.valor) : null
      await saveServiceWithPrice({
        p_servico_id: editing?.id ?? null,
        p_clinica_id: activeClinicId,
        p_nome: values.nome.trim(),
        p_categoria: values.categoria?.trim() || null,
        p_descricao: values.descricao?.trim() || null,
        p_duracao_minutos: values.duracao_minutos,
        p_intervalo_retorno_dias: values.intervalo_retorno_dias === '' ? null : Number(values.intervalo_retorno_dias),
        p_preco_sob_consulta: values.preco_sob_consulta,
        p_observacao_preco: values.observacao_preco?.trim() || null,
        p_ativo: values.ativo,
        p_valor: value,
        p_inicio_validade: values.inicio_validade || toInputDate(),
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['services', activeClinicId] })
      resetForm()
    },
  })

  const archiveService = useMutation({
    mutationFn: async (service: Service) => {
      const { error } = await supabase
        .from('servicos')
        .update({ ativo: false, arquivado_em: new Date().toISOString() })
        .eq('id', service.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', activeClinicId] }),
  })

  const grouped = useMemo(() => {
    return (query.data || []).reduce<Record<string, Service[]>>((groups, service) => {
      const category = service.categoria || 'Sem categoria'
      groups[category] = groups[category] || []
      groups[category].push(service)
      return groups
    }, {})
  }, [query.data])

  function editService(service: Service) {
    setEditing(service)
    form.reset({
      nome: service.nome,
      categoria: service.categoria || '',
      descricao: service.descricao || '',
      duracao_minutos: service.duracao_minutos,
      intervalo_retorno_dias: service.intervalo_retorno_dias ?? '',
      valor: service.preco_sob_consulta ? '' : String(currentPrice(service)).replace('.', ','),
      preco_sob_consulta: service.preco_sob_consulta,
      observacao_preco: service.observacao_preco || '',
      inicio_validade: toInputDate(),
      ativo: service.ativo,
    })
  }

  function resetForm() {
    setEditing(null)
    form.reset(defaultValues)
  }

  return (
    <main className="content-page">
      <PageHeader
        eyebrow="Serviços"
        title="Serviços e preços"
        description="Cadastre procedimentos, duração e histórico de valores."
      />

      <div className="work-grid">
        <form
          className="panel form-panel"
          onSubmit={(event) => void form.handleSubmit((values) => saveService.mutateAsync(values))(event)}
        >
          <div className="panel-header">
            <h2>{editing ? 'Editar serviço' : 'Novo serviço'}</h2>
            <button className="ghost-button" type="button" onClick={resetForm}>
              <Eraser size={16} />
              Limpar
            </button>
          </div>
          <label>
            Nome
            <input {...form.register('nome')} />
            <FieldError message={form.formState.errors.nome?.message} />
          </label>
          <label>
            Categoria
            <select {...form.register('categoria')}>
              <option value="">Selecione</option>
              <option value="Depilação">Depilação</option>
              <option value="Procedimentos">Procedimentos</option>
              <option value="Micropigmentação">Micropigmentação</option>
              <option value="Maquiagem">Maquiagem</option>
            </select>
          </label>
          <label>
            Descrição
            <textarea rows={3} {...form.register('descricao')} />
          </label>
          <div className="form-grid">
            <label>
              Duração
              <input type="number" min={1} {...form.register('duracao_minutos')} />
              <FieldError message={form.formState.errors.duracao_minutos?.message} />
            </label>
            <label>
              Retorno em dias
              <input type="number" min={0} placeholder="Regra geral" {...form.register('intervalo_retorno_dias')} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Valor
              <input inputMode="decimal" disabled={priceOnRequest} placeholder="150,00" {...form.register('valor')} />
            </label>
          </div>
          <label className="check-row">
            <input type="checkbox" {...form.register('preco_sob_consulta')} />
            Preço sob avaliação
          </label>
          <label>
            Observação do preço
            <input placeholder="ex.: 2x R$ 300,00" {...form.register('observacao_preco')} />
          </label>
          <label>
            Início do valor
            <input type="date" {...form.register('inicio_validade')} />
          </label>
          <label className="check-row">
            <input type="checkbox" {...form.register('ativo')} />
            Serviço ativo
          </label>
          {saveService.error ? <div className="form-alert">{saveService.error.message}</div> : null}
          <button className="primary-button" type="submit" disabled={saveService.isPending}>
            <Save size={18} />
            {saveService.isPending ? 'Salvando...' : 'Salvar serviço'}
          </button>
        </form>

        <section className="panel list-panel">
          <div className="panel-header">
            <h2>Catálogo</h2>
          </div>
          {query.isLoading ? (
            <LoadingBlock />
          ) : Object.keys(grouped).length ? (
            <div className="service-groups">
              {Object.entries(grouped).map(([category, services]) => (
                <section key={category}>
                  <h3 className="group-title">{category}</h3>
                  <div className="record-list">
                    {services.map((service) => (
                      <article className="record-card" key={service.id}>
                        <div>
                          <h3>{service.nome}</h3>
                          <div className="record-meta">
                            <span>{service.duracao_minutos} min</span>
                            {service.intervalo_retorno_dias ? <span>Retorno {service.intervalo_retorno_dias} dias</span> : null}
                            <span>{service.preco_sob_consulta ? 'Sob avaliação' : formatMoney(currentPrice(service))}</span>
                            <span className={`badge ${service.ativo ? 'success' : 'warning'}`}>
                              {service.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          {service.descricao ? <p>{service.descricao}</p> : null}
                          {(service.precos_servicos || []).length ? (
                            <ul className="price-history">
                              {(service.precos_servicos || []).map((price) => (
                                <li key={price.id}>
                                  {formatMoney(price.valor)} · {formatDate(price.inicio_validade)}
                                  {price.fim_validade ? ` até ${formatDate(price.fim_validade)}` : ' · atual'}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div className="record-actions">
                          <button className="ghost-button" type="button" onClick={() => editService(service)}>
                            Editar
                          </button>
                          <button
                            className="danger-button"
                            type="button"
                            onClick={() => void archiveService.mutateAsync(service)}
                          >
                            <Archive size={16} />
                            Arquivar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState title="Nenhum serviço cadastrado" />
          )}
        </section>
      </div>
    </main>
  )
}
