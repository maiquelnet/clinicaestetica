import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Clinic, ClinicMembership, Profile } from '../lib/types'
import { ClinicContext, type ClinicContextValue } from './clinic-context'
import { useAuth } from './useAuth'
const EMPTY_MEMBERSHIPS: ClinicMembership[] = []

type ClinicMembershipRow = {
  id: string
  clinica_id: string
  perfil_id: string
  papel: string
  ativo: boolean
  clinicas: Clinic | Clinic[] | null
}

async function fetchClinicContext(userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from('perfis')
    .select('id,nome,email,telefone,ativo')
    .eq('id', userId)
    .maybeSingle<Profile>()

  if (profileError) throw profileError

  const { data, error } = await supabase
    .from('usuarios_clinicas')
    .select('id,clinica_id,perfil_id,papel,ativo,clinicas(id,nome,nome_publico,telefone,email,endereco,complemento,cep,cidade,estado,fuso_horario,link_google_avaliacao,google_place_id,ativo)')
    .eq('perfil_id', userId)
    .eq('ativo', true)

  if (error) throw error

  const memberships = ((data || []) as ClinicMembershipRow[])
    .map((row) => {
      const clinica = Array.isArray(row.clinicas) ? row.clinicas[0] : row.clinicas
      if (!clinica || !clinica.ativo) return null
      return {
        id: row.id,
        clinica_id: row.clinica_id,
        perfil_id: row.perfil_id,
        papel: row.papel,
        ativo: row.ativo,
        clinica,
      }
    })
    .filter((membership): membership is ClinicMembership => Boolean(membership))

  return { profile: profile ?? null, memberships }
}

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['clinic-context', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchClinicContext(user!.id),
    staleTime: 60_000,
  })

  const memberships = query.data?.memberships ?? EMPTY_MEMBERSHIPS
  const activeClinicId = selectedClinicId || memberships[0]?.clinica_id || null
  const activeMembership =
    memberships.find((membership) => membership.clinica_id === activeClinicId) ?? null

  const value = useMemo<ClinicContextValue>(
    () => ({
      profile: query.data?.profile ?? null,
      memberships,
      activeClinic: activeMembership?.clinica ?? null,
      activeMembership,
      activeClinicId,
      loading: query.isLoading,
      error: query.error,
      setActiveClinicId: setSelectedClinicId,
    }),
    [activeClinicId, activeMembership, memberships, query.data?.profile, query.error, query.isLoading],
  )

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>
}
