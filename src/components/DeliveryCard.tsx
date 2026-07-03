import { Navigation, Pencil, Trash2, CheckCircle2, Phone, MapPin, Clock, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import type { Delivery } from "@/lib/deliveries";
import { buildMapsUrl, formatBRL } from "@/lib/deliveries";

export function DeliveryCard({
  d,
  onEdit,
  onDelete,
  onDeliver,
  onNavigate,
}: {
  d: Delivery;
  onEdit: () => void;
  onDelete: () => void;
  onDeliver: () => void;
  onNavigate: () => void;
}) {
  const dt = new Date(d.dataHora);
  const fullAddr = [
    `${d.endereco}${d.numero ? ", " + d.numero : ""}`,
    d.bairro,
    d.cidade,
  ].filter(Boolean).join(" · ");

  return (
    <article className="rounded-2xl bg-card shadow-card border border-border overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base leading-tight truncate">{d.cliente}</h3>
            {d.telefone && (
              <a
                href={`tel:${d.telefone.replace(/\D/g, "")}`}
                className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
              >
                <Phone className="w-3.5 h-3.5" />
                {d.telefone}
              </a>
            )}
          </div>
          <StatusBadge status={d.status} />
        </div>

        <div className="flex items-start gap-2 text-sm text-foreground/80">
          <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
          <span className="min-w-0">{fullAddr || "Endereço não informado"}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="font-semibold text-primary">{formatBRL(d.valor)}</div>
        </div>

        {d.agendadoPara && (
          <div className="flex items-center gap-1.5 text-sm rounded-lg bg-accent/15 text-accent-foreground border border-accent/30 px-2.5 py-1.5">
            <CalendarClock className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">Programada para</span>
            <span className="ml-auto tabular-nums">
              {new Date(d.agendadoPara).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        {d.observacoes && (
          <p className="text-sm bg-muted rounded-lg px-3 py-2 text-muted-foreground">{d.observacoes}</p>
        )}
      </div>

      {d.status === "em_rota" && (
        <div className="px-3 pb-3">
          <Button
            onClick={onDeliver}
            className="w-full h-12 gap-2 bg-status-delivered text-status-delivered-foreground hover:bg-status-delivered/90 rounded-xl font-semibold"
          >
            <CheckCircle2 className="w-5 h-5" />
            Confirmar entrega
          </Button>
        </div>
      )}


      <div className="grid grid-cols-4 gap-1 p-2 border-t border-border bg-muted/30">
        <Button
          onClick={onNavigate}
          className="h-12 flex-col gap-0.5 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl"
          aria-label="Navegar"
        >
          <Navigation className="w-4 h-4" />
          <span className="text-[10px] font-semibold">Navegar</span>
        </Button>
        <Button
          onClick={onDeliver}
          disabled={d.status === "entregue"}
          className="h-12 flex-col gap-0.5 bg-status-delivered text-status-delivered-foreground hover:bg-status-delivered/90 rounded-xl disabled:opacity-40"
          aria-label="Marcar como entregue"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-[10px] font-semibold">Entregue</span>
        </Button>
        <Button
          onClick={onEdit}
          variant="secondary"
          className="h-12 flex-col gap-0.5 rounded-xl"
          aria-label="Editar"
        >
          <Pencil className="w-4 h-4" />
          <span className="text-[10px] font-semibold">Editar</span>
        </Button>
        <Button
          onClick={onDelete}
          variant="ghost"
          className="h-12 flex-col gap-0.5 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label="Excluir"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-[10px] font-semibold">Excluir</span>
        </Button>
      </div>
    </article>
  );
}


