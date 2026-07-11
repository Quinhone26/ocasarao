import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CompanySettings = {
  nome: string;
  saudacao: string;
};

const KEY = "rotaexpress:company-settings:v1";
const ROW_ID = "default";

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  nome: "RotaExpress",
  saudacao: "Obrigado pela preferência!",
};

/**
 * Leitura síncrona (usada por `printComanda`) — retorna o cache local mais recente.
 * A fonte da verdade é o banco (tabela public.company_settings); o cache é
 * atualizado sempre que o hook `useCompanySettings` busca ou grava.
 */
export function getCompanySettings(): CompanySettings {
  if (typeof window === "undefined") return DEFAULT_COMPANY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_COMPANY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CompanySettings>;
    return {
      nome: (parsed.nome ?? DEFAULT_COMPANY_SETTINGS.nome).toString(),
      saudacao: (parsed.saudacao ?? DEFAULT_COMPANY_SETTINGS.saudacao).toString(),
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
    .select("nome, saudacao")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) {
    console.warn("[company-settings] fetch:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    nome: (data.nome ?? DEFAULT_COMPANY_SETTINGS.nome).toString(),
    saudacao: (data.saudacao ?? DEFAULT_COMPANY_SETTINGS.saudacao).toString(),
  };
}

async function saveToDb(s: CompanySettings): Promise<void> {
  const { error } = await supabase
    .from("company_settings")
    .upsert(
      { id: ROW_ID, nome: s.nome, saudacao: s.saudacao, atualizado_em: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}

export function useCompanySettings(): [CompanySettings, (s: CompanySettings) => Promise<void>] {
  const [s, setS] = useState<CompanySettings>(() => getCompanySettings());

  // Sincroniza a partir do banco ao montar e escuta mudanças locais/entre abas.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await fetchFromDb();
      if (cancelled || !remote) return;
      writeCache(remote);
      setS(remote);
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
    // Otimista: aplica local, depois persiste. Se falhar, o erro sobe para o caller.
    writeCache(next);
    setS(next);
    await saveToDb(next);
  };

  return [s, update];
}
