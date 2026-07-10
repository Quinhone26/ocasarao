import { useEffect, useState, useCallback, useRef } from "react";
import { z } from "zod";
import { supabase, type DeliveryRow } from "@/integrations/supabase/client";
import { formatCep, isValidCep, normalizeCep } from "@/lib/cep";

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
  agendadoPara: string | null; // ISO ou null (nunca undefined)
  lat: number | null;
  lng: number | null;
  status: DeliveryStatus;
  criadoEm: string;
}

// ---------- Validação (Zod) ----------

const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Data/hora inválida");

export const deliverySchema = z.object({
  cliente: z.string().trim().min(1, "Cliente obrigatório").max(100),
  telefone: z.string().trim().max(20).default(""),
  cep: z
    .string()
    .trim()
    .default("")
    // Normaliza para 00000-000 (ou "" se vazio) antes de validar.
    .transform((s) => {
      const d = normalizeCep(s);
      return d.length === 0 ? "" : formatCep(d);
    })
    .refine(
      (s) => s === "" || isValidCep(s),
      "CEP inválido — precisa ter 8 dígitos e não pode ser sequência repetida",
    ),
  endereco: z.string().trim().min(1, "Endereço obrigatório").max(200),
  numero: z.string().trim().max(20).default(""),
  bairro: z.string().trim().max(100).default(""),
  cidade: z.string().trim().max(100).default(""),
  complemento: z.string().trim().max(200).default(""),
  observacoes: z.string().trim().max(1000).default(""),
  valor: z.number().min(0, "Valor não pode ser negativo").max(1_000_000),
  dataHora: isoDate,
  agendadoPara: isoDate.nullable().default(null),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  status: z
    .enum(["pendente", "em_rota", "entregue", "cancelada"])
    .default("pendente"),
});

export type DeliveryInput = z.infer<typeof deliverySchema>;

// Distância entre dois pontos em metros (Haversine).
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ---------- Cache local versionado ----------

const CACHE_KEY = "motoboy_deliveries_cache_v2";

function readCache(): Delivery[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Delivery[];
  } catch {
    return [];
  }
}

function writeCache(items: Delivery[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(items));
  } catch {
    /* quota / storage indisponível */
  }
}

// ---------- Conversão DB <-> App ----------

