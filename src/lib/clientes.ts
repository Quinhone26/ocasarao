import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { appDatabase } from "@/lib/database-contract";
import type { Delivery } from "@/lib/deliveries";

export interface Cliente {
  key: string;
  cliente: string;
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  complemento: string;
  lat: number | null;
  lng: number | null;
  entregas: number;
  compras: number;
  totalValor: number;
  ultimaEntrega: string;
}

type StoredCliente = Omit<
  Cliente,
  "entregas" | "compras" | "totalValor" | "ultimaEntrega"
>;

type ClienteRow = {
  key: string;
  cliente: string;
  telefone: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  complemento: string | null;
  lat: number | null;
  lng: number | null;
};

function normPhone(t: string): string {
  return (t ?? "").replace(/\D/g, "");
}

function normName(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Chave estável do cliente: telefone (dígitos) se houver, senão nome normalizado.
export function clienteKey(cliente: string, telefone: string): string {
  const p = normPhone(telefone);
  if (p.length >= 8) return `p:${p}`;
  const n = normName(cliente);
  return n ? `n:${n}` : "";
}

// ---------- Cache local + store em memória com sync Supabase ----------

const CACHE_KEY = "motoboy_clientes_store_v2";

function fromRow(r: ClienteRow): StoredCliente {
  return {
    key: r.key,
    cliente: r.cliente ?? "",
    telefone: r.telefone ?? "",
    cep: r.cep ?? "",
    endereco: r.endereco ?? "",
    numero: r.numero ?? "",
    bairro: r.bairro ?? "",
    cidade: r.cidade ?? "",
    complemento: r.complemento ?? "",
    lat: r.lat,
    lng: r.lng,
  };
}

function toRow(c: StoredCliente): ClienteRow {
  return {
    key: c.key,
    cliente: c.cliente,
    telefone: c.telefone || "",
    cep: c.cep || "",
    endereco: c.endereco || "",
    numero: c.numero || "",
    bairro: c.bairro || "",
    cidade: c.cidade || "",
    complemento: c.complemento || "",
    lat: c.lat,
    lng: c.lng,
  };
}

function readCache(): StoredCliente[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredCliente[]) : [];
  } catch {
    return [];
  }
}

function writeCache(list: StoredCliente[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* quota indisponível */
  }
}

let memoryStore: StoredCliente[] = readCache();
const subscribers = new Set<() => void>();
let realtimeStarted = false;

function setStore(next: StoredCliente[]) {
  memoryStore = next;
  writeCache(next);
  for (const cb of subscribers) cb();
}

function upsertLocal(c: StoredCliente) {
  const idx = memoryStore.findIndex((x) => x.key === c.key);
  const next = memoryStore.slice();
  if (idx === -1) next.push(c);
  else next[idx] = { ...next[idx], ...c };
  setStore(next);
}

function removeLocal(key: string) {
  setStore(memoryStore.filter((x) => x.key !== key));
}

async function loadFromSupabase() {
  const { data, error } = await appDatabase().from("clientes").select("*");
  if (error) {
    console.error("[clientes] load error", error);
    return;
  }
  setStore((data as ClienteRow[]).map(fromRow));
}

function startRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;
  loadFromSupabase();
  supabase
    .channel("clientes-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "clientes" },
      (payload) => {
        if (payload.eventType === "DELETE" && payload.old) {
          removeLocal((payload.old as ClienteRow).key);
        } else if (payload.new) {
          upsertLocal(fromRow(payload.new as ClienteRow));
        }
      },
    )
    .subscribe();
}

// ---------- API pública ----------

