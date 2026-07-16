/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { loadGoogleMaps } from "@/lib/gmaps";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: { lat: number; lng: number } | null;
  title: string;
  addressLabel?: string;
  onSave: (coords: { lat: number; lng: number }) => Promise<void> | void;
}

export function PinAdjustDialog({
  open,
  onOpenChange,
  initial,
  title,
  addressLabel,
  onSave,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial,
  );
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) setCoords(initial);
  }, [open, initial]);

  useEffect(() => {
    if (!open) {
      // reset ao fechar para forçar recriação na próxima abertura
      mapInstance.current = null;
      markerRef.current = null;
      return;
    }
    if (!initial) return;
    let cancelled = false;
    setLoading(true);
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapRef.current) return;
        const map = new g.maps.Map(mapRef.current, {
          center: initial,
          zoom: 17,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        const marker = new g.maps.Marker({
          position: initial,
          map,
          draggable: true,
          title: "Arraste para ajustar",
        });
        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          if (p) setCoords({ lat: p.lat(), lng: p.lng() });
        });
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          marker.setPosition(e.latLng);
          setCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
        mapInstance.current = map;
        markerRef.current = marker;
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Falha ao carregar o mapa", {
          description: err instanceof Error ? err.message : undefined,
        });
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, initial]);

  const handleSave = async () => {
    if (!coords) return;
    setSaving(true);
    try {
      await onSave(coords);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao salvar pino");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Ajustar pino — {title}
          </DialogTitle>
          <DialogDescription>
            {addressLabel ? (
              <span className="block truncate">{addressLabel}</span>
            ) : null}
            Arraste o marcador ou toque no mapa para posicionar o endereço
            corretamente.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full h-80 rounded-xl overflow-hidden border border-border bg-muted">
          <div ref={mapRef} className="absolute inset-0" />
          {loading && (
            <div className="absolute inset-0 grid place-items-center bg-background/60">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          {!initial && !loading && (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground p-4 text-center">
              Sem coordenadas iniciais para esta entrega. Calcule a rota
              primeiro para posicionar o pino.
            </div>
          )}
        </div>

        {coords && (
          <p className="text-xs text-muted-foreground text-center">
            {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!coords || saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Salvando…
              </>
            ) : (
              "Salvar pino"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
