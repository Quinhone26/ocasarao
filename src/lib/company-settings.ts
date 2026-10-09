import { useEffect, useState } from "react";
import { appDatabase } from "@/lib/database-contract";
import { supabase } from '@/integrations/supabase/client';

export type CompanySettings = {
  nome: string;
  saudacao: string;
  whatsappTemplate: string;
  enderecoOrigem: string;
  latOrigem: number | null;
  lngOrigem: number | null;
};

const KEY = "rotaexpress:company-settings:v1";
const ROW_ID = "default";

export const DEFAULT_WHATSAPP_TEMPLATE =
  "Olá {cliente}! 🛵 Seu pedido de *{empresa}* saiu para entrega.\n\n📍 Endereço: {endereco}\n💰 Valor: {valor} ({pagamento})\n\nAcompanhe seu entregador ao vivo: {rastreio}\n\nQualquer coisa, é só chamar!";

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  nome: "O Casarão",
  saudacao: "Obrigado pela preferência!",
  whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
  enderecoOrigem: "",
  latOrigem: null,
  lngOrigem: null,
};

export function getCompanySettings(): CompanySettings {
  if (typeof window === "undefined") return DEFAULT_COMPANY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_COMPANY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CompanySettings>;
    return {
      nome: (parsed.nome ?? DEFAULT_COMPANY_SETTINGS.nome).toString(),
      saudacao: (parsed.saudacao ?? DEFAULT_COMPANY_SETTINGS.saudacao).toString(),
      whatsappTemplate: (parsed.whatsappTemplate ?? DEFAULT_WHATSAPP_TEMPLATE).toString(),
      enderecoOrigem: (parsed.enderecoOrigem ?? "").toString(),
      latOrigem:
        typeof parsed.latOrigem === "number" && isFinite(parsed.latOrigem)
          ? parsed.latOrigem
          : null,
      lngOrigem:
        typeof parsed.lngOrigem === "number" && isFinite(parsed.lngOrigem)
          ? parsed.lngOrigem
          : null,
    };
  } catch {
    return DEFAULT_COMPANY_SETTINGS;
  }
}

function writeCache(s: CompanySettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("company-settings-changed"));
}

async function fetchFromDb(): Promise<CompanySettings | null> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) {
    console.warn("[company-settings] fetch:", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const toNum = (v: unknown): number | null =>
    typeof v === "number" && isFinite(v)
      ? v
      : typeof v === "string" && v.trim() && isFinite(Number(v))
        ? Number(v)
        : null;
  return {
    nome: (row.nome as string | undefined) ?? DEFAULT_COMPANY_SETTINGS.nome,
    saudacao: (row.saudacao as string | undefined) ?? DEFAULT_COMPANY_SETTINGS.saudacao,
    whatsappTemplate:
      (row.whatsapp_template as string | undefined) ?? DEFAULT_WHATSAPP_TEMPLATE,
    enderecoOrigem: (row.endereco_origem as string | undefined) ?? "",
    latOrigem: toNum(row.lat_origem),
    lngOrigem: toNum(row.lng_origem),
  };
}

async function saveToDb(s: CompanySettings): Promise<void> {
  const now = new Date().toISOString();
  const full = {
    id: ROW_ID,
    nome: s.nome,
    saudacao: s.saudacao,
    whatsapp_template: s.whatsappTemplate,
    endereco_origem: s.enderecoOrigem || null,
    lat_origem: s.latOrigem,
    lng_origem: s.lngOrigem,
    atualizado_em: now,
  };
  const { error } = await appDatabase()
    .from("company_settings")
    .upsert(full, { onConflict: "id" });
  if (!error) return;
  // Colunas novas ainda não migradas — cai para o formato antigo, mantém local.
  const msg = error.message || "";
  const isMissingCol =
    /whatsapp_template|endereco_origem|lat_origem|lng_origem/i.test(msg) ||
    error.code === "PGRST204";
  if (isMissingCol) {
    const { error: e2 } = await appDatabase()
      .from("company_settings")
      .upsert(
        { id: ROW_ID, nome: s.nome, saudacao: s.saudacao, atualizado_em: now },
        { onConflict: "id" },
      );
    if (e2) throw new Error(e2.message);
    console.warn(
      "[company-settings] colunas novas ausentes no banco — endereço da empresa salvo apenas localmente. Rode a migração pendente.",
    );
    return;
  }
  throw new Error(msg);
}

export function useCompanySettings(): [CompanySettings, (s: CompanySettings) => Promise<void>] {
  const [s, setS] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    setS(getCompanySettings());
    (async () => {
      const remote = await fetchFromDb();
      if (cancelled || !remote) return;
      const local = getCompanySettings();
      // Preserva valores locais quando o banco ainda não persistiu a coluna.
      const merged: CompanySettings = {
        ...remote,
        whatsappTemplate: remote.whatsappTemplate || local.whatsappTemplate,
        enderecoOrigem: remote.enderecoOrigem || local.enderecoOrigem,
        latOrigem: remote.latOrigem ?? local.latOrigem,
        lngOrigem: remote.lngOrigem ?? local.lngOrigem,
      };
      writeCache(merged);
      setS(merged);
    })();
    const handler = () => setS(getCompanySettings());
    window.addEventListener("company-settings-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("company-settings-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = async (next: CompanySettings) => {
    writeCache(next);
    setS(next);
    await saveToDb(next);
  };

  return [s, update];
}
