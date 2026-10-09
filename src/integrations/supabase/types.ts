export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cliente: string
          complemento: string | null
          endereco: string | null
          key: string
          lat: number | null
          lng: number | null
          numero: string | null
          telefone: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cliente: string
          complemento?: string | null
          endereco?: string | null
          key: string
          lat?: number | null
          lng?: number | null
          numero?: string | null
          telefone?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cliente?: string
          complemento?: string | null
          endereco?: string | null
          key?: string
          lat?: number | null
          lng?: number | null
          numero?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          atualizado_em: string
          endereco_origem: string | null
          id: string
          lat_origem: number | null
          lng_origem: number | null
          nome: string
          saudacao: string
          whatsapp_template: string
        }
        Insert: {
          atualizado_em?: string
          endereco_origem?: string | null
          id?: string
          lat_origem?: number | null
          lng_origem?: number | null
          nome?: string
          saudacao?: string
          whatsapp_template?: string
        }
        Update: {
          atualizado_em?: string
          endereco_origem?: string | null
          id?: string
          lat_origem?: number | null
          lng_origem?: number | null
          nome?: string
          saudacao?: string
          whatsapp_template?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          agendado_para: string | null
          bairro: string
          cep: string
          cidade: string
          cliente: string
          complemento: string
          criado_em: string
          data_hora: string
          endereco: string
          id: string
          lat: number | null
          lng: number | null
          numero: string
          observacoes: string
          pago: boolean
          status: string
          telefone: string
          track_code: string | null
          valor: number
        }
        Insert: {
          agendado_para?: string | null
          bairro?: string
          cep?: string
          cidade?: string
          cliente: string
          complemento?: string
          criado_em?: string
          data_hora?: string
          endereco: string
          id?: string
          lat?: number | null
          lng?: number | null
          numero?: string
          observacoes?: string
          pago?: boolean
          status?: string
          telefone?: string
          track_code?: string | null
          valor?: number
        }
        Update: {
          agendado_para?: string | null
          bairro?: string
          cep?: string
          cidade?: string
          cliente?: string
          complemento?: string
          criado_em?: string
          data_hora?: string
          endereco?: string
          id?: string
          lat?: number | null
          lng?: number | null
          numero?: string
          observacoes?: string
          pago?: boolean
          status?: string
          telefone?: string
          track_code?: string | null
          valor?: number
        }
        Relationships: []
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          heading: number | null
          id: string
          lat: number
          lng: number
          speed: number | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          heading?: number | null
          id?: string
          lat: number
          lng: number
          speed?: number | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          speed?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria: string | null
          criado_em: string
          descricao: string | null
          id: string
          imagem_url: string | null
          nome: string
          ordem: number
          preco: number
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          criado_em?: string
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          nome: string
          ordem?: number
          preco?: number
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          criado_em?: string
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          nome?: string
          ordem?: number
          preco?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_track: {
        Args: { _code: string }
        Returns: {
          bairro: string
          cidade: string
          cliente: string
          empresa: string
          endereco: string
          lat: number
          lng: number
          numero: string
          origem_endereco: string
          origem_lat: number
          origem_lng: number
          status: string
        }[]
      }
      get_track_driver: {
        Args: { _code: string }
        Returns: {
          accuracy: number
          lat: number
          lng: number
          updated_at: string
        }[]
      }
      save_online_order: {
        Args: { _customer: Json; _delivery: Json }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
