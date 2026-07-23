import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Bike, BarChart3, ClipboardList, Route as RouteIcon, Users, Phone, MapPin, Pencil, Trash2, Calendar as CalendarIcon, Settings as SettingsIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { DeliveryCard } from "@/components/DeliveryCard";
import { DeliveryForm, type DeliveryFormValues } from "@/components/DeliveryForm";
import type { Delivery, DeliveryStatus } from "@/lib/deliveries";
import { useDeliveries, buildMapsUrl, formatBRL, statusLabel, distanceMeters } from "@/lib/deliveries";
import { useClientes, clienteKey, upsertClienteFromDelivery, updateStoredCliente, removeStoredCliente, type Cliente } from "@/lib/clientes";
import { cn } from "@/lib/utils";
import { InstallPrompt } from "@/components/InstallPrompt";
import { printComanda } from "@/lib/print-comanda";
import { useCompanySettings, DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/company-settings";
import { buildWhatsappUrl } from "@/lib/whatsapp";
import { isValidBrPhone } from "@/lib/masks";

export const Route = createFileRoute("/")({
  component: Index,
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen grid place-items-center bg-background p-6 text-center">
      <div className="max-w-sm">
        <h2 className="text-lg font-semibold">Algo deu errado</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Erro inesperado"}
        </p>
        <button
          onClick={reset}
          className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  ),
});

type Filter = "todas" | DeliveryStatus;

