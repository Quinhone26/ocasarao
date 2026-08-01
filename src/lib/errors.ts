import { ZodError } from "zod";

const FIELD_LABELS: Record<string, string> = {
  cliente: "Cliente",
  telefone: "Telefone",
  cep: "CEP",
  endereco: "Endereço",
  numero: "Número",
  bairro: "Bairro",
  cidade: "Cidade",
  complemento: "Complemento",
  observacoes: "Observações",
  valor: "Valor",
  dataHora: "Data/hora",
  agendadoPara: "Agendamento",
  lat: "Latitude",
  lng: "Longitude",
  status: "Status",
  pago: "Pagamento",
};

/**
 * Converte qualquer erro (Zod, Supabase/PostgREST, Error, string) em uma
 * mensagem curta e legível para exibir em toast. Evita despejar JSON do Zod
 * ou códigos crus do banco na tela.
 */
export function describeError(err: unknown): string {
  if (err instanceof ZodError) {
    const parts = err.issues.slice(0, 3).map((i) => {
      const key = String(i.path[0] ?? "");
      const label = FIELD_LABELS[key] ?? key;
      return label ? `${label}: ${i.message}` : i.message;
    });
    const extra = err.issues.length > 3 ? ` (+${err.issues.length - 3})` : "";
    return parts.join(" · ") + extra;
  }

  if (typeof err === "string") return err;

  if (err && typeof err === "object") {
    const e = err as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const message = typeof e.message === "string" ? e.message : "";
    const hint = typeof e.hint === "string" ? e.hint : "";
    const code = typeof e.code === "string" ? e.code : "";

    if (code === "42501" || /row-level security/i.test(message)) {
      return "Sem permissão para gravar no banco (política de segurança).";
    }
    if (code === "PGRST204" || /column .* does not exist/i.test(message)) {
      return "Estrutura do banco desatualizada — falta rodar a migração.";
    }
    if (/failed to fetch|networkerror|offline/i.test(message)) {
      return "Sem conexão com o servidor. Verifique a internet.";
    }
    if (message) return hint ? `${message} — ${hint}` : message;
  }

  return "Erro inesperado. Tente novamente.";
}