function fromRow(r: DeliveryRow): Delivery {
  return {
    id: r.id,
    cliente: r.cliente ?? "",
    telefone: r.telefone ?? "",
    cep: r.cep ?? "",
    endereco: r.endereco ?? "",
    numero: r.numero ?? "",
    bairro: r.bairro ?? "",
    cidade: r.cidade ?? "",
    complemento: r.complemento ?? "",
    observacoes: r.observacoes ?? "",
    valor: Number(r.valor) || 0,
    dataHora: r.data_hora,
    agendadoPara: r.agendado_para,
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
  if (d.agendadoPara !== undefined) r.agendado_para = d.agendadoPara;
  if (d.lat !== undefined) r.lat = d.lat;
  if (d.lng !== undefined) r.lng = d.lng;
  if (d.status !== undefined) r.status = d.status;
  if (d.criadoEm !== undefined) r.criado_em = d.criadoEm;
  return r;
}

// ---------- Hook ----------

export function useDeliveries() {
  const [items, setItems] = useState<Delivery[]>(() => readCache());
  const localOpsRef = useRef<Set<string>>(new Set());

  const applyItems = useCallback(
    (updater: (prev: Delivery[]) => Delivery[]) => {
      setItems((prev) => {
        const next = updater(prev);
        writeCache(next);
        return next;
      });
    },
    [],
  );

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
    applyItems(() => list);
  }, [applyItems]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("deliveries-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        (payload) => {
          const eventType = payload.eventType;
          // Pular eco de operação local que já aplicamos otimisticamente.
          const rowId =
            (payload.new as DeliveryRow | null)?.id ??
            (payload.old as DeliveryRow | null)?.id;
          if (rowId && localOpsRef.current.has(rowId)) {
            localOpsRef.current.delete(rowId);
            return;
          }
          if (eventType === "INSERT" && payload.new) {
            const d = fromRow(payload.new as DeliveryRow);
            applyItems((prev) =>
              prev.some((x) => x.id === d.id) ? prev : [d, ...prev],
            );
          } else if (eventType === "UPDATE" && payload.new) {
            const d = fromRow(payload.new as DeliveryRow);
            applyItems((prev) =>
              prev.map((x) => (x.id === d.id ? d : x)),
            );
          } else if (eventType === "DELETE" && payload.old) {
            const id = (payload.old as DeliveryRow).id;
            applyItems((prev) => prev.filter((x) => x.id !== id));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh, applyItems]);

  const create = useCallback(
    async (input: DeliveryInput): Promise<Delivery> => {
      const parsed = deliverySchema.parse(input);
      const d: Delivery = {
        ...parsed,
        id: crypto.randomUUID(),
        criadoEm: new Date().toISOString(),
      };
      localOpsRef.current.add(d.id);
      applyItems((prev) => [d, ...prev]);
      const { error } = await supabase.from("deliveries").insert(toRow(d));
      if (error) {
        localOpsRef.current.delete(d.id);
        applyItems((prev) => prev.filter((x) => x.id !== d.id));
        console.error("[deliveries] create error", error);
        throw error;
      }
      return d;
    },
    [applyItems],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Delivery>) => {
      const before = items.find((x) => x.id === id);
      // Normaliza/valida o CEP também em updates parciais.
      const normalized: Partial<Delivery> = { ...patch };
      if (patch.cep !== undefined) {
        const digits = normalizeCep(patch.cep);
        if (digits.length > 0 && !isValidCep(digits)) {
          throw new Error("CEP inválido — precisa ter 8 dígitos");
        }
        normalized.cep = digits.length === 0 ? "" : formatCep(digits);
      }
      localOpsRef.current.add(id);
      applyItems((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...normalized } : d)),
      );
      const { error } = await supabase
        .from("deliveries")
        .update(toRow(normalized))
        .eq("id", id);
      if (error) {
        localOpsRef.current.delete(id);
        // rollback
        if (before) {
          applyItems((prev) => prev.map((d) => (d.id === id ? before : d)));
        }
        console.error("[deliveries] update error", error);
        throw error;
      }
    },
    [applyItems, items],
  );

  const remove = useCallback(
    async (id: string) => {
      const before = items.find((x) => x.id === id);
      localOpsRef.current.add(id);
      applyItems((prev) => prev.filter((d) => d.id !== id));
      const { error } = await supabase.from("deliveries").delete().eq("id", id);
      if (error) {
        localOpsRef.current.delete(id);
        if (before) applyItems((prev) => [before, ...prev]);
        console.error("[deliveries] delete error", error);
        throw error;
      }
    },
    [applyItems, items],
  );

  return { items, create, update, remove };
}

export const statusLabel: Record<DeliveryStatus, string> = {
  pendente: "Pendente",
  em_rota: "Em Rota",
  entregue: "Entregue",
  cancelada: "Cancelada",
};

export function buildMapsUrl(d: Delivery) {
  // URL universal do Google Maps: no Android e iPhone, abre direto o app
  // do Google Maps se instalado; senão, cai no navegador.
  // Prioriza lat/lng quando salvos — mais preciso que geocodificar o texto.
  const base = "https://www.google.com/maps/dir/?api=1&travelmode=driving";
  if (d.lat != null && d.lng != null) {
    return `${base}&destination=${d.lat},${d.lng}`;
  }
  const parts = [
    `${d.endereco}${d.numero ? ", " + d.numero : ""}`,
    d.bairro,
    d.cidade,
  ]
    .filter(Boolean)
    .join(", ");
  return `${base}&destination=${encodeURIComponent(parts)}`;
}

export function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
