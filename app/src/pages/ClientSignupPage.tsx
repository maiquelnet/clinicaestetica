import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, CheckCircle } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { FieldError, LoadingBlock } from '../components/Ui'
import { supabase } from '../lib/supabase'

type ClinicReference = {
  id: string
  nome_publico: string | null
  link_google_avaliacao: string | null
}

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

export function ClientSignupPage() {
  const [savedMessage, setSavedMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const form = useForm<ClientSignupForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: { nome: '', telefone: '', email: '', data_nascimento: '' },
  })

  const clinicQuery = useQuery({
    queryKey: ['signup-clinic'],
    queryFn: fetchClinic,
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
        cpf: null,
        genero: null,
        observacoes: null,
        intervalo_retorno_dias: null,
        parceira: false,
        aceita_marketing: false,
        whatsapp_opt_in_status: 'pendente' as const,
        whatsapp_opt_in_em: null,
        whatsapp_opt_in_origem: 'cadastro_publico',
        whatsapp_opt_in_versao: 'cadastro_v1',
        whatsapp_opt_out_em: null,
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
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível salvar seus dados.')
    },
  })

  if (clinicQuery.isLoading) {
    return (
      <main className="signup-page">
        <LoadingBlock />
      </main>
    )
  }

  if (clinicQuery.error || !clinicQuery.data) {
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
          <div className="signup-header">
            <p className="tag">Sem login</p>
            <Link className="ghost-link" to="/">
              Voltar para a página principal
            </Link>
          </div>
          <h1>Atualize seu cadastro</h1>
          <p>Preencha seus dados para agilizar seu atendimento na {clinicName}.</p>

          {isSubmitted ? (
            <div className="signup-success">
              <div className="signup-success-head">
                <CheckCircle size={22} />
                <strong>{savedMessage}</strong>
              </div>
              <p>Seu cadastro já está salvo. Caso queira, clique no botão abaixo apenas após o atendimento para avaliar a clínica no Google.</p>
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
