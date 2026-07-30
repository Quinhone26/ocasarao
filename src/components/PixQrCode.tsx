import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { buildPixPayload, formatPixKey, PIX_KEY, PIX_WHATSAPP } from "@/lib/pix";
import { formatBRL } from "@/lib/deliveries";

type Props = {
  amount: number;
  merchantName?: string;
  customerName?: string;
  trackCode?: string | null;
};

export function PixQrCode({ amount, merchantName, customerName, trackCode }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const payload = buildPixPayload({ amount, merchantName });

  const waMessage = [
    `Olá! Acabei de pagar meu pedido${customerName ? ` (${customerName})` : ""} via Pix.`,
    `Valor: ${formatBRL(amount)}`,
    trackCode ? `Pedido: ${trackCode}` : "",
    "Segue o comprovante em anexo 📎",
  ]
    .filter(Boolean)
    .join("\n");
  const waUrl = `https://wa.me/${PIX_WHATSAPP}?text=${encodeURIComponent(waMessage)}`;


  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(payload, { width: 512, margin: 1 })
      .then((url) => alive && setDataUrl(url))
      .catch(() => alive && setDataUrl(null));
    return () => {
      alive = false;
    };
  }, [payload]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      toast.success("Código Pix copiado!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não consegui copiar. Selecione o código manualmente.");
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 text-center">
      <p className="font-semibold">Pague com Pix</p>
      <p className="text-xs text-muted-foreground">
        Escaneie o QR Code ou use o Pix copia e cola
      </p>

      <div className="mt-3 grid place-items-center">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="QR Code Pix do pedido"
            className="w-52 h-52 rounded-lg bg-white p-2"
          />
        ) : (
          <div className="w-52 h-52 grid place-items-center rounded-lg border border-dashed text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
      </div>

      <p className="mt-3 text-lg font-bold text-primary">{formatBRL(amount)}</p>
      <p className="text-xs text-muted-foreground">
        Chave Pix: {formatPixKey(PIX_KEY)}
      </p>

      <div className="mt-3 break-all rounded-lg bg-muted px-3 py-2 text-[10px] leading-snug text-muted-foreground">
        {payload}
      </div>

      <Button type="button" variant="outline" className="mt-3 w-full gap-2" onClick={copiar}>
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? "Copiado!" : "Copiar código Pix"}
      </Button>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Após o pagamento, envie o pedido e nos mande o comprovante pelo WhatsApp.
      </p>
    </div>
  );
}
