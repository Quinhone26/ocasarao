import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // Erro cedo, com mensagem clara — evita "Invalid URL" críptico no build
  throw new Error(
    "Supabase: variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são obrigatórias. Configure no arquivo .env.",
  );
}

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
  pago: boolean | null;
  criado_em: string;
};
