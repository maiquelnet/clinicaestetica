import { supabase } from './supabase'
import type { Database } from './database.types'

type RpcName = keyof Database['public']['Functions']
type RpcArgs<Name extends RpcName> = Database['public']['Functions'][Name]['Args']

export async function saveAppointment(args: RpcArgs<'salvar_agendamento'>) {
  const { error } = await supabase.rpc('salvar_agendamento', args)
  if (error) throw error
}

export async function confirmWaitlistEntry(args: RpcArgs<'confirmar_lista_espera'>) {
  const { error } = await supabase.rpc('confirmar_lista_espera', args)
  if (error) throw error
}

export async function saveServiceWithPrice(args: RpcArgs<'salvar_servico_com_preco'>) {
  const { error } = await supabase.rpc('salvar_servico_com_preco', args)
  if (error) throw error
}

export async function saveCampaignWithRecipients(args: RpcArgs<'salvar_campanha_com_destinatarios'>) {
  const { error } = await supabase.rpc('salvar_campanha_com_destinatarios', args)
  if (error) throw error
}
