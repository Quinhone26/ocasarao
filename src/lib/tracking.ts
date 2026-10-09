import { supabase } from "@/integrations/supabase/client";
import { appDatabase } from "@/lib/database-contract";

const DRIVER_ID = "default";

// Gera um código curto (6 chars, base32 sem ambíguos) para o link público.
export function generateTrackCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function buildTrackUrl(code: string | null | undefined): string | null {
  if (!code) return null;
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://ocasarao.lovable.app";
  return `${origin}/r/${code}`;
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
  const { error } = await appDatabase().from("driver_locations").upsert(
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

export async function fetchDriverLocation(code: string): Promise<DriverLocation | null> {
  const { data: rows, error } = await appDatabase().rpc('get_track_driver',{_code:code});
  const data = rows?.[0];
  if (error || !data) return null;
  return data as DriverLocation;
}

export function subscribeDriverLocation(
  onChange: (loc: DriverLocation) => void,
  code: string,
): () => void {
  let stopped = false;
  const timer = setInterval(async()=>{
    const loc = await fetchDriverLocation(code);
    if (!stopped && loc) onChange(loc);
  },10000);
  return () => {
    stopped = true;
    clearInterval(timer);
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
  const { data, error } = await appDatabase().rpc("get_track", { _code: code });
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
