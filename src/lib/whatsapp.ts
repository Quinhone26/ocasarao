import type { Delivery } from "@/lib/deliveries";
import { formatBRL, buildMapsUrl } from "@/lib/deliveries";
import type { CompanySettings } from "@/lib/company-settings";
import { normalizeBrPhone } from "@/lib/masks";
import { buildTrackUrl } from "@/lib/tracking";

/**
 * Substitui placeholders no template do WhatsApp.
 * Placeholders suportados: {cliente} {telefone} {empresa} {saudacao}
 * {endereco} {numero} {bairro} {cidade} {cep} {complemento}
 * {valor} {pagamento} {observacoes} {maps} {rastreio}
 *
 * {rastreio} — link curto para a página de rastreio ao vivo do entregador.
 * {maps}     — mesmo link curto quando a entrega tem track_code; caso
 *              contrário, cai no link do Google Maps para o endereço.
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

  const rastreio = buildTrackUrl(d.trackCode);

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
    rastreio: rastreio ?? buildMapsUrl(d),
    // {maps} agora prioriza o link curto de rastreio (mais curto e com GPS
    // ao vivo do entregador). Fallback: link do Google Maps do endereço.
    maps: rastreio ?? buildMapsUrl(d),
  };

  return (company.whatsappTemplate || "").replace(
    /\{(\w+)\}/g,
    (_, key: string) => vars[key] ?? `{${key}}`,
  );
}

/**
 * Monta a URL wa.me com o número do cliente e a mensagem já renderizada.
 * Retorna null quando o telefone é inválido/incompleto.
 */
export function buildWhatsappUrl(d: Delivery, company: CompanySettings): string | null {
  const phone = normalizeBrPhone(d.telefone);
  if (!phone) return null;
  const msg = renderWhatsappMessage(d, company);
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
