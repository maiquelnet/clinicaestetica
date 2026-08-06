import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, CheckCircle } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { FieldError, LoadingBlock } from '../components/Ui'
import { supabase } from '../lib/supabase'
import type { Service } from '../lib/types'

type ClinicReference = {
  id: string
  nome_publico: string | null
  link_google_avaliacao: string | null
}

type SignupService = Pick<Service, 'id' | 'nome' | 'categoria' | 'descricao'>

function phoneDigits(value: string) {
  return value.replace(/\D/g, '')
}

function validBrazilianPhone(value: string) {
  const digits = phoneDigits(value)
  return digits.length === 10 || digits.length === 11 || ((digits.length === 12 || digits.length === 13) && digits.startsWith('55'))
}

const clientSchema = z.object({
  nome: z.string().min(2, 'Informe o nome completo.'),
  telefone: z.string().min(10, 'Informe o telefone.').refine(validBrazilianPhone, 'Informe DDD e número válidos.'),
  email: z.string().email('E-mail inválido.').or(z.literal('')).optional(),
  data_nascimento: z.string().optional(),
  servicos_interesse: z.array(z.string()),
})

type ClientSignupForm = z.infer<typeof clientSchema>

async function fetchClinic(): Promise<ClinicReference | null> {
  const { data, error } = await supabase
    .from('clinicas')
    .select('id,nome_publico,link_google_avaliacao')
    .eq('ativo', true)
    .maybeSingle()

  if (error) throw error
  return data as ClinicReference | null
}

async function fetchServices(clinicId: string): Promise<SignupService[]> {
  const { data, error } = await supabase.rpc('list_public_signup_services', { p_clinica_id: clinicId })

  if (error) throw error
  return (data || []) as SignupService[]
}

function friendlySignupError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message.toLowerCase() : ''

  if (code === '23505' || message.includes('duplicate') || message.includes('unique')) {
    return 'Já encontramos um cadastro com esses dados. Seus dados não foram duplicados; tente atualizar o telefone ou entre em contato pelo WhatsApp.'
  }
  if (code === '42501' || message.includes('permission') || message.includes('row-level security')) {
    return 'O cadastro está temporariamente indisponível por uma regra de segurança. Tente novamente em alguns minutos ou fale conosco pelo WhatsApp.'
  }
  if (code === '23514' || code === '22P02') {
    return 'Confira os dados preenchidos e tente novamente. Alguma informação está fora do formato esperado.'
  }
  if (code === '23503') {
    return 'Não foi possível associar seu cadastro à clínica. Atualize a página e tente novamente.'
  }
  if (code === '42703' || code === 'PGRST204' || message.includes('column') || message.includes('schema cache')) {
    return 'O formulário está passando por uma atualização no sistema. Tente novamente em alguns minutos ou fale conosco pelo WhatsApp.'
  }
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('fetch')) {
    return 'Não conseguimos conectar ao sistema agora. Verifique sua internet e tente novamente.'
  }
  return 'Não foi possível salvar seus dados agora. Confira as informações e tente novamente. Se o problema continuar, fale conosco pelo WhatsApp.'
}

