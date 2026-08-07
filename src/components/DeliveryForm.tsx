import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Delivery, DeliveryStatus } from "@/lib/deliveries";
import { statusLabel } from "@/lib/deliveries";
import type { CepResult } from "@/lib/cep";
import { ALLOWED_CITY, ALLOWED_UF, formatCep, isAllowedCity, isValidCep, lookupCep, normalizeCep } from "@/lib/cep";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
import { currencyMaskFromNumber, formatCurrencyFromDigits, formatPhone, parseCurrencyToNumber } from "@/lib/masks";
import { searchClientes, type Cliente } from "@/lib/clientes";

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
  agendadoPara: string | null; // ISO ou null quando não programada
  lat: number | null;
  lng: number | null;
  status: DeliveryStatus;
  pago: boolean;
}

export const FORMAS_PAGAMENTO = ["Dinheiro", "Cartão", "Pix"] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const TIPOS_ENTREGA = ["Entrega", "Retirada"] as const;
export type TipoEntrega = (typeof TIPOS_ENTREGA)[number];

/** Separa a linha "Pagamento: X" e "Tipo: X" das observações. */
function splitObservacoes(obs: string): { forma: FormaPagamento | ""; tipo: TipoEntrega | ""; resto: string } {
  const lines = (obs || "").split("\n");
  let forma: FormaPagamento | "" = "";
  let tipo: TipoEntrega | "" = "";
  const resto: string[] = [];
  for (const line of lines) {
    const mPag = /^\s*pagamento:\s*(.+)$/i.exec(line);
    const mTipo = /^\s*tipo:\s*(.+)$/i.exec(line);
    
    const foundPag = mPag ? FORMAS_PAGAMENTO.find((f) => norm(mPag[1]).startsWith(norm(f))) : undefined;
    const foundTipo = mTipo ? TIPOS_ENTREGA.find((t) => norm(mTipo[1]).startsWith(norm(t))) : undefined;

    if (foundPag && !forma) forma = foundPag;
    else if (foundTipo && !tipo) tipo = foundTipo;
    else resto.push(line);
  }
  return { forma, tipo, resto: resto.join("\n").trim() };
}

function addressKey(v: Pick<DeliveryFormValues, "cep" | "endereco" | "numero" | "bairro" | "cidade">): string {
  return [normalizeCep(v.cep), norm(v.endereco), norm(v.numero), norm(v.bairro), norm(v.cidade)]
    .filter(Boolean)
    .join("|");
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
  agendadoPara: null,
  lat: null,
  lng: null,
  status: "pendente",
  pago: false,
};

