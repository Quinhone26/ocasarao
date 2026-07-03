/// <reference types="google.maps" />
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Route as RouteIcon, Navigation, Loader2, MapPin, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useDeliveries } from "@/lib/deliveries";
import type { Delivery } from "@/lib/deliveries";
import { optimizeRoute } from "@/lib/routes.functions";
import { loadGoogleMaps, decodePolyline } from "@/lib/gmaps";

function buildNavUrl(
  origin: { lat: number; lng: number },
  d: Delivery,
) {
  const dest =
    d.lat != null && d.lng != null
      ? `${d.lat},${d.lng}`
      : [
          `${d.endereco}${d.numero ? ", " + d.numero : ""}`,
          d.bairro,
          d.cidade,
        ]
          .filter(Boolean)
          .join(", ");
  return (
    `https://www.google.com/maps/dir/?api=1&travelmode=driving` +
    `&origin=${origin.lat},${origin.lng}` +
    `&destination=${encodeURIComponent(dest)}`
  );
}

export const Route = createFileRoute("/rota")({
  component: RotaPage,
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h2 className="text-lg font-semibold">Erro ao montar rota</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Erro inesperado"}
        </p>
        <Button onClick={reset} className="mt-4">Tentar novamente</Button>
      </div>
    </div>
  ),
});

type OptimizedStop = { delivery: Delivery; order: number };

function fmtDuration(iso: string) {
  const sec = parseInt(iso.replace("s", ""), 10) || 0;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}
function fmtKm(m: number) {
  return `${(m / 1000).toFixed(1)} km`;
}

