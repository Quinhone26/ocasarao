import type { Delivery } from "@/lib/deliveries";
import { formatBRL, buildMapsUrl } from "@/lib/deliveries";
import type { CompanySettings } from "@/lib/company-settings";

/**
 * Substitui placeholders no template do WhatsApp.
 * Placeholders suportados: {cliente} {telefone} {empresa} {saudacao}
 * {endereco} {numero} {bairro} {cidade} {cep} {complemento}
 * {valor} {pagamento} {observacoes} {maps}
 */
export function renderWhatsappMessage(d: Delivery, company: CompanySettings): string {
  const enderecoCompleto = [
    `${d.endereco}${d.numero ? ", " + d.numero : ""}`,
    d.complemento,
    d.bairro,
    d.cidade,
  ]
    .filter(Boolean)
    .join(" · ");

  const vars: Record<string, string> = {
    cliente: d.cliente || "",
    telefone: d.telefone || "",
    empresa: company.nome || "",
    saudacao: company.saudacao || "",
    endereco: enderecoCompleto || d.endereco || "",
    numero: d.numero || "",
    bairro: d.bairro || "",
    cidade: d.cidade || "",
    cep: d.cep || "",
    complemento: d.complemento || "",
    valor: formatBRL(d.valor || 0),
    pagamento: d.pago ? "PAGO" : "a receber",
    observacoes: d.observacoes || "",
    maps: buildMapsUrl(d),
  };

  return (company.whatsappTemplate || "").replace(
    /\{(\w+)\}/g,
    (_, key: string) => vars[key] ?? `{${key}}`,
  );
}

/** Monta a URL wa.me com o número do cliente e a mensagem já renderizada. */
export function buildWhatsappUrl(d: Delivery, company: CompanySettings): string {
  const digits = (d.telefone || "").replace(/\D/g, "");
  // Se não tiver DDI, assume Brasil (+55).
  const phone = digits.length > 0 && !digits.startsWith("55") && digits.length <= 11
    ? `55${digits}`
    : digits;
  const msg = renderWhatsappMessage(d, company);
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
