import type { Delivery } from "./deliveries";
import { formatBRL } from "./deliveries";

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

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Comanda de Entrega — ${esc(d.cliente)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, system-ui, sans-serif; color: #000; background: #fff; }
  .wrap { width: 72mm; padding: 4mm 2mm; font-size: 12px; line-height: 1.35; }
  .center { text-align: center; }
  h1 { margin: 0; font-size: 15px; letter-spacing: 1px; }
  h2 { margin: 6px 0 2px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .muted { color: #444; font-size: 11px; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .box { border: 1px solid #000; padding: 4px 6px; margin-top: 4px; }
  .big { font-size: 14px; font-weight: 700; }
  .total { font-size: 16px; font-weight: 800; }
  .obs { white-space: pre-wrap; }
  @media screen {
    body { background: #eee; padding: 20px; }
    .wrap { background: #fff; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="center">
      <h1>RotaExpress</h1>
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

    <div class="divider"></div>

    <div class="center muted">Assinatura do cliente</div>
    <div style="height: 30px; border-bottom: 1px solid #000; margin: 4px 4px 0;"></div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 150);
    });
    window.addEventListener('afterprint', function () { window.close(); });
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "noopener,width=420,height=720");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
