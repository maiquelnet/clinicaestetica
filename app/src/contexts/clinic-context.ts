import { createContext } from 'react'
import type { Clinic, ClinicMembership, Profile } from '../lib/types'

export type ClinicContextValue = {
  profile: Profile | null
  memberships: ClinicMembership[]
  activeClinic: Clinic | null
  activeMembership: ClinicMembership | null
  activeClinicId: string | null
  loading: boolean
  error: Error | null
  setActiveClinicId: (clinicId: string) => void
}

export const ClinicContext = createContext<ClinicContextValue | null>(null)
