import { useEffect, useState, useCallback } from "react";
import { supabase, type DeliveryRow } from "@/integrations/supabase/client";

export type DeliveryStatus = "pendente" | "em_rota" | "entregue" | "cancelada";

export interface Delivery {
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
  dataHora: string; // ISO
  agendadoPara?: string; // ISO — opcional
  lat?: number | null;
  lng?: number | null;
  status: DeliveryStatus;
  criadoEm: string;
}

// Distância entre dois pontos em metros (Haversine).
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const CACHE_KEY = "motoboy_deliveries_cache_v1";

function fromRow(r: DeliveryRow): Delivery {
  return {
    id: r.id,
    cliente: r.cliente,
    telefone: r.telefone,
    cep: r.cep,
    endereco: r.endereco,
    numero: r.numero,
    bairro: r.bairro,
    cidade: r.cidade,
    complemento: r.complemento,
    observacoes: r.observacoes,
    valor: Number(r.valor),
    dataHora: r.data_hora,
    agendadoPara: r.agendado_para ?? undefined,
    lat: r.lat,
    lng: r.lng,
    status: r.status,
    criadoEm: r.criado_em,
  };
}

function toRow(d: Partial<Delivery>): Partial<DeliveryRow> {
  const r: Partial<DeliveryRow> = {};
  if (d.id !== undefined) r.id = d.id;
  if (d.cliente !== undefined) r.cliente = d.cliente;
  if (d.telefone !== undefined) r.telefone = d.telefone;
  if (d.cep !== undefined) r.cep = d.cep;
  if (d.endereco !== undefined) r.endereco = d.endereco;
  if (d.numero !== undefined) r.numero = d.numero;
  if (d.bairro !== undefined) r.bairro = d.bairro;
  if (d.cidade !== undefined) r.cidade = d.cidade;
  if (d.complemento !== undefined) r.complemento = d.complemento;
  if (d.observacoes !== undefined) r.observacoes = d.observacoes;
  if (d.valor !== undefined) r.valor = d.valor;
  if (d.dataHora !== undefined) r.data_hora = d.dataHora;
  if (d.agendadoPara !== undefined) r.agendado_para = d.agendadoPara ?? null;
  if (d.lat !== undefined) r.lat = d.lat ?? null;
  if (d.lng !== undefined) r.lng = d.lng ?? null;
  if (d.status !== undefined) r.status = d.status;
  if (d.criadoEm !== undefined) r.criado_em = d.criadoEm;
  return r;
}

function readCache(): Delivery[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Delivery[]) : [];
  } catch {
    return [];
  }
}

function writeCache(items: Delivery[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(items));
  } catch {}
}

export function useDeliveries() {
  const [items, setItems] = useState<Delivery[]>(() => readCache());

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("deliveries")
      .select("*")
      .order("criado_em", { ascending: false });
    if (error) {
      console.error("[deliveries] load error", error);
      return;
    }
    const list = (data as DeliveryRow[]).map(fromRow);
    setItems(list);
    writeCache(list);
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("deliveries-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const create = useCallback(
    async (data: Omit<Delivery, "id" | "criadoEm" | "status"> & { status?: DeliveryStatus }) => {
      const d: Delivery = {
        ...data,
        status: data.status ?? "pendente",
        id: crypto.randomUUID(),
        criadoEm: new Date().toISOString(),
      };
      const { error } = await supabase.from("deliveries").insert(toRow(d));
      if (error) {
        console.error("[deliveries] create error", error);
        throw error;
      }
      setItems((prev) => {
        const next = [d, ...prev];
        writeCache(next);
        return next;
      });
      return d;
    },
    [],
  );

  const update = useCallback(async (id: string, patch: Partial<Delivery>) => {
    const { error } = await supabase.from("deliveries").update(toRow(patch)).eq("id", id);
    if (error) {
      console.error("[deliveries] update error", error);
      throw error;
    }
    setItems((prev) => {
      const next = prev.map((d) => (d.id === id ? { ...d, ...patch } : d));
      writeCache(next);
      return next;
    });
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("deliveries").delete().eq("id", id);
    if (error) {
      console.error("[deliveries] delete error", error);
      throw error;
    }
    setItems((prev) => {
      const next = prev.filter((d) => d.id !== id);
      writeCache(next);
      return next;
    });
  }, []);

  return { items, create, update, remove };
}

export const statusLabel: Record<DeliveryStatus, string> = {
  pendente: "Pendente",
  em_rota: "Em Rota",
  entregue: "Entregue",
  cancelada: "Cancelada",
};

export function buildMapsUrl(d: Delivery) {
  const parts = [
    `${d.endereco}${d.numero ? ", " + d.numero : ""}`,
    d.bairro,
    d.cidade,
  ].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(parts)}&travelmode=driving`;
}

export function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
