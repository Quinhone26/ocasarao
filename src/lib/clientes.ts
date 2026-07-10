import { useEffect, useMemo, useState } from "react";
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

// ---------- Persistência local do cadastro de clientes ----------
// Clientes são um "banco" próprio: sobrevivem à exclusão de entregas.
// As contagens (entregas/compras/totalValor/ultimaEntrega) continuam
// derivadas em tempo real das entregas atuais.

const STORE_KEY = "motoboy_clientes_store_v1";

type StoredCliente = Omit<
  Cliente,
  "entregas" | "compras" | "totalValor" | "ultimaEntrega"
>;

function readStore(): StoredCliente[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredCliente[];
  } catch {
    return [];
  }
}

function writeStore(list: StoredCliente[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* quota indisponível */
  }
  for (const cb of subscribers) cb();
}

const subscribers = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function toStored(c: Cliente | StoredCliente): StoredCliente {
  return {
    key: c.key,
    cliente: c.cliente,
    telefone: c.telefone ?? "",
    cep: c.cep ?? "",
    endereco: c.endereco ?? "",
    numero: c.numero ?? "",
    bairro: c.bairro ?? "",
    cidade: c.cidade ?? "",
    complemento: c.complemento ?? "",
    lat: c.lat ?? null,
    lng: c.lng ?? null,
  };
}

// Insere/atualiza cliente com base em uma entrega recém-criada/editada.
// Preserva campos já cadastrados quando a entrega não os traz.
export function upsertClienteFromDelivery(d: {
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
  const list = readStore();
  const idx = list.findIndex((x) => x.key === key);
  if (idx === -1) {
    list.push(
      toStored({
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
      }),
    );
  } else {
    const cur = list[idx];
    list[idx] = {
      ...cur,
      cliente: d.cliente || cur.cliente,
      telefone: d.telefone || cur.telefone,
      cep: d.cep || cur.cep,
      endereco: d.endereco || cur.endereco,
      numero: d.numero || cur.numero,
      bairro: d.bairro || cur.bairro,
      cidade: d.cidade || cur.cidade,
      complemento: d.complemento || cur.complemento,
      lat: d.lat ?? cur.lat,
      lng: d.lng ?? cur.lng,
    };
  }
  writeStore(list);
}

// Atualiza um cliente já cadastrado. Se a chave mudar (telefone/nome), reindexa.
export function updateStoredCliente(prevKey: string, updated: Cliente) {
  const list = readStore();
  const idx = list.findIndex((x) => x.key === prevKey);
  const nextKey = clienteKey(updated.cliente, updated.telefone) || prevKey;
  const next = toStored({ ...updated, key: nextKey });
  if (idx === -1) list.push(next);
  else list[idx] = next;
  writeStore(list);
}

export function removeStoredCliente(key: string) {
  const list = readStore().filter((x) => x.key !== key);
  writeStore(list);
}

// ---------- Agregação (store + entregas) ----------

export function aggregateClientes(
  items: Delivery[],
  stored: StoredCliente[] = readStore(),
): Cliente[] {
  const map = new Map<string, Cliente>();

  // 1) Semeia a partir do cadastro persistido — garante que clientes sem
  //    entregas ativas continuem aparecendo.
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

  // 2) Percorre entregas (mais recentes primeiro) atualizando contagens.
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
      // Preenche campos ausentes no cadastro com dados da entrega.
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
  const [stored, setStored] = useState<StoredCliente[]>(() => readStore());
  useEffect(() => subscribe(() => setStored(readStore())), []);

  // Semeia o cadastro com clientes já existentes nas entregas na primeira carga
  // — evita perder clientes de bases antigas quando ainda não há store.
  useEffect(() => {
    if (items.length === 0) return;
    const list = readStore();
    const known = new Set(list.map((x) => x.key));
    let changed = false;
    for (const d of items) {
      const key = clienteKey(d.cliente, d.telefone);
      if (!key || known.has(key)) continue;
      known.add(key);
      list.push(
        toStored({
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
        }),
      );
      changed = true;
    }
    if (changed) writeStore(list);
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
