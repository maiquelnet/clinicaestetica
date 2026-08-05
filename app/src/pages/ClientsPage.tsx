import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Edit3, Eraser, Plus, Save, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { EmptyState, FieldError, LoadingBlock } from '../components/Ui'
import { PageHeader } from '../components/PageHeader'
import { useClinic } from '../contexts/useClinic'
import { formatDate } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Client } from '../lib/types'

function phoneDigits(value: string) {
  return value.replace(/\D/g, '')
}

function validBrazilianPhone(value: string) {
  const digits = phoneDigits(value)
  return digits.length === 10
    || digits.length === 11
    || ((digits.length === 12 || digits.length === 13) && digits.startsWith('55'))
}

const clientSchema = z.object({
  nome: z.string().min(2, 'Informe o nome.'),
  telefone: z.string().refine(validBrazilianPhone, 'Informe DDD e numero validos.'),
  email: z.string().email('E-mail inválido.').or(z.literal('')).optional(),
  data_nascimento: z.string().optional(),
  cpf: z.string().optional(),
  genero: z.string().optional(),
  observacoes: z.string().optional(),
  intervalo_retorno_dias: z.coerce.number().min(0).optional().or(z.literal('')),
  parceira: z.boolean(),
  aceita_marketing: z.boolean(),
  whatsapp_opt_in: z.boolean(),
  ativo: z.boolean(),
})

type ClientFormInput = z.input<typeof clientSchema>
type ClientForm = z.output<typeof clientSchema>

const defaultValues: ClientFormInput = {
  nome: '',
  telefone: '',
  email: '',
  data_nascimento: '',
  cpf: '',
  genero: '',
  observacoes: '',
  intervalo_retorno_dias: '',
  parceira: false,
  aceita_marketing: false,
  whatsapp_opt_in: false,
  ativo: true,
}

const WHATSAPP_OPT_IN_ORIGIN = 'cadastro_painel'
const WHATSAPP_OPT_IN_VERSION = 'appointment_updates_v1'

const whatsappConsentLabels: Record<Client['whatsapp_opt_in_status'], string> = {
  pendente: 'Pendente',
  aceito: 'Autorizado',
  recusado: 'Recusado',
  revogado: 'Revogado',
}

function whatsappConsentBadge(status: Client['whatsapp_opt_in_status']) {
  if (status === 'aceito') return 'success'
  if (status === 'pendente') return 'warning'
  return 'cancelado'
}

async function fetchClients(clinicId: string) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('clinica_id', clinicId)
    .is('arquivado_em', null)
    .order('nome', { ascending: true })

  if (error) throw error
  return (data || []) as Client[]
}

