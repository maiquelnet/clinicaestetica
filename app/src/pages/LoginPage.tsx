import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import heroAvif from '../assets/hero-estetica.avif'
import heroImage from '../assets/hero-estetica.png'
import heroWebp from '../assets/hero-estetica.webp'
import { useAuth } from '../contexts/useAuth'
import { FieldError } from '../components/Ui'

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(6, 'Informe sua senha.'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const { signIn } = useAuth()
  const [error, setError] = useState('')
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginForm) {
    setError('')
    try {
      await signIn(values.email, values.password)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Não foi possível entrar.')
    }
  }

  return (
    <main className="login-page">
      <section className="login-media" aria-label="Thais Schneider Estética">
        <picture>
          <source srcSet={heroAvif} type="image/avif" />
          <source srcSet={heroWebp} type="image/webp" />
          <img src={heroImage} alt="Sala de estética com maca e produtos de beleza" />
        </picture>
        <div>
          <span className="brand-mark">TS</span>
          <h1>Thais Schneider Estética</h1>
          <p>Painel de gestão para clientes, serviços e agenda.</p>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <div className="login-icon">
            <LockKeyhole size={22} />
          </div>
          <p className="eyebrow">Área restrita</p>
          <h2 id="login-title">Entrar no painel</h2>
          <form onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}>
            <label>
              E-mail
              <input type="email" autoComplete="email" {...form.register('email')} />
              <FieldError message={form.formState.errors.email?.message} />
            </label>
            <label>
              Senha
              <input type="password" autoComplete="current-password" {...form.register('password')} />
              <FieldError message={form.formState.errors.password?.message} />
            </label>
            {error ? <div className="form-alert">{error}</div> : null}
            <button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Entrando...' : 'Entrar'}
              <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
