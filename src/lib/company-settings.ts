import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CompanySettings = {
  nome: string;
  saudacao: string;
  whatsappTemplate: string;
};

const KEY = "rotaexpress:company-settings:v1";
const ROW_ID = "default";

export const DEFAULT_WHATSAPP_TEMPLATE =
  "Olá {cliente}! 🛵 Seu pedido de *{empresa}* saiu para entrega.\n\n📍 Endereço: {endereco}\n💰 Valor: {valor} ({pagamento})\n\nAcompanhe seu entregador ao vivo: {rastreio}\n\nQualquer coisa, é só chamar!";

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  nome: "RotaExpress",
  saudacao: "Obrigado pela preferência!",
  whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
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
  return {
    nome: (row.nome as string | undefined) ?? DEFAULT_COMPANY_SETTINGS.nome,
    saudacao: (row.saudacao as string | undefined) ?? DEFAULT_COMPANY_SETTINGS.saudacao,
    whatsappTemplate:
      (row.whatsapp_template as string | undefined) ?? DEFAULT_WHATSAPP_TEMPLATE,
  };
}

async function saveToDb(s: CompanySettings): Promise<void> {
  const now = new Date().toISOString();
  const full = {
    id: ROW_ID,
    nome: s.nome,
    saudacao: s.saudacao,
    whatsapp_template: s.whatsappTemplate,
    atualizado_em: now,
  };
  const { error } = await supabase
    .from("company_settings")
    .upsert(full, { onConflict: "id" });
  if (!error) return;
  // Coluna whatsapp_template ainda não migrada — cai para o formato antigo.
  if (/whatsapp_template/i.test(error.message) || error.code === "PGRST204") {
    const { error: e2 } = await supabase
      .from("company_settings")
      .upsert(
        { id: ROW_ID, nome: s.nome, saudacao: s.saudacao, atualizado_em: now },
        { onConflict: "id" },
      );
    if (e2) throw new Error(e2.message);
    console.warn(
      "[company-settings] coluna whatsapp_template ausente no banco — mensagem do WhatsApp salva apenas localmente.",
    );
    return;
  }
  throw new Error(error.message);
}

export function useCompanySettings(): [CompanySettings, (s: CompanySettings) => Promise<void>] {
  const [s, setS] = useState<CompanySettings>(() => getCompanySettings());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await fetchFromDb();
      if (cancelled || !remote) return;
      // Preserva o template local se o banco ainda não tiver a coluna.
      const merged: CompanySettings = {
        ...remote,
        whatsappTemplate: remote.whatsappTemplate || getCompanySettings().whatsappTemplate,
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
