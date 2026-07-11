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
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<null | {
    kind: "invalid" | "not_found" | "network" | "out_of_area";
    message: string;
  }>(null);
  const cepAbort = useRef<AbortController | null>(null);
  const lastLookup = useRef<string>("");
  const [cepData, setCepData] = useState<CepResult | null>(null);

  useEffect(() => {
    if (initial) {
      setV({
        cliente: initial.cliente,
        telefone: formatPhone(initial.telefone),
        cep: initial.cep ?? "",
        endereco: initial.endereco,
        numero: initial.numero,
        bairro: initial.bairro,
        cidade: initial.cidade,
        complemento: initial.complemento,
        observacoes: initial.observacoes,
        valor: initial.valor,
        dataHora: toLocalInput(initial.dataHora),
        agendadoPara: initial.agendadoPara ? toLocalInput(initial.agendadoPara) : null,
        lat: initial.lat ?? null,
        lng: initial.lng ?? null,
        status: (["pendente", "em_rota", "entregue", "cancelada"] as DeliveryStatus[]).includes(initial.status)
          ? initial.status
          : "pendente",
      });
    } else {
      setV({ ...empty, dataHora: toLocalInput(new Date().toISOString()) });
    }
  }, [initial]);

  const set = <K extends keyof DeliveryFormValues>(k: K, val: DeliveryFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  // Autocomplete de clientes já cadastrados (só em novo cadastro).
  const [suggestField, setSuggestField] = useState<null | "cliente" | "telefone">(null);
  const activeSuggestions = (() => {
    if (initial || !suggestField) return [] as Cliente[];
    const q = suggestField === "cliente" ? v.cliente : v.telefone;
    return searchClientes(suggestions, q);
  })();
  const pickCliente = (c: Cliente) => {
    setV((p) => ({
      ...p,
      cliente: c.cliente,
      telefone: formatPhone(c.telefone),
      cep: c.cep || p.cep,
      endereco: c.endereco || p.endereco,
      numero: c.numero || p.numero,
      bairro: c.bairro || p.bairro,
      cidade: c.cidade || p.cidade,
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
          return { ...p, ...filled };
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
    setV((p) => ({ ...p, cep: formatCep(digits) }));
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
    setV((p) => ({ ...p, cep: formatCep(digits) }));
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
    if (!v.cliente.trim() || !v.endereco.trim()) return;

    const hasGps = v.lat != null && v.lng != null;
    const cepDigits = normalizeCep(v.cep);
    // CEP é obrigatório para geocoding preciso; só liberamos se já houver GPS salvo.
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
    onSubmit({
      ...v,
      cep: cepDigits ? formatCep(cepDigits) : "",
      valor: Number(v.valor) || 0,
      dataHora: new Date(v.dataHora).toISOString(),
      agendadoPara: v.agendadoPara ? new Date(v.agendadoPara).toISOString() : null,
      lat: v.lat ?? null,
      lng: v.lng ?? null,
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
      {(() => {
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
          setV((p) => ({
            ...p,
            endereco: cepData.logradouro || p.endereco,
            bairro: cepData.bairro || p.bairro,
            cidade: cepCidade || p.cidade,
          }));
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

