export const PIX_KEY = "44997609919";

function tag(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(text: string, max: number): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, max)
    .toUpperCase();
}

export type PixPayloadInput = {
  key?: string;
  amount: number;
  merchantName?: string;
  merchantCity?: string;
  txid?: string;
};

/** Gera o payload EMV (BR Code) do Pix copia e cola. */
export function buildPixPayload({
  key = PIX_KEY,
  amount,
  merchantName = "O CASARAO",
  merchantCity = "UMUARAMA",
  txid = "***",
}: PixPayloadInput): string {
  const merchantAccount =
    tag("00", "br.gov.bcb.pix") + tag("01", key.replace(/\s/g, ""));

  let payload =
    tag("00", "01") +
    tag("26", merchantAccount) +
    tag("52", "0000") +
    tag("53", "986") +
    (amount > 0 ? tag("54", amount.toFixed(2)) : "") +
    tag("58", "BR") +
    tag("59", sanitize(merchantName, 25) || "RECEBEDOR") +
    tag("60", sanitize(merchantCity, 15) || "UMUARAMA") +
    tag("62", tag("05", sanitize(txid, 25) || "***"));

  payload += "6304";
  return payload + crc16(payload);
}

/** Formata a chave (CPF/CNPJ/telefone) para exibição. */
export function formatPixKey(key: string = PIX_KEY): string {
  const d = key.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return key;
}
