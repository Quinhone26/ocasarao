// ViaCEP lookup — free public API, no key required.
// Docs: https://viacep.com.br

export interface CepResult {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

const cache = new Map<string, CepResult | null>();

export function normalizeCep(v: string): string {
  return v.replace(/\D/g, "").slice(0, 8);
}

export function formatCep(v: string): string {
  const d = normalizeCep(v);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepResult | null> {
  const clean = normalizeCep(cep);
  if (clean.length !== 8) return null;
  if (cache.has(clean)) return cache.get(clean)!;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.erro) {
      cache.set(clean, null);
      return null;
    }
    const result: CepResult = {
      cep: data.cep ?? clean,
      logradouro: data.logradouro ?? "",
      bairro: data.bairro ?? "",
      localidade: data.localidade ?? "",
      uf: data.uf ?? "",
    };
    cache.set(clean, result);
    return result;
  } catch {
    return null;
  }
}
