import { supabase } from '../../../lib/supabase'
import type { Client, Service } from '../../../lib/types'

export async function fetchClientsAndServices(clinicId: string) {
  const [clients, services] = await Promise.all([
    supabase
      .from('clientes')
      .select('*')
      .eq('clinica_id', clinicId)
      .eq('ativo', true)
      .is('arquivado_em', null)
      .order('nome', { ascending: true }),
    supabase
      .from('servicos')
      .select('*,precos_servicos(*)')
      .eq('clinica_id', clinicId)
      .eq('ativo', true)
      .is('arquivado_em', null)
      .order('nome', { ascending: true }),
  ])
  if (clients.error) throw clients.error
  if (services.error) throw services.error
  return { clients: (clients.data || []) as Client[], services: (services.data || []) as Service[] }
}