export async function upsertClienteFromDelivery(d: {
  cliente: string;
  telefone: string;
  cep?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  complemento?: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const key = clienteKey(d.cliente, d.telefone);
  if (!key) return;
  const prev = memoryStore.find((x) => x.key === key);
  // Mescla com o que já existe pra não sobrescrever campos com string vazia.
  const merged: StoredCliente = {
    key,
    cliente: d.cliente || prev?.cliente || "",
    telefone: d.telefone || prev?.telefone || "",
    cep: d.cep || prev?.cep || "",
    endereco: d.endereco || prev?.endereco || "",
    numero: d.numero || prev?.numero || "",
    bairro: d.bairro || prev?.bairro || "",
    cidade: d.cidade || prev?.cidade || "",
    complemento: d.complemento || prev?.complemento || "",
    lat: d.lat ?? prev?.lat ?? null,
    lng: d.lng ?? prev?.lng ?? null,
  };
  upsertLocal(merged);
  const { error } = await appDatabase().from("clientes").upsert(toRow(merged));
  if (error) console.error("[clientes] upsert error", error);
}

export async function updateStoredCliente(prevKey: string, updated: Cliente) {
  const nextKey = clienteKey(updated.cliente, updated.telefone) || prevKey;
  const next: StoredCliente = {
    key: nextKey,
    cliente: updated.cliente,
    telefone: updated.telefone,
    cep: updated.cep,
    endereco: updated.endereco,
    numero: updated.numero,
    bairro: updated.bairro,
    cidade: updated.cidade,
    complemento: updated.complemento,
    lat: updated.lat,
    lng: updated.lng,
  };
  if (nextKey !== prevKey) removeLocal(prevKey);
  upsertLocal(next);
  if (nextKey !== prevKey) {
    const { error: delErr } = await appDatabase()
      .from("clientes")
      .delete()
      .eq("key", prevKey);
    if (delErr) console.error("[clientes] rename delete error", delErr);
  }
  const { error } = await appDatabase().from("clientes").upsert(toRow(next));
  if (error) console.error("[clientes] update error", error);
}

export async function removeStoredCliente(key: string) {
  removeLocal(key);
  const { error } = await appDatabase().from("clientes").delete().eq("key", key);
  if (error) console.error("[clientes] delete error", error);
}

// ---------- Agregação ----------

export function aggregateClientes(
  items: Delivery[],
  stored: StoredCliente[] = memoryStore,
): Cliente[] {
  const map = new Map<string, Cliente>();

  for (const s of stored) {
    if (!s.key) continue;
    map.set(s.key, {
      ...s,
      entregas: 0,
      compras: 0,
      totalValor: 0,
      ultimaEntrega: "",
    });
  }

  const sorted = [...items].sort(
    (a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime(),
  );
  for (const d of sorted) {
    const key = clienteKey(d.cliente, d.telefone);
    if (!key) continue;
    const cur = map.get(key);
    if (cur) {
      cur.entregas++;
      if (d.status === "entregue") cur.compras++;
      cur.totalValor += d.valor || 0;
      if (!cur.ultimaEntrega) cur.ultimaEntrega = d.dataHora;
      if (!cur.telefone && d.telefone) cur.telefone = d.telefone;
      if (!cur.cep && d.cep) cur.cep = d.cep;
      if (!cur.endereco && d.endereco) cur.endereco = d.endereco;
      if (!cur.numero && d.numero) cur.numero = d.numero;
      if (!cur.bairro && d.bairro) cur.bairro = d.bairro;
      if (!cur.cidade && d.cidade) cur.cidade = d.cidade;
      if (cur.lat == null && d.lat != null) cur.lat = d.lat;
      if (cur.lng == null && d.lng != null) cur.lng = d.lng;
    } else {
      map.set(key, {
        key,
        cliente: d.cliente,
        telefone: d.telefone ?? "",
        cep: d.cep ?? "",
        endereco: d.endereco ?? "",
        numero: d.numero ?? "",
        bairro: d.bairro ?? "",
        cidade: d.cidade ?? "",
        complemento: d.complemento ?? "",
        lat: d.lat ?? null,
        lng: d.lng ?? null,
        entregas: 1,
        compras: d.status === "entregue" ? 1 : 0,
        totalValor: d.valor || 0,
        ultimaEntrega: d.dataHora,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.entregas !== a.entregas) return b.entregas - a.entregas;
    const bt = b.ultimaEntrega ? new Date(b.ultimaEntrega).getTime() : 0;
    const at = a.ultimaEntrega ? new Date(a.ultimaEntrega).getTime() : 0;
    if (bt !== at) return bt - at;
    return a.cliente.localeCompare(b.cliente, "pt-BR");
  });
}

export function useClientes(items: Delivery[]): Cliente[] {
  const [stored, setStored] = useState<StoredCliente[]>(() => memoryStore);

  useEffect(() => {
    startRealtime();
    const cb = () => setStored(memoryStore);
    subscribers.add(cb);
    cb();
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  // Semeia o cadastro no Supabase com clientes que só existem nas entregas —
  // roda uma vez por chave desconhecida.
  useEffect(() => {
    if (items.length === 0) return;
    const known = new Set(memoryStore.map((x) => x.key));
    for (const d of items) {
      const key = clienteKey(d.cliente, d.telefone);
      if (!key || known.has(key)) continue;
      known.add(key);
      upsertClienteFromDelivery(d);
    }
  }, [items]);

  return useMemo(() => aggregateClientes(items, stored), [items, stored]);
}

export function searchClientes(list: Cliente[], q: string, limit = 6): Cliente[] {
  const query = q.trim();
  if (!query) return [];
  const qName = normName(query);
  const qPhone = normPhone(query);
  return list
    .filter((c) => {
      if (qPhone.length >= 3 && normPhone(c.telefone).includes(qPhone)) return true;
      if (qName && normName(c.cliente).includes(qName)) return true;
      return false;
    })
    .slice(0, limit);
}
