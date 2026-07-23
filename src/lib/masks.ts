// Máscaras de entrada em pt-BR.

export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Normaliza um telefone BR para o formato E.164 sem o "+": 55DDNNNNNNNNN.
 * Aceita variações com/sem DDI, com/sem 9º dígito, com máscara, espaços, "+", etc.
 * Retorna null se o número não puder ser interpretado como um telefone BR válido.
 */
export function normalizeBrPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  // Remove zeros à esquerda (ex.: "0 11 ...").
  d = d.replace(/^0+/, "");
  // Se veio com DDI 55, remove para validar o local.
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) {
    d = d.slice(2);
  }
  // A esta altura, esperamos 10 (fixo) ou 11 (móvel com 9º dígito) dígitos locais.
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = parseInt(d.slice(0, 2), 10);
  if (!(ddd >= 11 && ddd <= 99)) return null;
  // Móvel deve começar com 9 após o DDD; fixo não deve começar com 0/1.
  if (d.length === 11 && d[2] !== "9") return null;
  if (d.length === 10 && (d[2] === "0" || d[2] === "1")) return null;
  return `55${d}`;
}

export function isValidBrPhone(raw: string | null | undefined): boolean {
  return normalizeBrPhone(raw) !== null;
}

// Valor em BRL a partir de string livre digitada pelo usuário.
// Trata os dígitos como centavos: "1234" → "R$ 12,34".
export function formatCurrencyFromDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11); // até ~9 dígitos (bilhão)
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  const value = cents / 100;
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseCurrencyToNumber(masked: string): number {
  const digits = masked.replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

export function currencyMaskFromNumber(value: number): string {
  if (!value || Number.isNaN(value)) return "";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
