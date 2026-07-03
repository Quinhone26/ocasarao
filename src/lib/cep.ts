// ViaCEP lookup — free public API, no key required.
// Docs: https://viacep.com.br
// Cache: in-memory Map hydrated from localStorage so previously-looked-up CEPs
// keep working offline after the first successful query.

export interface CepResult {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

const STORAGE_KEY = "cep_cache_v1";
const cache = new Map<string, CepResult>();
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, CepResult>;
    for (const [k, v] of Object.entries(obj)) cache.set(k, v);
  } catch {
    /* ignore corrupt cache */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, CepResult> = {};
    for (const [k, v] of cache) obj[k] = v;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function normalizeCep(v: string): string {
  return v.replace(/\D/g, "").slice(0, 8);
}

export function formatCep(v: string): string {
  const d = normalizeCep(v);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function getCachedCep(cep: string): CepResult | undefined {
  hydrate();
  return cache.get(normalizeCep(cep));
}

export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepResult | null> {
  const clean = normalizeCep(cep);
  if (clean.length !== 8) return null;
  hydrate();
  const cached = cache.get(clean);
  if (cached) return cached;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.erro) return null;
    const result: CepResult = {
      cep: data.cep ?? clean,
      logradouro: data.logradouro ?? "",
      bairro: data.bairro ?? "",
      localidade: data.localidade ?? "",
      uf: data.uf ?? "",
    };
    cache.set(clean, result);
    persist();
    return result;
  } catch {
    return null;
  }
}