function Index() {
  const { items, create, update, remove } = useDeliveries();
  const clientes = useClientes(items);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Delivery | undefined>();
  const [prefill, setPrefill] = useState<Cliente | undefined>();
  const [clienteSearch, setClienteSearch] = useState("");
  const [deleting, setDeleting] = useState<Delivery | undefined>();
  const [editingCliente, setEditingCliente] = useState<Cliente | undefined>();
  const [deletingCliente, setDeletingCliente] = useState<Cliente | undefined>();
  const [arrivalPromptId, setArrivalPromptId] = useState<string | undefined>();
  const navigatedIdRef = useRef<string | undefined>(undefined);
  const navigatedAtRef = useRef<number>(0);

  // Dia selecionado no relatório (ISO yyyy-mm-dd). Default: hoje.
  const todayISO = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);
  const [reportDay, setReportDay] = useState<string>(todayISO);
  const [company, setCompany] = useCompanySettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [companyDraft, setCompanyDraft] = useState(company);
  useEffect(() => { setCompanyDraft(company); }, [company, settingsOpen]);


  const counts = useMemo(() => {
    const c = { pendente: 0, em_rota: 0, entregue: 0, cancelada: 0 };
    for (const d of items) c[d.status]++;
    return c;
  }, [items]);

  const todayStats = useMemo(() => {
    const today = new Date().toDateString();
    let total = 0;
    let entregues = 0;
    let pendentes = 0;
    let receita = 0;
    for (const d of items) {
      if (new Date(d.dataHora).toDateString() !== today) continue;
      total++;
      if (d.status === "entregue") {
        entregues++;
        receita += d.valor;
      } else if (d.status === "pendente" || d.status === "em_rota") {
        pendentes++;
      }
    }
    return {
      total,
      entregues,
      pendentes,
      taxa: total ? Math.round((entregues / total) * 100) : 0,
      receita,
    };
  }, [items]);

  const dayItems = useMemo(() => {
    return items
      .filter((d) => {
        const dt = new Date(d.dataHora);
        const pad = (n: number) => String(n).padStart(2, "0");
        const key = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
        return key === reportDay;
      })
      .sort((a, b) => +new Date(b.dataHora) - +new Date(a.dataHora));
  }, [items, reportDay]);

  const dayStats = useMemo(() => {
    let total = 0, entregues = 0, pendentes = 0, canceladas = 0, receita = 0;
    for (const d of dayItems) {
      total++;
      if (d.status === "entregue") { entregues++; receita += d.valor; }
      else if (d.status === "cancelada") canceladas++;
      else pendentes++;
    }
    return { total, entregues, pendentes, canceladas, receita, taxa: total ? Math.round((entregues / total) * 100) : 0 };
  }, [dayItems]);

  // Resumo agrupado por dia (todos os dias com entregas)
  const daysSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of items) {
      const dt = new Date(d.dataHora);
      const pad = (n: number) => String(n).padStart(2, "0");
      const key = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [items]);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((d) => {
      if (filter === "todas") {
        if (d.status !== "pendente" && d.status !== "em_rota") return false;
      } else if (d.status !== filter) return false;
      if (!q) return true;
      return (
        d.cliente.toLowerCase().includes(q) ||
        d.telefone.toLowerCase().includes(q) ||
        d.endereco.toLowerCase().includes(q) ||
        d.bairro.toLowerCase().includes(q) ||
        d.cidade.toLowerCase().includes(q)
      );
    });
  }, [items, search, filter]);

  const openNew = () => { setEditing(undefined); setPrefill(undefined); setFormOpen(true); };
  const openEdit = (d: Delivery) => { setEditing(d); setPrefill(undefined); setFormOpen(true); };
  const openNewForCliente = (c: Cliente) => { setEditing(undefined); setPrefill(c); setFormOpen(true); };

  const filteredClientes = useMemo(() => {
    const q = clienteSearch.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        c.cliente.toLowerCase().includes(q) ||
        c.telefone.toLowerCase().includes(q) ||
        c.endereco.toLowerCase().includes(q) ||
        c.bairro.toLowerCase().includes(q),
    );
  }, [clientes, clienteSearch]);

  // "initial" sintético para pré-preencher o form a partir de um cliente escolhido.
  const prefillInitial: Delivery | undefined = useMemo(() => {
    if (!prefill) return undefined;
    return {
      id: "",
      cliente: prefill.cliente,
      telefone: prefill.telefone,
      cep: prefill.cep,
      endereco: prefill.endereco,
      numero: prefill.numero,
      bairro: prefill.bairro,
      cidade: prefill.cidade,
      complemento: prefill.complemento,
      observacoes: "",
      valor: 0,
      dataHora: new Date().toISOString(),
      agendadoPara: null,
      lat: prefill.lat,
      lng: prefill.lng,
      status: "pendente",
      pago: false,
      criadoEm: new Date().toISOString(),
      trackCode: null,
    };
  }, [prefill]);


  const handleSubmit = async (v: DeliveryFormValues) => {
    try {
      if (editing) {
        await update(editing.id, v);
        toast.success("Entrega atualizada", {
          action: {
            label: "Imprimir comanda",
            onClick: () => printComanda({ ...editing, ...v }),
          },
        });
      } else {
        const created = await create(v);
        toast.success("Entrega cadastrada", {
          duration: 8000,
          action: {
            label: "Imprimir comanda",
            onClick: () => printComanda(created),
          },
        });
      }
      upsertClienteFromDelivery(v);
      setFormOpen(false);
      setEditing(undefined);
    } catch (err) {
      console.error(err);
      toast.error(editing ? "Erro ao atualizar entrega" : "Erro ao cadastrar entrega", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleNavigate = async (d: Delivery) => {
    window.open(buildMapsUrl(d), "_blank", "noopener");
    if (d.status === "pendente") {
      try {
        await update(d.id, { status: "em_rota" });
      } catch {
        /* update falhou — status permanece; realtime irá alinhar */
      }
    }
    navigatedIdRef.current = d.id;
    navigatedAtRef.current = Date.now();
  };

  // Ao voltar do Google Maps para o app, pergunta se a entrega foi concluída.
  // Só dispara se: (1) usuário navegou para uma entrega, (2) passou pelo menos
  // 15s (evita disparar quando ele só troca de aba rapidinho) e (3) a entrega
  // ainda não está marcada como entregue.
  // Mantemos uma ref sempre atualizada com os items para os watchers abaixo
  // não reiniciarem a cada refresh do realtime.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const id = navigatedIdRef.current;
      if (!id) return;
      const elapsed = Date.now() - navigatedAtRef.current;
      if (elapsed < 15_000) return;
      const target = itemsRef.current.find((x) => x.id === id);
      if (!target || target.status === "entregue" || target.status === "cancelada") {
        navigatedIdRef.current = undefined;
        return;
      }
      setArrivalPromptId(id);
      navigatedIdRef.current = undefined;
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // Watcher de GPS: quando o usuário está a menos de 50 m de uma entrega
  // "em_rota" com lat/lng salvos, dispara o mesmo prompt de chegada.
  // Requer 2 leituras seguidas dentro do raio (evita disparo por spike de GPS).
  const geoTriggeredRef = useRef<Set<string>>(new Set());
  const nearHitsRef = useRef<Map<string, number>>(new Map());

  // Limpa flags quando a entrega deixa de estar em rota — permite reativar
  // o prompt se o motoboy voltar depois.
  useEffect(() => {
    const activeIds = new Set(
      items.filter((d) => d.status === "em_rota").map((d) => d.id),
    );
    for (const id of geoTriggeredRef.current) {
      if (!activeIds.has(id)) geoTriggeredRef.current.delete(id);
    }
    for (const id of nearHitsRef.current.keys()) {
      if (!activeIds.has(id)) nearHitsRef.current.delete(id);
    }
  }, [items]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    const ARRIVAL_RADIUS_M = 50;
    const REQUIRED_HITS = 2;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const enRoute = itemsRef.current.filter(
          (d) =>
            d.status === "em_rota" &&
            typeof d.lat === "number" &&
            typeof d.lng === "number",
        );
        for (const d of enRoute) {
          if (geoTriggeredRef.current.has(d.id)) continue;
          const dist = distanceMeters(me, { lat: d.lat as number, lng: d.lng as number });
          if (dist <= ARRIVAL_RADIUS_M) {
            const hits = (nearHitsRef.current.get(d.id) ?? 0) + 1;
            nearHitsRef.current.set(d.id, hits);
            if (hits >= REQUIRED_HITS) {
              geoTriggeredRef.current.add(d.id);
              nearHitsRef.current.delete(d.id);
              setArrivalPromptId((cur) => cur ?? d.id);
              break;
            }
          } else {
            nearHitsRef.current.delete(d.id);
          }
        }
      },
      () => {
        /* silencioso — sem permissão o app segue funcionando */
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const arrivalTarget = arrivalPromptId ? items.find((x) => x.id === arrivalPromptId) : undefined;

  const confirmArrival = async (id?: string) => {
    const target = id ? items.find((x) => x.id === id) : arrivalTarget;
    setArrivalPromptId(undefined);
    if (!target) return;
    try {
      await update(target.id, { status: "entregue" });
      toast.success(`${target.cliente} · marcada como entregue`);
    } catch {
      toast.error("Erro ao marcar como entregue");
    }
  };

  // Quando o app detecta chegada (voltar do Maps ou GPS), mostra um snackbar
  // persistente com botões "Confirmar entrega" / "Ainda não".
  useEffect(() => {
    if (!arrivalTarget) return;
    const id = arrivalTarget.id;
    const addr = arrivalTarget.endereco
      ? `${arrivalTarget.endereco}${arrivalTarget.numero ? ", " + arrivalTarget.numero : ""}`
      : "";
    const toastId = toast(`Chegou em ${arrivalTarget.cliente}?`, {
      description: addr || "Confirme a entrega com um toque.",
      duration: Infinity,
      action: {
        label: "Confirmar entrega",
        onClick: () => confirmArrival(id),
      },
      cancel: {
        label: "Ainda não",
        onClick: () => setArrivalPromptId(undefined),
      },
      onDismiss: () => setArrivalPromptId((cur) => (cur === id ? undefined : cur)),
    });
    return () => {
      toast.dismiss(toastId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivalTarget?.id]);


  const handleDeliver = async (d: Delivery) => {
    try {
      await update(d.id, { status: "entregue" });
      toast.success(`${d.cliente} · marcada como entregue`);
    } catch {
      toast.error("Erro ao marcar como entregue");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(undefined);
    try {
      await remove(target.id);
      toast.success("Entrega removida");
    } catch {
      toast.error("Erro ao remover entrega");
    }
  };

  const confirmDeleteCliente = async () => {
    if (!deletingCliente) return;
    const target = deletingCliente;
    setDeletingCliente(undefined);
    const ids = items
      .filter((d) => clienteKey(d.cliente, d.telefone) === target.key)
      .map((d) => d.id);
    try {
      await Promise.all(ids.map((id) => remove(id)));
      removeStoredCliente(target.key);
      const suf = ids.length === 0
        ? "removido do cadastro"
        : `${ids.length} ${ids.length === 1 ? "entrega removida" : "entregas removidas"}`;
      toast.success(`${target.cliente} · ${suf}`);
    } catch {
      toast.error("Erro ao excluir cliente");
    }
  };

  const saveCliente = async (updated: Cliente) => {
    const targets = items.filter((d) => clienteKey(d.cliente, d.telefone) === updated.key);
    try {
      await Promise.all(
        targets.map((d) =>
          update(d.id, {
            cliente: updated.cliente,
            telefone: updated.telefone,
            cep: updated.cep,
            endereco: updated.endereco,
            numero: updated.numero,
            bairro: updated.bairro,
            cidade: updated.cidade,
            complemento: updated.complemento,
          }),
        ),
      );
      updateStoredCliente(updated.key, updated);
      toast.success("Cliente atualizado");
      setEditingCliente(undefined);
    } catch (err) {
      toast.error("Erro ao salvar cliente", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // Indicador de "offline" — apenas informativo. Inicializa como `true` para
  // evitar mismatch de hidratação (SSR sem navigator). O effect ajusta no client.
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof navigator !== "undefined") setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-36">
      <InstallPrompt />

      {!online && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-0 inset-x-0 z-40 bg-destructive text-destructive-foreground text-center text-xs font-medium py-1.5"
        >
          Você está offline — mudanças não serão salvas até reconectar
        </div>
      )}
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-primary text-primary-foreground px-4 pt-6 pb-4 shadow-elevated">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center w-11 h-11 rounded-xl bg-primary-foreground/10">
              <Bike className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold leading-tight truncate">{company.nome || "RotaExpress"}</h1>
              <p className="text-xs text-primary-foreground/70">Gestão de entregas</p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary-foreground/10 hover:bg-primary-foreground/20"
              aria-label="Configurações da empresa"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
            <Link
              to="/rota"
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-accent text-accent-foreground text-sm font-semibold shadow-elevated hover:bg-accent/90"
              aria-label="Montar rota otimizada"
            >
              <RouteIcon className="w-4 h-4" />
              Rota
            </Link>
          </div>
        </header>

        <div className="px-4 -mt-2">
          {/* Dashboard cards */}
          <section className="grid grid-cols-3 gap-2 mt-4">
            <StatCard label="Pendentes" value={counts.pendente} color="bg-status-pending text-status-pending-foreground" />
            <StatCard label="Em Rota" value={counts.em_rota} color="bg-status-route text-status-route-foreground" />
            <StatCard label="Entregues hoje" value={todayStats.entregues} color="bg-status-delivered text-status-delivered-foreground" />
          </section>

          <Tabs defaultValue="entregas" className="mt-5">
            <TabsList className="grid w-full grid-cols-3 h-12">
              <TabsTrigger value="entregas" className="gap-1.5 text-sm"><ClipboardList className="w-4 h-4" /> Entregas</TabsTrigger>
              <TabsTrigger value="clientes" className="gap-1.5 text-sm"><Users className="w-4 h-4" /> Clientes</TabsTrigger>
              <TabsTrigger value="relatorios" className="gap-1.5 text-sm"><BarChart3 className="w-4 h-4" /> Relatórios</TabsTrigger>
            </TabsList>

            <TabsContent value="entregas" className="mt-4 space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cliente, telefone ou endereço"
                  className="pl-9 h-12 bg-card"
                />
              </div>

              {/* Filter chips */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {(["todas", "pendente", "em_rota"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "shrink-0 px-4 h-9 rounded-full text-sm font-medium border transition-colors",
                      filter === f
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:bg-muted",
                    )}
                  >
                    {f === "todas" ? "Todas" : statusLabel[f]}
                  </button>
                ))}
              </div>

              {/* List */}
              {filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Nenhuma entrega encontrada</p>
                  <Button onClick={openNew} variant="link" className="mt-2">Cadastrar a primeira</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((d) => (
                    <DeliveryCard
                      key={d.id}
                      d={d}
                      onNavigate={() => handleNavigate(d)}
                      onEdit={() => openEdit(d)}
                      onDelete={() => setDeleting(d)}
                      onDeliver={() => handleDeliver(d)}
                      onPrint={() => printComanda(d)}
                      onWhatsapp={
                        isValidBrPhone(d.telefone)
                          ? () => {
                              const url = buildWhatsappUrl(d, company);
                              if (!url) {
                                toast.error("Telefone do cliente inválido");
                                return;
                              }
                              window.open(url, "_blank", "noopener,noreferrer");
                            }
                          : undefined
                      }
                      onTogglePago={async () => {
                        try {
                          await update(d.id, { pago: !d.pago });
                          toast.success(!d.pago ? "Marcada como paga" : "Marcada como não paga");
                        } catch {
                          toast.error("Erro ao atualizar pagamento");
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="clientes" className="mt-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={clienteSearch}
                  onChange={(e) => setClienteSearch(e.target.value)}
                  placeholder="Buscar por nome, telefone ou endereço"
                  className="pl-9 h-12 bg-card"
                />
              </div>
              {filteredClientes.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">
                    {clientes.length === 0
                      ? "Nenhum cliente ainda. Cadastre uma entrega para começar."
                      : "Nenhum cliente encontrado."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredClientes.map((c) => (
                    <ClienteCard
                      key={c.key}
                      c={c}
                      onNew={() => openNewForCliente(c)}
                      onEdit={() => setEditingCliente(c)}
                      onDelete={() => setDeletingCliente(c)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="relatorios" className="mt-4 space-y-3">
              {/* Lista de entregas agrupadas por dia */}
              <div className="rounded-2xl bg-card shadow-card border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Entregas por dia
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {daysSummary.length} {daysSummary.length === 1 ? "dia" : "dias"}
                  </span>
                </div>

                {daysSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhuma entrega registrada
                  </p>
                ) : (
                  <ul className="divide-y">
                    {daysSummary.map(({ day, count }) => {
                      const selected = day === reportDay;
                      const [y, m, dd] = day.split("-");
                      return (
                        <li key={day}>
                          <button
                            type="button"
                            onClick={() => setReportDay(selected ? "" : day)}
                            className={cn(
                              "w-full flex items-center justify-between py-3 px-2 rounded-lg transition-colors",
                              selected ? "bg-primary/10" : "hover:bg-muted/50",
                            )}
                          >
                            <span className="flex items-center gap-2 font-semibold">
                              <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                              {dd}/{m}/{y}
                              {day === todayISO && (
                                <span className="text-[10px] uppercase font-semibold rounded-full px-1.5 py-0.5 bg-primary/15 text-primary">
                                  Hoje
                                </span>
                              )}
                            </span>
                            <span className="text-sm font-semibold text-primary">
                              {count} {count === 1 ? "entrega" : "entregas"}
                            </span>
                          </button>

                          {selected && (
                            <ul className="pl-6 pr-2 pb-3 pt-1 space-y-1">
                              {dayItems.map((d) => (
                                <li key={d.id} className="flex items-center gap-3 py-1.5 border-t first:border-t-0">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-sm truncate">{d.cliente}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {new Date(d.dataHora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                      {d.endereco ? ` · ${d.endereco}${d.numero ? ", " + d.numero : ""}` : ""}
                                    </p>
                                  </div>
                                  <span
                                    className={cn(
                                      "shrink-0 text-[10px] uppercase font-semibold rounded-full px-2 py-0.5",
                                      d.status === "entregue" && "bg-status-delivered/15 text-status-delivered",
                                      d.status === "em_rota" && "bg-status-route/15 text-status-route",
                                      d.status === "pendente" && "bg-status-pending/20 text-status-pending-foreground",
                                      d.status === "cancelada" && "bg-destructive/15 text-destructive",
                                    )}
                                  >
                                    {statusLabel[d.status]}
                                  </span>
                                  <span className="shrink-0 text-sm font-semibold tabular-nums w-20 text-right">
                                    {formatBRL(d.valor)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* FAB */}
      <div className="fixed inset-x-0 bottom-6 pointer-events-none z-30">
        <div className="mx-auto max-w-xl px-4 flex justify-end">
          <Button
            onClick={openNew}
            className="pointer-events-auto h-14 w-14 rounded-full shadow-elevated bg-accent hover:bg-accent/90 text-accent-foreground p-0"
            aria-label="Nova entrega"
          >
            <Plus className="w-6 h-6" />
          </Button>
        </div>
      </div>

      {/* Form dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) { setEditing(undefined); setPrefill(undefined); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar entrega" : prefill ? `Nova entrega para ${prefill.cliente}` : "Nova entrega"}</DialogTitle>
          </DialogHeader>
          <DeliveryForm
            initial={editing ?? prefillInitial}
            suggestions={clientes}
            onSubmit={handleSubmit}
            onCancel={() => { setFormOpen(false); setEditing(undefined); setPrefill(undefined); }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir entrega?</AlertDialogTitle>
            <AlertDialogDescription>
              A entrega de <strong>{deleting?.cliente}</strong> será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Editar cliente */}
      <Dialog open={!!editingCliente} onOpenChange={(o) => { if (!o) setEditingCliente(undefined); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          {editingCliente && (
            <ClienteEditForm
              initial={editingCliente}
              onCancel={() => setEditingCliente(undefined)}
              onSave={saveCliente}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Excluir cliente */}
      <AlertDialog open={!!deletingCliente} onOpenChange={(o) => { if (!o) setDeletingCliente(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as <strong>{deletingCliente?.entregas}</strong> entrega(s) de <strong>{deletingCliente?.cliente}</strong> serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCliente} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Configurações da empresa */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurações da empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="company-nome">Nome da empresa</Label>
              <Input
                id="company-nome"
                value={companyDraft.nome}
                onChange={(e) => setCompanyDraft({ ...companyDraft, nome: e.target.value })}
                placeholder="Ex.: O Casarão"
              />
              <p className="text-xs text-muted-foreground">Aparece no topo do app e na comanda impressa.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-saudacao">Mensagem de saudação</Label>
              <textarea
                id="company-saudacao"
                value={companyDraft.saudacao}
                onChange={(e) => setCompanyDraft({ ...companyDraft, saudacao: e.target.value })}
                placeholder="Ex.: Obrigado pela preferência!"
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">Impressa no rodapé da comanda de entrega.</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="company-whatsapp">Mensagem do WhatsApp</Label>
                <button
                  type="button"
                  onClick={() => setCompanyDraft({ ...companyDraft, whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE })}
                  className="text-xs text-primary hover:underline"
                >
                  Restaurar padrão
                </button>
              </div>
              <textarea
                id="company-whatsapp"
                value={companyDraft.whatsappTemplate}
                onChange={(e) => setCompanyDraft({ ...companyDraft, whatsappTemplate: e.target.value })}
                placeholder="Olá {cliente}! Seu pedido saiu para entrega..."
                rows={6}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Enviada ao tocar em WhatsApp no card da entrega. Variáveis:{" "}
                <code className="text-[11px]">{"{cliente} {empresa} {endereco} {valor} {pagamento} {maps} {saudacao} {observacoes}"}</code>
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>Cancelar</Button>
            <Button
              onClick={async () => {
                try {
                  await setCompany({
                    nome: companyDraft.nome.trim() || "RotaExpress",
                    saudacao: companyDraft.saudacao.trim(),
                    whatsappTemplate: companyDraft.whatsappTemplate.trim() || DEFAULT_WHATSAPP_TEMPLATE,
                  });
                  setSettingsOpen(false);
                  toast.success("Configurações salvas");
                } catch (e) {
                  toast.error("Falha ao salvar", {
                    description: e instanceof Error ? e.message : "Erro desconhecido",
                  });
                }
              }}
            >
              Salvar
            </Button>

          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
}

function ClienteCard({
  c,
  onNew,
  onEdit,
  onDelete,
}: {
  c: Cliente;
  onNew: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const endereco = [c.endereco, c.numero].filter(Boolean).join(", ");
  const cidade = [c.bairro, c.cidade].filter(Boolean).join(" · ");
  return (
    <div className="rounded-2xl bg-card shadow-card border p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{c.cliente}</p>
          {c.telefone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" /> {c.telefone}
            </p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide bg-primary/10 text-primary rounded-full px-2 py-1">
            {c.compras} {c.compras === 1 ? "compra" : "compras"}
          </span>
          {c.entregas !== c.compras && (
            <span className="text-[10px] text-muted-foreground">
              {c.entregas} {c.entregas === 1 ? "entrega" : "entregas"}
            </span>
          )}
        </div>
      </div>
      {endereco && (
        <p className="text-sm text-foreground/80 flex items-start gap-1.5">
          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            {endereco}
            {cidade && <span className="block text-xs text-muted-foreground">{cidade}</span>}
          </span>
        </p>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground">
          Total: <span className="font-medium text-foreground">{formatBRL(c.totalValor)}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onEdit} className="h-9 w-9 p-0" aria-label="Editar cliente">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete} className="h-9 w-9 p-0 text-destructive hover:text-destructive" aria-label="Excluir cliente">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={onNew} className="h-9 gap-1.5">
            <Plus className="w-4 h-4" /> Nova entrega
          </Button>
        </div>
      </div>
    </div>
  );
}

function ClienteEditForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: Cliente;
  onCancel: () => void;
  onSave: (c: Cliente) => void | Promise<void>;
}) {
  const [cliente, setCliente] = useState(initial.cliente);
  const [telefone, setTelefone] = useState(initial.telefone);
  const [cep, setCep] = useState(initial.cep);
  const [endereco, setEndereco] = useState(initial.endereco);
  const [numero, setNumero] = useState(initial.numero);
  const [bairro, setBairro] = useState(initial.bairro);
  const [cidade, setCidade] = useState(initial.cidade);
  const [complemento, setComplemento] = useState(initial.complemento);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente.trim() || !endereco.trim()) {
      toast.error("Nome e endereço são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...initial, cliente: cliente.trim(), telefone: telefone.trim(), cep: cep.trim(), endereco: endereco.trim(), numero: numero.trim(), bairro: bairro.trim(), cidade: cidade.trim(), complemento: complemento.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ec-nome">Cliente *</Label>
        <Input id="ec-nome" value={cliente} onChange={(e) => setCliente(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ec-tel">Telefone</Label>
        <Input id="ec-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ec-cep">CEP</Label>
          <Input id="ec-cep" value={cep} onChange={(e) => setCep(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ec-num">Número</Label>
          <Input id="ec-num" value={numero} onChange={(e) => setNumero(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ec-end">Endereço *</Label>
        <Input id="ec-end" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ec-bairro">Bairro</Label>
          <Input id="ec-bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ec-cid">Cidade</Label>
          <Input id="ec-cid" value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ec-comp">Complemento</Label>
        <Input id="ec-comp" value={complemento} onChange={(e) => setComplemento(e.target.value)} />
      </div>
      <DialogFooter className="gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </DialogFooter>
      <p className="text-[11px] text-muted-foreground">
        As alterações serão aplicadas a todas as entregas deste cliente.
      </p>
    </form>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={cn("rounded-2xl p-3 shadow-card", color)}>
      <p className="text-[11px] uppercase tracking-wide font-semibold opacity-90">{label}</p>
      <p className="text-2xl font-bold leading-tight mt-0.5">{value}</p>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold", accent)}>{value}</p>
    </div>
  );
}