export function DeliveryForm({
  initial,
  suggestions = [],
  onSubmit,
  onCancel,
}: {
  initial?: Delivery;
  suggestions?: Cliente[];
  onSubmit: (v: DeliveryFormValues) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<DeliveryFormValues>(empty);
  const [forma, setForma] = useState<FormaPagamento | "">("");
  const [tipo, setTipo] = useState<TipoEntrega>("Entrega");
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<null | {
    kind: "invalid" | "not_found" | "network" | "out_of_area";
    message: string;
  }>(null);
  const cepAbort = useRef<AbortController | null>(null);
  const lastLookup = useRef<string>("");
  const [cepData, setCepData] = useState<CepResult | null>(null);
  const addressKeyWithCoords = useRef("");

  useEffect(() => {
    if (initial) {
      const { forma: formaInicial, tipo: tipoInicial, resto } = splitObservacoes(initial.observacoes ?? "");
      const next = {
        cliente: initial.cliente,
        telefone: formatPhone(initial.telefone),
        cep: initial.cep ?? "",
        endereco: initial.endereco,
        numero: initial.numero,
        bairro: initial.bairro,
        cidade: initial.cidade,
        complemento: initial.complemento,
        observacoes: resto,
        valor: initial.valor,
        dataHora: toLocalInput(initial.dataHora),
        agendadoPara: initial.agendadoPara ? toLocalInput(initial.agendadoPara) : null,
        lat: initial.lat ?? null,
        lng: initial.lng ?? null,
        status: (["pendente", "em_rota", "entregue", "cancelada"] as DeliveryStatus[]).includes(initial.status)
          ? initial.status
          : "pendente",
        pago: !!initial.pago,
      };
      addressKeyWithCoords.current = addressKey(next);
      setForma(formaInicial);
      setTipo(tipoInicial || "Entrega");
      setV(next);
    } else {
      addressKeyWithCoords.current = "";
      setForma("");
      setTipo("Entrega");
      setV({ ...empty, dataHora: toLocalInput(new Date().toISOString()) });
    }
  }, [initial]);

  const set = <K extends keyof DeliveryFormValues>(k: K, val: DeliveryFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const setAddressFields = (
    patch: Partial<Pick<DeliveryFormValues, "cep" | "endereco" | "numero" | "bairro" | "cidade">>,
  ) => {
    setV((p) => {
      const next = { ...p, ...patch };
      const original = addressKeyWithCoords.current;
      const hasCoords = p.lat != null || p.lng != null;
      if (hasCoords && original && addressKey(next) !== original) {
        return { ...next, lat: null, lng: null };
      }
      return next;
    });
  };

  // Autocomplete de clientes já cadastrados (só em novo cadastro).
  const [suggestField, setSuggestField] = useState<null | "cliente" | "telefone">(null);
  const activeSuggestions = (() => {
    if (initial || !suggestField) return [] as Cliente[];
    const q = suggestField === "cliente" ? v.cliente : v.telefone;
    return searchClientes(suggestions, q);
  })();
  const pickCliente = (c: Cliente) => {
    const nextAddress = {
      cep: c.cep,
      endereco: c.endereco,
      numero: c.numero,
      bairro: c.bairro,
      cidade: c.cidade,
    };
    addressKeyWithCoords.current = addressKey(nextAddress);
    setV((p) => ({
      ...p,
      cliente: c.cliente,
      telefone: formatPhone(c.telefone),
      cep: nextAddress.cep || p.cep,
      endereco: nextAddress.endereco || p.endereco,
      numero: nextAddress.numero || p.numero,
      bairro: nextAddress.bairro || p.bairro,
      cidade: nextAddress.cidade || p.cidade,
      complemento: c.complemento || p.complemento,
      lat: c.lat ?? p.lat,
      lng: c.lng ?? p.lng,
    }));
    setSuggestField(null);
    toast.success(`Dados de ${c.cliente} preenchidos`);
  };

  const runCepLookup = (digits: string) => {
    cepAbort.current?.abort();
    const ctrl = new AbortController();
    cepAbort.current = ctrl;
    setCepLoading(true);
    setCepError(null);
    setCepData(null);
    lookupCep(digits, ctrl.signal)
      .then((r) => {
        if (ctrl.signal.aborted) return;
        if (r.status === "invalid") {
          setCepError({ kind: "invalid", message: "CEP inválido — digite os 8 dígitos." });
          return;
        }
        if (r.status === "not_found") {
          setCepError({ kind: "not_found", message: "CEP não encontrado na base dos Correios." });
          return;
        }
        if (r.status === "network_error") {
          setCepError({
            kind: "network",
            message: "Sem conexão para consultar o CEP. Verifique a internet e tente de novo.",
          });
          return;
        }
        const d = r.data;
        if (!isAllowedCity(d.localidade, d.uf)) {
          setCepError({
            kind: "out_of_area",
            message: `Fora da área de atendimento. Só entregamos em ${ALLOWED_CITY}-${ALLOWED_UF}.`,
          });
          toast.error(`CEP fora de ${ALLOWED_CITY}-${ALLOWED_UF}`);
          return;
        }
        // Auto-preenche apenas os campos ainda vazios — o que o usuário já
        // digitou manualmente é preservado (fallback editável).
        setV((p) => {
          const filled: Partial<DeliveryFormValues> = {};
          if (!p.endereco.trim() && d.logradouro?.trim()) filled.endereco = d.logradouro;
          if (!p.bairro.trim() && d.bairro?.trim()) filled.bairro = d.bairro;
          if (!p.cidade.trim() && d.localidade?.trim()) {
            filled.cidade = `${d.localidade}${d.uf ? "/" + d.uf : ""}`;
          }
          const next = { ...p, ...filled };
          const original = addressKeyWithCoords.current;
          const hasCoords = p.lat != null || p.lng != null;
          if (hasCoords && original && addressKey(next) !== original) {
            return { ...next, lat: null, lng: null };
          }
          return next;
        });
        setCepData(d);
        if (!r.fromCache) {
          const kept =
            v.endereco.trim() || v.bairro.trim() || v.cidade.trim()
              ? " (mantivemos o que você editou)"
              : "";
          toast.success(`Endereço preenchido pelo CEP${kept}`);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCepLoading(false);
      });
  };

  const handleCepChange = (raw: string) => {
    const digits = normalizeCep(raw);
    setAddressFields({ cep: formatCep(digits) });
    if (cepError) setCepError(null);
    if (digits.length === 8 && digits !== lastLookup.current) {
      lastLookup.current = digits;
      runCepLookup(digits);
    } else if (digits.length < 8) {
      lastLookup.current = "";
      setCepData(null);
    }
  };

  const retryCep = () => {
    const digits = normalizeCep(v.cep);
    if (digits.length !== 8) {
      setCepError({ kind: "invalid", message: "CEP inválido — digite os 8 dígitos." });
      return;
    }
    lastLookup.current = digits;
    runCepLookup(digits);
  };

  const cepBlur = () => {
    const digits = normalizeCep(v.cep);
    // Reformata para o padrão 00000-000 ao sair do campo.
    setAddressFields({ cep: formatCep(digits) });
    if (digits.length === 0) return;
    if (!isValidCep(digits)) {
      setCepError({
        kind: "invalid",
        message:
          digits.length < 8
            ? "CEP incompleto — precisa ter 8 dígitos."
            : "CEP inválido — verifique os números digitados.",
      });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const isEntrega = tipo === "Entrega";
    if (!v.cliente.trim() || (isEntrega && !v.endereco.trim())) return;

    const hasGps = v.lat != null && v.lng != null;
    const cepDigits = normalizeCep(v.cep);
    if (isEntrega) {
      if (!hasGps && cepDigits.length === 0) {
        toast.error("Informe o CEP ou capture a localização (GPS)");
        setCepError({
          kind: "invalid",
          message: "CEP obrigatório — ou salve a localização (GPS) do destino.",
        });
        return;
      }
      if (cepDigits.length > 0 && !isValidCep(cepDigits)) {
        toast.error("CEP inválido");
        setCepError({
          kind: "invalid",
          message:
            cepDigits.length < 8
              ? "CEP incompleto — precisa ter 8 dígitos."
              : "CEP inválido — verifique os números digitados.",
        });
        return;
      }
      if (v.cidade.trim() && !isAllowedCity(v.cidade)) {
        toast.error(`Só atendemos ${ALLOWED_CITY}-${ALLOWED_UF}`);
        setCepError({
          kind: "out_of_area",
          message: `Fora da área de atendimento. Só entregamos em ${ALLOWED_CITY}-${ALLOWED_UF}.`,
        });
        return;
      }
    }
    const obsParts = [];
    if (forma) obsParts.push(`Pagamento: ${forma}`);
    if (tipo) obsParts.push(`Tipo: ${tipo}`);
    if (v.observacoes.trim()) obsParts.push(v.observacoes.trim());
    
    const obs = obsParts.join("\n");
    onSubmit({
      ...v,
      cep: isEntrega ? (cepDigits ? formatCep(cepDigits) : "") : "",
      endereco: isEntrega ? v.endereco : "RETIRADA NO LOCAL",
      numero: isEntrega ? v.numero : "",
      bairro: isEntrega ? v.bairro : "",
      complemento: isEntrega ? v.complemento : "",
      valor: Number(v.valor) || 0,
      observacoes: obs,
      dataHora: new Date(v.dataHora).toISOString(),
      agendadoPara: v.agendadoPara ? new Date(v.agendadoPara).toISOString() : null,
      lat: isEntrega ? (v.lat ?? null) : null,
      lng: isEntrega ? (v.lng ?? null) : null,
      status: v.status || "pendente",
    });
  };

  const [geoBusy, setGeoBusy] = useState(false);
  const captureLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocalização não disponível neste dispositivo");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setV((p) => ({ ...p, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setGeoBusy(false);
        toast.success("Localização salva para esta entrega");
      },
      (err) => {
        setGeoBusy(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada"
            : "Não foi possível obter a localização";
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cliente">Cliente *</Label>
        <div className="relative">
          <Input
            id="cliente"
            value={v.cliente}
            onChange={(e) => set("cliente", e.target.value)}
            onFocus={() => setSuggestField("cliente")}
            onBlur={() => window.setTimeout(() => setSuggestField(null), 150)}
            required
            maxLength={100}
            autoComplete="off"
          />
          {suggestField === "cliente" && activeSuggestions.length > 0 && (
            <ClienteSuggestions items={activeSuggestions} onPick={pickCliente} />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="telefone">Telefone</Label>
          <div className="relative">
            <Input
              id="telefone"
              value={v.telefone}
              onChange={(e) => set("telefone", formatPhone(e.target.value))}
              onFocus={() => setSuggestField("telefone")}
              onBlur={() => window.setTimeout(() => setSuggestField(null), 150)}
              inputMode="tel"
              placeholder="(11) 91234-5678"
              maxLength={16}
              autoComplete="off"
            />
            {suggestField === "telefone" && activeSuggestions.length > 0 && (
              <ClienteSuggestions items={activeSuggestions} onPick={pickCliente} />
            )}
          </div>
        </div>
      <div className="space-y-1.5">
        <Label>Tipo de pedido</Label>
        <div className="grid grid-cols-2 gap-2">
          {TIPOS_ENTREGA.map((t) => (
            <Button
              key={t}
              type="button"
              variant={tipo === t ? "default" : "outline"}
              onClick={() => setTipo(t)}
            >
              {t}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
          <Label htmlFor="valor">Valor</Label>
          <Input
            id="valor"
            value={currencyMaskFromNumber(v.valor)}
            onChange={(e) => set("valor", parseCurrencyToNumber(formatCurrencyFromDigits(e.target.value)))}
            inputMode="numeric"
            placeholder="R$ 0,00"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Forma de pagamento</Label>
        <div className="grid grid-cols-3 gap-2">
          {FORMAS_PAGAMENTO.map((f) => (
            <Button
              key={f}
              type="button"
              variant={forma === f ? "default" : "outline"}
              onClick={() => setForma((prev) => (prev === f ? "" : f))}
            >
              {f}
            </Button>
          ))}
        </div>
      </div>
      <label
        htmlFor="pago-switch"
        className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 cursor-pointer"
      >
        <div className="min-w-0">
          <span className="text-sm font-medium">Pagamento recebido</span>
          <p className="text-xs text-muted-foreground">
            Marque se o cliente já pagou (ex: Pix antecipado).
          </p>
        </div>
        <input
          id="pago-switch"
          type="checkbox"
          className="h-5 w-9 shrink-0 cursor-pointer accent-primary"
          checked={v.pago}
          onChange={(e) => set("pago", e.target.checked)}
        />
      </label>
      {tipo === "Entrega" && (() => {
        const digits = normalizeCep(v.cep);
        const missing = digits.length > 0 && digits.length < 8;
        const complete = digits.length === 8 && isValidCep(digits);
        const invalidNow = !!cepError || missing;
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cep">CEP *</Label>
              {missing && !cepError && (
                <span className="text-xs text-muted-foreground">
                  faltam {8 - digits.length} dígito(s)
                </span>
              )}
              {complete && !cepError && !cepLoading && (
                <span className="text-xs text-status-delivered">CEP válido</span>
              )}
            </div>
            <div className="relative">
              <Input
                id="cep"
                value={v.cep}
                onChange={(e) => handleCepChange(e.target.value)}
                onBlur={cepBlur}
                inputMode="numeric"
                placeholder="00000-000"
                maxLength={9}
                aria-invalid={invalidNow}
                aria-describedby={cepError ? "cep-error" : undefined}
                className={
                  invalidNow
                    ? "border-destructive text-destructive focus-visible:ring-destructive pr-9"
                    : complete
                      ? "border-status-delivered/60 focus-visible:ring-status-delivered pr-9"
                      : "pr-9"
                }
              />
              {cepLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {cepError && (
              <div
                id="cep-error"
                role="alert"
                className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <span className="min-w-0">{cepError.message}</span>
                {cepError.kind === "network" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-destructive hover:bg-destructive/20 hover:text-destructive"
                    onClick={retryCep}
                    disabled={cepLoading}
                  >
                    Tentar novamente
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })()}
      {tipo === "Entrega" && (
        <>
          <div className="space-y-1.5">
        <Label htmlFor="endereco">Endereço *</Label>
        <Input id="endereco" value={v.endereco} onChange={(e) => setAddressFields({ endereco: e.target.value })} required maxLength={200} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="numero">Número</Label>
          <Input id="numero" value={v.numero} onChange={(e) => setAddressFields({ numero: e.target.value })} maxLength={20} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bairro">Bairro</Label>
          <Input id="bairro" value={v.bairro} onChange={(e) => setAddressFields({ bairro: e.target.value })} maxLength={100} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cidade">Cidade</Label>
          <Input id="cidade" value={v.cidade} onChange={(e) => setAddressFields({ cidade: e.target.value })} maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="complemento">Complemento</Label>
          <Input id="complemento" value={v.complemento} onChange={(e) => set("complemento", e.target.value)} maxLength={100} />
        </div>
      </div>
      {(() => {
        if (!cepData) return null;
        const cepCidade = `${cepData.localidade}${cepData.uf ? "/" + cepData.uf : ""}`;
        const diffs: { label: string; user: string; cep: string; key: "endereco" | "bairro" | "cidade" }[] = [];
        if (cepData.logradouro && v.endereco.trim() && norm(v.endereco) !== norm(cepData.logradouro)) {
          diffs.push({ label: "Rua", user: v.endereco, cep: cepData.logradouro, key: "endereco" });
        }
        if (cepData.bairro && v.bairro.trim() && norm(v.bairro) !== norm(cepData.bairro)) {
          diffs.push({ label: "Bairro", user: v.bairro, cep: cepData.bairro, key: "bairro" });
        }
        if (cepData.localidade && v.cidade.trim() && norm(v.cidade).split("/")[0] !== norm(cepData.localidade)) {
          diffs.push({ label: "Cidade", user: v.cidade, cep: cepCidade, key: "cidade" });
        }
        if (diffs.length === 0) return null;
        const applyCep = () => {
          setAddressFields({
            endereco: cepData.logradouro || v.endereco,
            bairro: cepData.bairro || v.bairro,
            cidade: cepCidade || v.cidade,
          });
          toast.success("Endereço substituído pelos dados do CEP");
        };
        return (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm"
          >
            <p className="font-medium text-primary">
              O endereço digitado é diferente do que os Correios retornam para este CEP.
            </p>
            <p className="text-xs text-muted-foreground">
              Ruas podem ter mudado de nome. Usar o endereço do CEP evita erros no mapa e no cálculo da rota.
            </p>
            <ul className="space-y-1 text-xs">
              {diffs.map((d) => (
                <li key={d.key} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{d.label}:</span>
                  <span className="text-muted-foreground line-through">{d.user}</span>
                  <span aria-hidden>→</span>
                  <span className="font-medium">{d.cep}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 pt-1">
              <Button type="button" size="sm" variant="default" onClick={applyCep}>
                Usar endereço do CEP
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCepData(null)}>
                Manter o que digitei
              </Button>
            </div>
          </div>
        );
      })()}
      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Localização do destino (GPS)</p>
            <p className="text-xs text-muted-foreground">
              {v.lat != null && v.lng != null
                ? `Salvo: ${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`
                : "Opcional. Se salvo, o app confirma a entrega quando você chegar (~50 m)."}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {v.lat != null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setV((p) => ({ ...p, lat: null, lng: null }))}
              >
                Limpar
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={captureLocation}
              disabled={geoBusy}
              className="gap-1.5"
            >
              {geoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              Usar minha localização
            </Button>
          </div>
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
      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="agendar-switch" className="cursor-pointer">
              Entrega programada
            </Label>
            <p className="text-xs text-muted-foreground">
              Ative para definir um horário específico de entrega.
            </p>
          </div>
          <input
            id="agendar-switch"
            type="checkbox"
            className="h-5 w-9 shrink-0 cursor-pointer accent-primary"
            checked={!!v.agendadoPara}
            onChange={(e) =>
              set(
                "agendadoPara",
                e.target.checked ? toLocalInput(new Date(Date.now() + 60 * 60 * 1000).toISOString()) : null,
              )
            }
          />
        </div>
        {v.agendadoPara && (
          <div className="space-y-1.5">
            <Label htmlFor="agendadoPara">Horário programado</Label>
            <Input
              id="agendadoPara"
              type="datetime-local"
              value={v.agendadoPara ?? ""}
              onChange={(e) => set("agendadoPara", e.target.value)}
            />
          </div>
        )}
      </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea id="observacoes" value={v.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} maxLength={500} />
      </div>
      {(() => {
        const digits = normalizeCep(v.cep);
        const hasGps = v.lat != null && v.lng != null;
        const cepOk = digits.length === 0 ? hasGps : isValidCep(digits);
        const blocked = !cepOk || !!cepError;
        return (
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1 h-12" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 h-12" disabled={blocked}>
              Salvar
            </Button>
          </div>
        );
      })()}
    </form>
  );
}

function ClienteSuggestions({ items, onPick }: { items: Cliente[]; onPick: (c: Cliente) => void }) {
  return (
    <ul
      role="listbox"
      className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-elevated"
    >
      {items.map((c) => (
        <li key={c.key}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(c)}
            className="w-full text-left px-3 py-2 hover:bg-muted focus:bg-muted focus:outline-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">{c.cliente}</span>
              <span className="text-[11px] shrink-0 text-muted-foreground">
                {c.entregas}× {c.telefone ? "· " + c.telefone : ""}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {[c.endereco, c.numero, c.bairro].filter(Boolean).join(", ")}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

