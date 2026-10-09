import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

// Contract of the existing app, not a declaration that Cloud has been migrated.
// Keep the generated Cloud types untouched until its tables are provisioned.
export type DeliveryRow = {
  id: string;
  cliente: string;
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  complemento: string;
  observacoes: string;
  valor: number;
  data_hora: string;
  agendado_para: string | null;
  lat: number | null;
  lng: number | null;
  status: "pendente" | "em_rota" | "entregue" | "cancelada";
  pago: boolean | null;
  criado_em: string;
  track_code: string | null;
};

type ClienteRow = {
  key: string; cliente: string; telefone: string | null; cep: string | null;
  endereco: string | null; numero: string | null; bairro: string | null;
  cidade: string | null; complemento: string | null; lat: number | null; lng: number | null;
};
type ProdutoRow = {
  id: string; nome: string; descricao: string | null; categoria: string | null;
  preco: number | string | null; imagem_url: string | null; ativo: boolean | null; ordem: number | null;
};
type CompanyRow = {
  id: string; nome: string; saudacao: string; whatsapp_template: string;
  endereco_origem: string | null; lat_origem: number | null; lng_origem: number | null; atualizado_em: string;
};
type DriverRow = {
  id: string; lat: number; lng: number; accuracy: number | null;
  heading: number | null; speed: number | null; updated_at: string;
};
type TrackRow = Pick<DeliveryRow, "cliente" | "endereco" | "numero" | "bairro" | "cidade" | "lat" | "lng" | "status"> & {
  empresa: string | null; origem_lat: number | null; origem_lng: number | null; origem_endereco: string | null;
};
type Table<Row extends Record<string, unknown>> = {
  Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [];
};
type AppSchema = {
  Tables: {
    deliveries: Table<DeliveryRow>;
    clientes: Table<ClienteRow>;
    produtos: Table<ProdutoRow>;
    company_settings: Table<CompanyRow>;
    driver_locations: Table<DriverRow>;
  };
  Views: Record<never, never>;
  Functions: { get_track: { Args: { _code: string }; Returns: TrackRow[] } };
};

// Uses the same managed connection and its security policies; no extra client.
export const appDatabase = () => {
  const connection = supabase as unknown as SupabaseClient<{ public: AppSchema }>;
  return connection.schema("public");
};