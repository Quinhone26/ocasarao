import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ynyulwsycndpyaycggrx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_krbyZzfzqvOL8dkLaDng8w_bvg5DAuW";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
  criado_em: string;
};
