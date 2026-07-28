import { supabase } from "@/integrations/supabase/client";

const DRIVER_ID = "default";

// Gera um código curto (6 chars, base32 sem ambíguos) para o link público.
export function generateTrackCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// Domínio público usado nos links enviados ao cliente.
// Defina VITE_PUBLIC_SITE_URL (ex.: https://ocasarao.com.br) ao conectar
// um domínio próprio — assim o link deixa de mostrar ".lovable.app".
export function publicBaseUrl(): string {
  const configured = import.meta.env?.VITE_PUBLIC_SITE_URL as string | undefined;
  if (configured) return configured.replace(/\/+$/, "");
  return "https://ocasarao.lovable.app";
}

export function buildTrackUrl(code: string | null | undefined): string | null {
  if (!code) return null;
  return `${publicBaseUrl()}/r/${code}`;
}

// Link da página de pedidos do cliente.
export function buildOrderUrl(): string {
  return `${publicBaseUrl()}/pedido`;
}


export type DriverLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
  updated_at: string;
};

// Envia (upsert) a posição do entregador. Usada pela tela /rota.
export async function publishDriverLocation(pos: {
  lat: number;
  lng: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}): Promise<void> {
  const { error } = await supabase.from("driver_locations").upsert(
    {
      id: DRIVER_ID,
      lat: pos.lat,
      lng: pos.lng,
      accuracy: pos.accuracy ?? null,
      heading: pos.heading ?? null,
      speed: pos.speed ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) console.warn("[tracking] publish:", error.message);
}

export async function fetchDriverLocation(): Promise<DriverLocation | null> {
  const { data, error } = await supabase
    .from("driver_locations")
    .select("lat,lng,accuracy,updated_at")
    .eq("id", DRIVER_ID)
    .maybeSingle();
  if (error || !data) return null;
  return data as DriverLocation;
}

export function subscribeDriverLocation(
  onChange: (loc: DriverLocation) => void,
): () => void {
  const channel = supabase
    .channel("driver-loc")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "driver_locations",
        filter: `id=eq.${DRIVER_ID}`,
      },
      (payload) => {
        const row = payload.new as DriverLocation | null;
        if (row) onChange(row);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export type PublicTrack = {
  cliente: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  lat: number | null;
  lng: number | null;
  status: "pendente" | "em_rota" | "entregue" | "cancelada";
  empresa: string | null;
  origem_lat: number | null;
  origem_lng: number | null;
  origem_endereco: string | null;
};

export async function fetchPublicTrack(code: string): Promise<PublicTrack | null> {
  const { data, error } = await supabase.rpc("get_track", { _code: code });
  if (error) {
    console.warn("[tracking] get_track:", error.message);
    return null;
  }
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw) return null;
  const row = raw as Partial<PublicTrack>;
  return {
    cliente: row.cliente ?? "",
    endereco: row.endereco ?? "",
    numero: row.numero ?? "",
    bairro: row.bairro ?? "",
    cidade: row.cidade ?? "",
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    status: (row.status as PublicTrack["status"]) ?? "pendente",
    empresa: row.empresa ?? null,
    origem_lat: row.origem_lat ?? null,
    origem_lng: row.origem_lng ?? null,
    origem_endereco: row.origem_endereco ?? null,
  };
}
