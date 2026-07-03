import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Bike, BarChart3, ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { DeliveryCard } from "@/components/DeliveryCard";
import { DeliveryForm, type DeliveryFormValues } from "@/components/DeliveryForm";
import type { Delivery, DeliveryStatus } from "@/lib/deliveries";
import { useDeliveries, buildMapsUrl, formatBRL, statusLabel } from "@/lib/deliveries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Index,
});

type Filter = "todas" | DeliveryStatus;

function Index() {
  const { items, create, update, remove } = useDeliveries();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Delivery | undefined>();
  const [deleting, setDeleting] = useState<Delivery | undefined>();
  const [arrivalPromptId, setArrivalPromptId] = useState<string | undefined>();
  const navigatedIdRef = useRef<string | undefined>(undefined);
  const navigatedAtRef = useRef<number>(0);

  const counts = useMemo(() => ({
    pendente: items.filter((d) => d.status === "pendente").length,
    em_rota: items.filter((d) => d.status === "em_rota").length,
    entregue: items.filter((d) => d.status === "entregue").length,
    cancelada: items.filter((d) => d.status === "cancelada").length,
  }), [items]);

  const todayStats = useMemo(() => {
    const today = new Date().toDateString();
    const day = items.filter((d) => new Date(d.dataHora).toDateString() === today);
    const entregues = day.filter((d) => d.status === "entregue").length;
    const pendentes = day.filter((d) => d.status === "pendente" || d.status === "em_rota").length;
    const total = day.length;
    const receita = day.filter((d) => d.status === "entregue").reduce((s, d) => s + d.valor, 0);
    return {
      total,
      entregues,
      pendentes,
      taxa: total ? Math.round((entregues / total) * 100) : 0,
      receita,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((d) => {
      if (filter !== "todas" && d.status !== filter) return false;
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

  const openNew = () => { setEditing(undefined); setFormOpen(true); };
  const openEdit = (d: Delivery) => { setEditing(d); setFormOpen(true); };

  const handleSubmit = (v: DeliveryFormValues) => {
    if (editing) {
      update(editing.id, v);
      toast.success("Entrega atualizada");
    } else {
      create(v);
      toast.success("Entrega cadastrada");
    }
    setFormOpen(false);
    setEditing(undefined);
  };

  const handleNavigate = (d: Delivery) => {
    window.open(buildMapsUrl(d), "_blank", "noopener");
    if (d.status === "pendente") update(d.id, { status: "em_rota" });
    navigatedIdRef.current = d.id;
    navigatedAtRef.current = Date.now();
  };

  // Ao voltar do Google Maps para o app, pergunta se a entrega foi concluída.
  // Só dispara se: (1) usuário navegou para uma entrega, (2) passou pelo menos
  // 15s (evita disparar quando ele só troca de aba rapidinho) e (3) a entrega
  // ainda não está marcada como entregue.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const id = navigatedIdRef.current;
      if (!id) return;
      const elapsed = Date.now() - navigatedAtRef.current;
      if (elapsed < 15_000) return;
      const target = items.find((x) => x.id === id);
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
  }, [items]);

  const arrivalTarget = arrivalPromptId ? items.find((x) => x.id === arrivalPromptId) : undefined;

  const confirmArrival = () => {
    if (arrivalTarget) {
      update(arrivalTarget.id, { status: "entregue" });
      toast.success(`${arrivalTarget.cliente} · marcada como entregue`);
    }
    setArrivalPromptId(undefined);
  };

  const handleDeliver = (d: Delivery) => {
    update(d.id, { status: "entregue" });
    toast.success(`${d.cliente} · marcada como entregue`);
  };

  const confirmDelete = () => {
    if (deleting) {
      remove(deleting.id);
      toast.success("Entrega removida");
      setDeleting(undefined);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-primary text-primary-foreground px-4 pt-6 pb-4 shadow-elevated">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center w-11 h-11 rounded-xl bg-primary-foreground/10">
              <Bike className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight">RotaExpress</h1>
              <p className="text-xs text-primary-foreground/70">Gestão de entregas</p>
            </div>
          </div>
        </header>

        <div className="px-4 -mt-2">
          {/* Dashboard cards */}
          <section className="grid grid-cols-3 gap-2 mt-4">
            <StatCard label="Pendentes" value={counts.pendente} color="bg-status-pending text-status-pending-foreground" />
            <StatCard label="Em Rota" value={counts.em_rota} color="bg-status-route text-status-route-foreground" />
            <StatCard label="Entregues" value={counts.entregue} color="bg-status-delivered text-status-delivered-foreground" />
          </section>

          <Tabs defaultValue="entregas" className="mt-5">
            <TabsList className="grid w-full grid-cols-2 h-12">
              <TabsTrigger value="entregas" className="gap-2 text-sm"><ClipboardList className="w-4 h-4" /> Entregas</TabsTrigger>
              <TabsTrigger value="relatorios" className="gap-2 text-sm"><BarChart3 className="w-4 h-4" /> Relatórios</TabsTrigger>
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
                {(["todas", "pendente", "em_rota", "entregue", "cancelada"] as Filter[]).map((f) => (
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
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="relatorios" className="mt-4 space-y-3">
              <div className="rounded-2xl bg-card shadow-card border p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Hoje</p>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <Metric label="Total" value={todayStats.total} />
                  <Metric label="Entregues" value={todayStats.entregues} accent="text-status-delivered" />
                  <Metric label="Em aberto" value={todayStats.pendentes} accent="text-status-pending" />
                  <Metric label="Taxa" value={`${todayStats.taxa}%`} accent="text-primary" />
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">Receita do dia</p>
                  <p className="text-2xl font-bold text-primary">{formatBRL(todayStats.receita)}</p>
                </div>
              </div>

              <div className="rounded-2xl bg-card shadow-card border p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Geral</p>
                <div className="mt-3 space-y-2">
                  {(Object.keys(statusLabel) as DeliveryStatus[]).map((s) => (
                    <div key={s} className="flex items-center justify-between">
                      <span className="text-sm">{statusLabel[s]}</span>
                      <span className="font-semibold">{counts[s]}</span>
                    </div>
                  ))}
                </div>
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
      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(undefined); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar entrega" : "Nova entrega"}</DialogTitle>
          </DialogHeader>
          <DeliveryForm initial={editing} onSubmit={handleSubmit} onCancel={() => { setFormOpen(false); setEditing(undefined); }} />
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

      {/* Arrival confirm — mostrado ao voltar do Maps */}
      <AlertDialog open={!!arrivalTarget} onOpenChange={(o) => { if (!o) setArrivalPromptId(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chegou no destino?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmar entrega de <strong>{arrivalTarget?.cliente}</strong>
              {arrivalTarget?.endereco ? <> em {arrivalTarget.endereco}{arrivalTarget.numero ? `, ${arrivalTarget.numero}` : ""}</> : null}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ainda não</AlertDialogCancel>
            <AlertDialogAction onClick={confirmArrival} className="bg-status-delivered text-status-delivered-foreground hover:bg-status-delivered/90">
              Confirmar entrega
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
