import { useEffect, useState, useCallback } from "react";

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
  agendadoPara?: string; // ISO — opcional, horário programado para a entrega
  lat?: number; // coordenada do destino (opcional)
  lng?: number;
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

const KEY = "motoboy_deliveries_v1";
const EVENT = "motoboy_deliveries_change";

function read(): Delivery[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Delivery[]) : [];
  } catch {
    return [];
  }
}

function write(items: Delivery[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function useDeliveries() {
  const [items, setItems] = useState<Delivery[]>([]);

  useEffect(() => {
    setItems(read());
    const handler = () => setItems(read());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const create = useCallback((data: Omit<Delivery, "id" | "criadoEm" | "status"> & { status?: DeliveryStatus }) => {
    const all = read();
    const d: Delivery = {
      ...data,
      status: data.status ?? "pendente",
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
    };
    write([d, ...all]);
    return d;
  }, []);

  const update = useCallback((id: string, patch: Partial<Delivery>) => {
    write(read().map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((d) => d.id !== id));
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
