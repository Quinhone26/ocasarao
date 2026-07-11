import { useEffect, useState } from "react";

export type CompanySettings = {
  nome: string;
  saudacao: string;
};

const KEY = "rotaexpress:company-settings:v1";

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  nome: "RotaExpress",
  saudacao: "Obrigado pela preferência!",
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
    };
  } catch {
    return DEFAULT_COMPANY_SETTINGS;
  }
}

export function saveCompanySettings(s: CompanySettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("company-settings-changed"));
}

export function useCompanySettings(): [CompanySettings, (s: CompanySettings) => void] {
  const [s, setS] = useState<CompanySettings>(() => getCompanySettings());
  useEffect(() => {
    const handler = () => setS(getCompanySettings());
    window.addEventListener("company-settings-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("company-settings-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  const update = (next: CompanySettings) => {
    saveCompanySettings(next);
    setS(next);
  };
  return [s, update];
}
