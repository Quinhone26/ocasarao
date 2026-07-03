import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Delivery, DeliveryStatus } from "@/lib/deliveries";
import { statusLabel } from "@/lib/deliveries";
import { formatCep, lookupCep, normalizeCep } from "@/lib/cep";

export interface DeliveryFormValues {
  cliente: string;
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  complemento: string;
  observacoes: string;
  valor: number;
  dataHora: string;
  status: DeliveryStatus;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const empty: DeliveryFormValues = {
  cliente: "",
  telefone: "",
  cep: "",
  endereco: "",
  numero: "",
  bairro: "",
  cidade: "",
  complemento: "",
  observacoes: "",
  valor: 0,
  dataHora: "",
  status: "pendente",
};

export function DeliveryForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Delivery;
  onSubmit: (v: DeliveryFormValues) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<DeliveryFormValues>(empty);
  const [cepLoading, setCepLoading] = useState(false);
  const cepAbort = useRef<AbortController | null>(null);
  const lastLookup = useRef<string>("");

  useEffect(() => {
    if (initial) {
      setV({
        cliente: initial.cliente,
        telefone: initial.telefone,
        cep: initial.cep ?? "",
        endereco: initial.endereco,
        numero: initial.numero,
        bairro: initial.bairro,
        cidade: initial.cidade,
        complemento: initial.complemento,
        observacoes: initial.observacoes,
        valor: initial.valor,
        dataHora: toLocalInput(initial.dataHora),
        status: initial.status,
      });
    } else {
      setV({ ...empty, dataHora: toLocalInput(new Date().toISOString()) });
    }
  }, [initial]);

  const set = <K extends keyof DeliveryFormValues>(k: K, val: DeliveryFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const handleCepChange = (raw: string) => {
    const digits = normalizeCep(raw);
    setV((p) => ({ ...p, cep: formatCep(digits) }));
    if (digits.length === 8 && digits !== lastLookup.current) {
      lastLookup.current = digits;
      cepAbort.current?.abort();
      const ctrl = new AbortController();
      cepAbort.current = ctrl;
      setCepLoading(true);
      lookupCep(digits, ctrl.signal)
        .then((r) => {
          if (ctrl.signal.aborted) return;
          if (!r) {
            toast.error("CEP não encontrado");
            return;
          }
          // Sempre sobrescreve endereço/bairro/cidade com os valores oficiais
          // do CEP, removendo inconsistências caso o usuário tenha digitado
          // algo antes. Campos vazios da API não apagam o que já existe.
          setV((p) => ({
            ...p,
            endereco: r.logradouro?.trim() ? r.logradouro : p.endereco,
            bairro: r.bairro?.trim() ? r.bairro : p.bairro,
            cidade: r.localidade?.trim()
              ? `${r.localidade}${r.uf ? "/" + r.uf : ""}`
              : p.cidade,
          }));
          toast.success("Endereço preenchido pelo CEP");
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setCepLoading(false);
        });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.cliente.trim() || !v.endereco.trim()) return;
    onSubmit({
      ...v,
      valor: Number(v.valor) || 0,
      dataHora: new Date(v.dataHora).toISOString(),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cliente">Cliente *</Label>
        <Input id="cliente" value={v.cliente} onChange={(e) => set("cliente", e.target.value)} required maxLength={100} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" value={v.telefone} onChange={(e) => set("telefone", e.target.value)} inputMode="tel" maxLength={20} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="valor">Valor (R$)</Label>
          <Input id="valor" type="number" step="0.01" min="0" value={v.valor} onChange={(e) => set("valor", Number(e.target.value))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cep">CEP</Label>
        <div className="relative">
          <Input
            id="cep"
            value={v.cep}
            onChange={(e) => handleCepChange(e.target.value)}
            inputMode="numeric"
            placeholder="00000-000"
            maxLength={9}
          />
          {cepLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="endereco">Endereço *</Label>
        <Input id="endereco" value={v.endereco} onChange={(e) => set("endereco", e.target.value)} required maxLength={200} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="numero">Número</Label>
          <Input id="numero" value={v.numero} onChange={(e) => set("numero", e.target.value)} maxLength={20} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bairro">Bairro</Label>
          <Input id="bairro" value={v.bairro} onChange={(e) => set("bairro", e.target.value)} maxLength={100} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cidade">Cidade</Label>
          <Input id="cidade" value={v.cidade} onChange={(e) => set("cidade", e.target.value)} maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="complemento">Complemento</Label>
          <Input id="complemento" value={v.complemento} onChange={(e) => set("complemento", e.target.value)} maxLength={100} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dataHora">Data e hora</Label>
          <Input id="dataHora" type="datetime-local" value={v.dataHora} onChange={(e) => set("dataHora", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select value={v.status} onValueChange={(x) => set("status", x as DeliveryStatus)}>
            <SelectTrigger id="status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(statusLabel) as DeliveryStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea id="observacoes" value={v.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} maxLength={500} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" className="flex-1 h-12">Salvar</Button>
      </div>
    </form>
  );
}
