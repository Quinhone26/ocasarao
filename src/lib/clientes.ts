import { useMemo } from "react";
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

export function aggregateClientes(items: Delivery[]): Cliente[] {
  const sorted = [...items].sort(
    (a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime(),
  );
  const map = new Map<string, Cliente>();
  for (const d of sorted) {
    const key = clienteKey(d.cliente, d.telefone);
    if (!key) continue;
    const cur = map.get(key);
    if (cur) {
      cur.entregas++;
      if (d.status === "entregue") cur.compras++;
      cur.totalValor += d.valor || 0;
      // Preenche campos que a entrega mais antiga tinha e a nova não trouxe.
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
    return new Date(b.ultimaEntrega).getTime() - new Date(a.ultimaEntrega).getTime();
  });
}

export function useClientes(items: Delivery[]): Cliente[] {
  return useMemo(() => aggregateClientes(items), [items]);
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