export function ClientsPage() {
  const { activeClinicId } = useClinic()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Client | null>(null)
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const form = useForm<ClientFormInput, unknown, ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues,
  })

  const query = useQuery({
    queryKey: ['clients', activeClinicId],
    enabled: Boolean(activeClinicId),
    queryFn: () => fetchClients(activeClinicId!),
  })

  const saveClient = useMutation({
    mutationFn: async (values: ClientForm) => {
      const now = new Date().toISOString()
      const phoneChanged = Boolean(editing && phoneDigits(values.telefone) !== phoneDigits(editing.telefone))
      const hadWhatsAppOptIn = editing?.whatsapp_opt_in_status === 'aceito' && !phoneChanged
      const grantedWhatsAppOptIn = values.whatsapp_opt_in && !hadWhatsAppOptIn
      const revokedWhatsAppOptIn = !values.whatsapp_opt_in && hadWhatsAppOptIn
      const whatsappConsent = editing
        ? {
            whatsapp_opt_in_status: grantedWhatsAppOptIn
              ? 'aceito' as const
              : revokedWhatsAppOptIn
                ? 'revogado' as const
                : editing.whatsapp_opt_in_status,
            whatsapp_opt_in_em: grantedWhatsAppOptIn ? now : editing.whatsapp_opt_in_em,
            whatsapp_opt_in_origem: grantedWhatsAppOptIn
              ? WHATSAPP_OPT_IN_ORIGIN
              : editing.whatsapp_opt_in_origem,
            whatsapp_opt_in_versao: grantedWhatsAppOptIn
              ? WHATSAPP_OPT_IN_VERSION
              : editing.whatsapp_opt_in_versao,
            whatsapp_opt_out_em: grantedWhatsAppOptIn
              ? null
              : revokedWhatsAppOptIn
                ? now
                : editing.whatsapp_opt_out_em,
          }
        : {
            whatsapp_opt_in_status: values.whatsapp_opt_in ? 'aceito' as const : 'pendente' as const,
            whatsapp_opt_in_em: values.whatsapp_opt_in ? now : null,
            whatsapp_opt_in_origem: values.whatsapp_opt_in ? WHATSAPP_OPT_IN_ORIGIN : null,
            whatsapp_opt_in_versao: values.whatsapp_opt_in ? WHATSAPP_OPT_IN_VERSION : null,
            whatsapp_opt_out_em: null,
          }
      const payload = {
        clinica_id: activeClinicId,
        nome: values.nome.trim(),
        telefone: values.telefone.trim(),
        email: values.email?.trim() || null,
        data_nascimento: values.data_nascimento || null,
        cpf: values.cpf?.trim() || null,
        genero: values.genero?.trim() || null,
        observacoes: values.observacoes?.trim() || null,
        intervalo_retorno_dias: values.intervalo_retorno_dias === '' ? null : Number(values.intervalo_retorno_dias),
        parceira: values.parceira,
        aceita_marketing: values.aceita_marketing,
        ...whatsappConsent,
        ativo: values.ativo,
        atualizado_em: now,
      }

      const request = editing
        ? supabase.from('clientes').update(payload).eq('id', editing.id)
        : supabase.from('clientes').insert(payload)
      const { error } = await request
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clients', activeClinicId] })
      resetForm()
      setFormOpen(false)
    },
  })

  const archiveClient = useMutation({
    mutationFn: async (client: Client) => {
      const { error } = await supabase
        .from('clientes')
        .update({ ativo: false, arquivado_em: new Date().toISOString() })
        .eq('id', client.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients', activeClinicId] }),
  })

  const clients = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return query.data ?? []
    return (query.data ?? []).filter((client) =>
      [client.nome, client.telefone, client.email, client.cpf]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [query.data, search])

  function editClient(client: Client) {
    setEditing(client)
    setFormOpen(true)
    form.reset({
      nome: client.nome,
      telefone: client.telefone,
      email: client.email || '',
      data_nascimento: client.data_nascimento || '',
      cpf: client.cpf || '',
      genero: client.genero || '',
      observacoes: client.observacoes || '',
      intervalo_retorno_dias: client.intervalo_retorno_dias ?? '',
      parceira: client.parceira,
      aceita_marketing: client.aceita_marketing,
      whatsapp_opt_in: client.whatsapp_opt_in_status === 'aceito',
      ativo: client.ativo,
    })
  }

  function resetForm() {
    setEditing(null)
    form.reset(defaultValues)
  }

  function newClient() {
    resetForm()
    setFormOpen(true)
  }

  const phoneRegistration = form.register('telefone')

  return (
    <main className="content-page">
      <PageHeader
        eyebrow="Clientes"
        title="Clientes cadastrados"
        description="Consulte a base, filtre rapidamente e cadastre novos clientes apenas quando necessário."
        actions={
          <button className="primary-button compact-action" type="button" onClick={newClient}>
            <Plus size={16} />
            Novo cliente
          </button>
        }
      />

      <div className={`data-workspace ${formOpen ? 'has-drawer' : ''}`}>
        <section className="panel list-panel data-panel">
          <div className="panel-header compact-header">
            <h2>Base de clientes</h2>
            <div className="search-box">
              <Search size={16} />
              <input
                value={search}
                placeholder="Buscar por nome, telefone, CPF ou e-mail"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          {query.isLoading ? (
            <LoadingBlock />
          ) : clients.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>E-mail</th>
                    <th>Nascimento</th>
                    <th>Retorno</th>
                    <th>Parceria</th>
                    <th>WhatsApp</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id}>
                      <td>
                        <strong>{client.nome}</strong>
                        {client.observacoes ? <small>{client.observacoes}</small> : null}
                      </td>
                      <td>{client.telefone}</td>
                      <td>{client.email || '-'}</td>
                      <td>{client.data_nascimento ? formatDate(client.data_nascimento) : '-'}</td>
                      <td>{client.intervalo_retorno_dias ? `${client.intervalo_retorno_dias} dias` : '-'}</td>
                      <td>
                        <span className={`badge ${client.parceira ? 'success' : ''}`}>
                          {client.parceira ? 'Parceira' : 'Nao'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${whatsappConsentBadge(client.whatsapp_opt_in_status)}`}>
                          {whatsappConsentLabels[client.whatsapp_opt_in_status]}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${client.ativo ? 'success' : 'warning'}`}>
                          {client.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="icon-button" type="button" aria-label="Editar cliente" onClick={() => editClient(client)}>
                            <Edit3 size={15} />
                          </button>
                          <button
                            className="icon-button danger-icon"
                            type="button"
                            aria-label="Arquivar cliente"
                            onClick={() => void archiveClient.mutateAsync(client)}
                          >
                            <Archive size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nenhum cliente encontrado" />
          )}
        </section>

        {formOpen ? (
          <form
            className="panel form-panel drawer-panel"
            onSubmit={(event) => void form.handleSubmit((values) => saveClient.mutateAsync(values))(event)}
          >
            <div className="panel-header compact-header">
              <h2>{editing ? 'Editar cliente' : 'Novo cliente'}</h2>
              <button className="ghost-button compact-action" type="button" onClick={resetForm}>
                <Eraser size={15} />
                Limpar
              </button>
            </div>

            <label>
              Nome
              <input {...form.register('nome')} />
              <FieldError message={form.formState.errors.nome?.message} />
            </label>
            <label>
              Telefone
              <input
                type="tel"
                {...phoneRegistration}
                onChange={(event) => {
                  void phoneRegistration.onChange(event)
                  if (editing?.whatsapp_opt_in_status === 'aceito'
                    && phoneDigits(event.target.value) !== phoneDigits(editing.telefone)) {
                    form.setValue('whatsapp_opt_in', false, { shouldDirty: true })
                  }
                }}
              />
              <FieldError message={form.formState.errors.telefone?.message} />
            </label>
            <div className="form-grid">
              <label>
                E-mail
                <input type="email" {...form.register('email')} />
                <FieldError message={form.formState.errors.email?.message} />
              </label>
              <label>
                Nascimento
                <input type="date" {...form.register('data_nascimento')} />
              </label>
            </div>
            <div className="form-grid">
              <label>
                CPF
                <input inputMode="numeric" {...form.register('cpf')} />
              </label>
              <label>
                Gênero
                <input {...form.register('genero')} />
              </label>
            </div>
            <label>
              Observações
              <textarea rows={3} {...form.register('observacoes')} />
            </label>
            <label>
              Retorno em dias
              <input type="number" min={0} placeholder="Usar regra do serviço" {...form.register('intervalo_retorno_dias')} />
            </label>
            <label className="check-row">
              <input type="checkbox" {...form.register('aceita_marketing')} />
              Aceita comunicações de marketing
            </label>
            <label className="check-row">
              <input type="checkbox" {...form.register('whatsapp_opt_in')} />
              Confirmo que a cliente autorizou confirmacoes e lembretes de agendamento pelo WhatsApp
            </label>
            <label className="check-row">
              <input type="checkbox" {...form.register('parceira')} />
              Cliente parceira
            </label>
            <label className="check-row">
              <input type="checkbox" {...form.register('ativo')} />
              Cliente ativo
            </label>
            {saveClient.error ? <div className="form-alert">{saveClient.error.message}</div> : null}
            <button className="primary-button" type="submit" disabled={saveClient.isPending}>
              <Save size={16} />
              {saveClient.isPending ? 'Salvando...' : 'Salvar cliente'}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  )
}