function RotaPage() {
  const { items, update } = useDeliveries();
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [computing, setComputing] = useState(false);
  const [result, setResult] = useState<{
    stops: OptimizedStop[];
    distanceMeters: number;
    duration: string;
    polyline: string;
  } | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Array<google.maps.Marker | google.maps.Polyline>>([]);

  // Google chama esta função global quando a chave não é aceita no domínio atual.
  useEffect(() => {
    const w = window as unknown as { gm_authFailure?: () => void };
    w.gm_authFailure = () => setMapUnavailable(true);
    return () => {
      w.gm_authFailure = undefined;
    };
  }, []);

  // Entregas candidatas: pendentes ou em rota, com endereço.
  const candidates = useMemo(
    () =>
      items.filter(
        (d) =>
          (d.status === "pendente" || d.status === "em_rota") &&
          (d.endereco || (d.lat != null && d.lng != null)),
      ),
    [items],
  );

  // Paradas ainda ativas (remove entregues/canceladas do plano visível).
  const visibleStops = useMemo(() => {
    if (!result) return [];
    const active = new Set(
      items
        .filter((d) => d.status === "pendente" || d.status === "em_rota")
        .map((d) => d.id),
    );
    return result.stops
      .filter((s) => active.has(s.delivery.id))
      .map((s, i) => ({ ...s, order: i + 1 }));
  }, [result, items]);

  const getLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("GPS indisponível neste dispositivo");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        toast.error("Não foi possível obter sua localização", {
          description: err.message,
        });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  // Solicita GPS ao entrar.
  useEffect(() => {
    getLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildAndOptimize = async () => {
    if (!origin) {
      toast.error("Aguarde a localização");
      return;
    }
    if (candidates.length === 0) {
      toast.error("Nenhuma entrega pendente para roteirizar");
      return;
    }
    if (candidates.length > 23) {
      toast.error("Máximo de 23 paradas por rota");
      return;
    }
    setComputing(true);
    try {
      const stops = candidates.map((d) => ({
        id: d.id,
        lat: d.lat,
        lng: d.lng,
        address:
          [
            `${d.endereco}${d.numero ? ", " + d.numero : ""}`,
            d.bairro,
            d.cidade,
          ]
            .filter(Boolean)
            .join(", ") || d.endereco,
      }));
      const res = await optimizeRoute({ data: { origin, stops } });
      const orderedStops: OptimizedStop[] = res.order.map((idx, position) => ({
        delivery: candidates[idx],
        order: position + 1,
      }));
      setResult({
        stops: orderedStops,
        distanceMeters: res.distanceMeters,
        duration: res.duration,
        polyline: res.polyline,
      });
    } catch (err) {
      console.error(err);
      toast.error("Falha ao calcular rota", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setComputing(false);
    }
  };

  // Renderiza o mapa quando temos origem/candidatos, e desenha a rota quando disponível.
  useEffect(() => {
    if (mapUnavailable) return;
    if (!mapRef.current || !origin) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapRef.current) return;
        if (!mapInstance.current) {
          mapInstance.current = new g.maps.Map(mapRef.current, {
            center: origin,
            zoom: 13,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "greedy",
          });
        }
        // limpa overlays
        for (const o of overlaysRef.current) o.setMap(null);
        overlaysRef.current = [];

        // marker da origem
        overlaysRef.current.push(
          new g.maps.Marker({
            position: origin,
            map: mapInstance.current,
            label: { text: "V", color: "#fff", fontWeight: "bold" },
            title: "Você",
          }),
        );

        const bounds = new g.maps.LatLngBounds();
        bounds.extend(origin);

        const list = result ? visibleStops.map((s) => s.delivery) : candidates;
        list.forEach((d, i) => {
          if (d.lat == null || d.lng == null) return;
          const pos = { lat: d.lat, lng: d.lng };
          overlaysRef.current.push(
            new g.maps.Marker({
              position: pos,
              map: mapInstance.current!,
              label: {
                text: String(i + 1),
                color: "#fff",
                fontWeight: "bold",
              },
              title: d.cliente,
            }),
          );
          bounds.extend(pos);
        });

        if (result?.polyline) {
          const path = decodePolyline(result.polyline);
          const line = new g.maps.Polyline({
            path,
            geodesic: true,
            strokeColor: "#2563eb",
            strokeOpacity: 0.9,
            strokeWeight: 5,
            map: mapInstance.current,
          });
          overlaysRef.current.push(line);
          for (const p of path) bounds.extend(p);
        }

        if (!bounds.isEmpty()) {
          mapInstance.current.fitBounds(bounds, 60);
        }
      })
      .catch((err) => {
        console.error(err);
        toast.error("Falha ao carregar o mapa", {
          description: err instanceof Error ? err.message : undefined,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [origin, candidates, result, visibleStops]);


  const markDelivered = async (d: Delivery) => {
    try {
      await update(d.id, { status: "entregue" });
      toast.success(`${d.cliente} marcada como entregue`);
      // Próxima parada ativa após esta.
      const remaining = visibleStops.filter((s) => s.delivery.id !== d.id);
      const next = remaining[0];
      if (next && origin) {
        window.open(buildNavUrl(origin, next.delivery), "_blank", "noopener");
      } else if (!next) {
        toast.success("Todas as entregas concluídas 🎉");
      }
    } catch {
      toast.error("Falha ao marcar entrega");
    }
  };

  // Abre navegação no Google Maps já com todas as paradas em ordem.
  const startNavigation = () => {
    if (!result || !origin) return;
    const stops = visibleStops.length > 0 ? visibleStops : result.stops;
    const waypoints = stops
      .slice(0, -1)
      .map((s) => {
        const d = s.delivery;
        if (d.lat != null && d.lng != null) return `${d.lat},${d.lng}`;
        return [
          `${d.endereco}${d.numero ? ", " + d.numero : ""}`,
          d.bairro,
          d.cidade,
        ]
          .filter(Boolean)
          .join(", ");
      })
      .map(encodeURIComponent)
      .join("|");
    const last = stops[stops.length - 1].delivery;
    const dest =
      last.lat != null && last.lng != null
        ? `${last.lat},${last.lng}`
        : [
            `${last.endereco}${last.numero ? ", " + last.numero : ""}`,
            last.bairro,
            last.cidade,
          ]
            .filter(Boolean)
            .join(", ");
    const url =
      `https://www.google.com/maps/dir/?api=1&travelmode=driving` +
      `&origin=${origin.lat},${origin.lng}` +
      `&destination=${encodeURIComponent(dest)}` +
      (waypoints ? `&waypoints=${waypoints}` : "");
    window.open(url, "_blank", "noopener");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-20 bg-primary text-primary-foreground px-4 pt-6 pb-4 shadow-elevated flex items-center gap-3">
        <Link
          to="/"
          className="grid place-items-center w-10 h-10 rounded-xl bg-primary-foreground/10 hover:bg-primary-foreground/20"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">Melhor rota</h1>
          <p className="text-xs text-primary-foreground/70">
            {candidates.length} entrega(s) para roteirizar
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-xl px-4 pt-4 space-y-3">
        {mapUnavailable ? (
          <div className="w-full rounded-2xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground flex items-start gap-3">
            <MapPin className="w-5 h-5 mt-0.5 shrink-0" />
            <p>
              Mapa indisponível neste domínio, mas o cálculo da rota funciona
              normalmente — use a lista abaixo e o botão <strong>Iniciar</strong>{" "}
              para abrir a navegação no Google Maps.
            </p>
          </div>
        ) : (
          <div
            ref={mapRef}
            className="w-full h-72 rounded-2xl border border-border bg-muted overflow-hidden"
          >
            {!origin && (
              <div className="h-full grid place-items-center text-sm text-muted-foreground gap-2">
                {locating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Obtendo localização…
                  </>
                ) : (
                  <Button variant="outline" onClick={getLocation}>
                    <MapPin className="w-4 h-4" /> Permitir localização
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        <Button
          onClick={buildAndOptimize}
          disabled={computing || !origin || candidates.length === 0}
          className="w-full h-12 rounded-xl"
        >
          {computing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Calculando…
            </>
          ) : (
            <>
              <RouteIcon className="w-5 h-5" /> Calcular melhor rota
            </>
          )}
        </Button>

        {result && (
          <>
            <div className="rounded-2xl bg-card border border-border p-4 flex items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Distância total</p>
                <p className="text-lg font-bold">{fmtKm(result.distanceMeters)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tempo estimado</p>
                <p className="text-lg font-bold">{fmtDuration(result.duration)}</p>
              </div>
              <Button
                onClick={startNavigation}
                className="ml-auto h-11 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Navigation className="w-4 h-4" /> Iniciar
              </Button>
            </div>

            <ol className="space-y-2 pb-8">
              {visibleStops.length === 0 && (
                <li className="text-center text-sm text-muted-foreground py-6">
                  Todas as paradas foram concluídas.
                </li>
              )}
              {visibleStops.map((s, i) => (
                <li
                  key={s.delivery.id}
                  className="flex items-start gap-3 rounded-xl bg-card border border-border p-3"
                >
                  <div className="grid place-items-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                    {s.order}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{s.delivery.cliente}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[
                        `${s.delivery.endereco}${s.delivery.numero ? ", " + s.delivery.numero : ""}`,
                        s.delivery.bairro,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => markDelivered(s.delivery)}
                    className="h-9 rounded-lg bg-status-delivered text-status-delivered-foreground hover:bg-status-delivered/90 shrink-0"
                    aria-label="Marcar como entregue"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {i === 0 ? "Entregue" : ""}
                  </Button>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
