import type { Delivery } from "./deliveries";
import { formatBRL } from "./deliveries";
import { getCompanySettings } from "./company-settings";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Abre uma janela com a comanda de entrega formatada para impressão
 * (largura de bobina 80mm — compatível com impressoras térmicas e A4).
 * Dispara o diálogo de impressão automaticamente.
 */
export function printComanda(d: Delivery | (Omit<Delivery, "id" | "criadoEm"> & { id?: string; criadoEm?: string })): void {
  const fullAddr = [
    `${d.endereco}${d.numero ? ", " + d.numero : ""}`,
    d.complemento,
    d.bairro,
    d.cidade,
  ]
    .filter((s) => s && String(s).trim())
    .join(" · ");

  const agendado = d.agendadoPara ? fmtDateTime(d.agendadoPara) : "";
  const criado = fmtDateTime(d.dataHora);
  const company = getCompanySettings();

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Comanda de Entrega — ${esc(d.cliente)}</title>
<style>
  @page { size: 50mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, system-ui, sans-serif; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wrap { width: 46mm; padding: 2mm 1mm; font-size: 11px; line-height: 1.35; font-weight: 700; }
  .center { text-align: center; }
  h1 { margin: 0; font-size: 14px; letter-spacing: 0.5px; font-weight: 900; }
  h2 { margin: 6px 0 2px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; font-weight: 900; }
  .muted { color: #000; font-size: 10px; font-weight: 700; }
  .row { display: flex; justify-content: space-between; gap: 4px; align-items: center; }
  .divider { border-top: 2px dashed #000; margin: 5px 0; }
  .box { border: 2px solid #000; padding: 3px 5px; margin-top: 4px; }
  .big { font-size: 12px; font-weight: 900; word-wrap: break-word; }
  .total { font-size: 11px; font-weight: 900; }
  .obs { white-space: pre-wrap; font-weight: 700; word-wrap: break-word; }
  .pago-yes { display: inline-block; border: 1px solid #000; padding: 1px 4px; font-weight: 900; font-size: 9px; letter-spacing: 0.3px; background: #000; color: #fff; }
  .pago-no { display: inline-block; border: 1px solid #000; padding: 1px 4px; font-weight: 900; font-size: 9px; letter-spacing: 0.3px; background: #fff; color: #000; }
  @media screen {
    body { background: #eee; padding: 20px; }
    .wrap { background: #fff; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="center">
      <h1>${esc(company.nome || "RotaExpress")}</h1>
      <div class="muted">Comanda de Entrega</div>
      <div class="muted">${esc(criado)}</div>
    </div>

    <div class="divider"></div>

    <h2>Cliente</h2>
    <div class="big">${esc(d.cliente || "—")}</div>
    ${d.telefone ? `<div>Tel: ${esc(d.telefone)}</div>` : ""}

    <div class="divider"></div>

    <h2>Endereço</h2>
    <div>${esc(fullAddr || "—")}</div>
    ${d.cep ? `<div class="muted">CEP ${esc(d.cep)}</div>` : ""}

    ${agendado ? `<div class="box"><div class="muted">Programada para</div><div class="big">${esc(agendado)}</div></div>` : ""}

    ${d.observacoes ? `<div class="divider"></div><h2>Observações</h2><div class="obs">${esc(d.observacoes)}</div>` : ""}

    <div class="divider"></div>

    <div class="row">
      <span>Valor</span>
      <span class="total">${esc(formatBRL(Number(d.valor) || 0))}</span>
    </div>

    <div class="row" style="margin-top:6px;">
      <span>Pagamento</span>
      <span class="${d.pago ? "pago-yes" : "pago-no"}">${d.pago ? "PAGO" : "NÃO PAGO"}</span>
    </div>

    ${company.saudacao ? `<div class="divider"></div><div class="center big">${esc(company.saudacao)}</div>` : ""}
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 150);
    });
    window.addEventListener('afterprint', function () { window.close(); });
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) {
    // Popup bloqueado — fallback: abre via Blob URL (mesma aba se preciso).
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const fallback = window.open(url, "_blank");
    if (!fallback) window.location.href = url;
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
