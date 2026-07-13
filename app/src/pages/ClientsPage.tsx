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

const clientSchema = z.object({
  nome: z.string().min(2, 'Informe o nome.'),
  telefone: z.string().min(8, 'Informe o telefone.'),
  email: z.string().email('E-mail inválido.').or(z.literal('')).optional(),
  data_nascimento: z.string().optional(),
  cpf: z.string().optional(),
  genero: z.string().optional(),
  observacoes: z.string().optional(),
  intervalo_retorno_dias: z.coerce.number().min(0).optional().or(z.literal('')),
  parceira: z.boolean(),
  aceita_marketing: z.boolean(),
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
  aceita_marketing: true,
  ativo: true,
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
        ativo: values.ativo,
        atualizado_em: new Date().toISOString(),
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
              <input type="tel" {...form.register('telefone')} />
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
