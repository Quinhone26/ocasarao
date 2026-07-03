import type { DeliveryStatus } from "@/lib/deliveries";
import { statusLabel } from "@/lib/deliveries";
import { cn } from "@/lib/utils";

const styles: Record<DeliveryStatus, string> = {
  pendente: "bg-status-pending text-status-pending-foreground",
  em_rota: "bg-status-route text-status-route-foreground",
  entregue: "bg-status-delivered text-status-delivered-foreground",
  cancelada: "bg-status-cancelled text-status-cancelled-foreground",
};

export function StatusBadge({ status, className }: { status: DeliveryStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        styles[status],
        className,
      )}
    >
      {statusLabel[status]}
    </span>
  );
}
