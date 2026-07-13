export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type GenericTable = {
  Row: Record<string, unknown>
  Insert: Record<string, unknown>
  Update: Record<string, unknown>
  Relationships: []
}

export type Database = {
  public: {
    Tables: Record<string, GenericTable>
    Views: Record<string, never>
    Functions: {
      salvar_agendamento: {
        Args: {
          p_agendamento_id: string | null
          p_clinica_id: string
          p_cliente_id: string
          p_servico_id: string | null
          p_profissional_id: string | null
          p_inicio_em: string
          p_fim_em: string
          p_valor_aplicado: number
          p_status: string
          p_observacoes: string | null
        }
        Returns: string
      }
      confirmar_lista_espera: {
        Args: {
          p_lista_espera_id: string
          p_profissional_id: string | null
        }
        Returns: string
      }
      salvar_servico_com_preco: {
        Args: {
          p_servico_id: string | null
          p_clinica_id: string
          p_nome: string
          p_categoria: string | null
          p_descricao: string | null
          p_duracao_minutos: number
          p_intervalo_retorno_dias: number | null
          p_preco_sob_consulta: boolean
          p_observacao_preco: string | null
          p_ativo: boolean
          p_valor: number | null
          p_inicio_validade: string
        }
        Returns: string
      }
      salvar_campanha_com_destinatarios: {
        Args: {
          p_campanha_id: string | null
          p_clinica_id: string
          p_modelo_mensagem_id: string | null
          p_titulo: string
          p_mensagem: string
          p_publico: string
          p_status: string
          p_criado_por: string | null
        }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