export function ClientSignupPage() {
  const [savedMessage, setSavedMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const form = useForm<ClientSignupForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: { nome: '', telefone: '', email: '', data_nascimento: '', servicos_interesse: [] },
  })

  const clinicQuery = useQuery({
    queryKey: ['signup-clinic'],
    queryFn: fetchClinic,
    staleTime: 60_000,
  })

  const servicesQuery = useQuery({
    queryKey: ['signup-services', clinicQuery.data?.id],
    queryFn: () => fetchServices(clinicQuery.data!.id),
    enabled: Boolean(clinicQuery.data?.id),
    staleTime: 60_000,
  })

  const signupMutation = useMutation({
    mutationFn: async (values: ClientSignupForm) => {
      const clinic = clinicQuery.data
      if (!clinic) throw new Error('Não foi possível identificar a clínica.')

      const phone = phoneDigits(values.telefone)
      const now = new Date().toISOString()
      const payload = {
        clinica_id: clinic.id,
        nome: values.nome.trim(),
        telefone: phone,
        email: values.email?.trim() || null,
        data_nascimento: values.data_nascimento || null,
        servicos_interesse: values.servicos_interesse,
        cpf: null,
        genero: null,
        observacoes: null,
        intervalo_retorno_dias: null,
        parceira: false,
        aceita_marketing: false,
        ativo: true,
        criado_em: now,
        atualizado_em: now,
      }

      const { data: existing, error: selectError } = await supabase
        .from('clientes')
        .select('id')
        .eq('clinica_id', clinic.id)
        .eq('telefone', phone)
        .is('arquivado_em', null)
        .maybeSingle()

      if (selectError) throw selectError

      if (existing?.id) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', existing.id)
        if (error) throw error
        setSavedMessage('Cadastro atualizado com sucesso. Obrigado!')
      } else {
        const { error } = await supabase.from('clientes').insert(payload)
        if (error) throw error
        setSavedMessage('Cadastro realizado com sucesso. Obrigado!')
      }
    },
    onSuccess: () => {
      form.reset()
      setSubmitError('')
    },
    onError: (error) => {
      setSubmitError(friendlySignupError(error))
    },
  })

  if (clinicQuery.isLoading) {
    return (
      <main className="signup-page">
        <LoadingBlock />
      </main>
    )
  }

  if (clinicQuery.error || !clinicQuery.data || servicesQuery.error) {
    return (
      <main className="signup-page">
        <div className="signup-layout">
          <div className="signup-card">
            <p className="tag">Cadastro de cliente</p>
            <h1>Erro ao carregar a página</h1>
            <p>Não foi possível carregar as informações da clínica. Tente novamente mais tarde.</p>
            <Link className="ghost-button" to="/">
              Voltar para a página principal
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const clinic = clinicQuery.data
  const googleReviewLink = clinic.link_google_avaliacao || 'https://g.page/r/CSiUvwdJBI2MEAE/review'
  const clinicName = clinic.nome_publico || 'sua estética'
  const isSubmitted = Boolean(savedMessage)

  return (
    <main className="signup-page">
      <div className="signup-layout">
        <div className="signup-card">
          {!isSubmitted ? (
            <>
              <div className="signup-header">
                <p className="tag">Sem login</p>
                <Link className="ghost-link" to="/">
                  Voltar para a página principal
                </Link>
              </div>
              <h1>Atualize seu cadastro</h1>
              <p>Preencha seus dados para agilizar seu atendimento na {clinicName}.</p>
            </>
          ) : null}

          {isSubmitted ? (
            <div className="signup-success">
              <div className="signup-success-head">
                <CheckCircle size={22} />
                <strong>{savedMessage}</strong>
              </div>
              <div className="signup-actions">
                <a className="primary-button" href={googleReviewLink} target="_blank" rel="noreferrer">
                  Avaliar no Google
                </a>
                <Link className="ghost-button" to="/">
                  Voltar para o site
                </Link>
              </div>
            </div>
          ) : (
            <form
              className="form-panel"
              onSubmit={(event) => void form.handleSubmit((values) => signupMutation.mutate(values))(event)}
            >
              <div className="form-grid">
                <label>
                  Nome completo
                  <input type="text" autoComplete="name" {...form.register('nome')} />
                  <FieldError message={form.formState.errors.nome?.message} />
                </label>
                <label>
                  Data de nascimento
                  <input type="date" {...form.register('data_nascimento')} />
                  <FieldError message={form.formState.errors.data_nascimento?.message} />
                </label>
                <label>
                  Telefone
                  <input type="tel" autoComplete="tel" placeholder="(51) 99999-9999" {...form.register('telefone')} />
                  <FieldError message={form.formState.errors.telefone?.message} />
                </label>
                <label>
                  E-mail
                  <input type="email" autoComplete="email" {...form.register('email')} />
                  <FieldError message={form.formState.errors.email?.message} />
                </label>
                <fieldset className="signup-services-fieldset">
                  <legend>Serviços de interesse</legend>
                  <p className="signup-help">Selecione um ou mais serviços para nos ajudar a preparar seu atendimento.</p>
                  <div className="signup-services-list">
                    {(servicesQuery.data || []).map((service) => (
                      <label className="signup-service-option" key={service.id}>
                        <input type="checkbox" value={service.id} {...form.register('servicos_interesse')} />
                        <span>
                          <strong>{service.nome}</strong>
                          {service.categoria ? <small>{service.categoria}</small> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                  {!servicesQuery.data?.length ? <p className="signup-help">Você poderá escolher o procedimento diretamente com a Thais.</p> : null}
                </fieldset>
              </div>

              {submitError ? <div className="form-alert">{submitError}</div> : null}

              <div className="signup-actions">
                <button className="primary-button" type="submit" disabled={signupMutation.status === 'pending'}>
                  {signupMutation.status === 'pending' ? 'Enviando...' : 'Enviar cadastro'}
                  <ArrowRight size={18} />
                </button>
                <Link className="ghost-button" to="/">
                  Voltar para o site
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
