/// <reference types="google.maps" />
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Loader2, Navigation, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchPublicTrack,
  fetchDriverLocation,
  subscribeDriverLocation,
  type PublicTrack,
  type DriverLocation,
} from "@/lib/tracking";
import { loadGoogleMaps } from "@/lib/gmaps";

export const Route = createFileRoute("/r/$code")({
  component: TrackPage,
  head: ({ params }) => ({
    meta: [
      { title: `Rastrear entrega · ${params.code}` },
      {
        name: "description",
        content: "Acompanhe seu entregador em tempo real.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Rastrear entrega" },
      {
        property: "og:description",
        content: "Acompanhe seu entregador em tempo real.",
      },
    ],
  }),
});

function statusLabel(s: PublicTrack["status"]): string {
  return {
    pendente: "Aguardando saída",
    em_rota: "A caminho 🛵",
    entregue: "Entregue",
    cancelada: "Cancelada",
  }[s];
}

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function TrackPage() {
  const { code } = Route.useParams();
  const [track, setTrack] = useState<PublicTrack | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [driver, setDriver] = useState<DriverLocation | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const driverMarker = useRef<google.maps.Marker | null>(null);
  const destMarker = useRef<google.maps.Marker | null>(null);
  const originMarker = useRef<google.maps.Marker | null>(null);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const directionsService = useRef<google.maps.DirectionsService | null>(null);

  useEffect(() => {
    const w = window as unknown as { gm_authFailure?: () => void };
    w.gm_authFailure = () => setMapUnavailable(true);
    return () => {
      w.gm_authFailure = undefined;
    };
  }, []);

  // Busca dados iniciais + posição atual + assinatura realtime.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [t, loc] = await Promise.all([
        fetchPublicTrack(code),
        fetchDriverLocation(),
      ]);
      if (cancelled) return;
      if (!t) {
        setNotFound(true);
      } else {
        setTrack(t);
        setDriver(loc);
      }
      setLoading(false);
    })();
    const unsub = subscribeDriverLocation((loc) => setDriver(loc));
    return () => {
      cancelled = true;
      unsub();
    };
  }, [code]);

  const destination = useMemo(() => {
    if (!track || track.lat == null || track.lng == null) return null;
    return { lat: track.lat, lng: track.lng };
  }, [track]);

  // Renderiza / atualiza o mapa com pino do destino e do entregador.
  useEffect(() => {
    if (mapUnavailable || !mapRef.current || !destination) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapRef.current) return;
        if (!mapInstance.current) {
          mapInstance.current = new g.maps.Map(mapRef.current, {
            center: destination,
            zoom: 15,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "greedy",
          });
        }
        if (!destMarker.current) {
          destMarker.current = new g.maps.Marker({
            position: destination,
            map: mapInstance.current,
            label: { text: "📍", color: "#fff" },
            title: "Endereço da entrega",
          });
        }
        const driverPos = driver ? { lat: driver.lat, lng: driver.lng } : null;
        if (driverPos) {
          if (!driverMarker.current) {
            driverMarker.current = new g.maps.Marker({
              position: driverPos,
              map: mapInstance.current,
              label: { text: "🛵", color: "#fff" },
              title: "Entregador",
            });
          } else {
            driverMarker.current.setPosition(driverPos);
          }
          const bounds = new g.maps.LatLngBounds();
          bounds.extend(destination);
          bounds.extend(driverPos);
          mapInstance.current.fitBounds(bounds, 80);
        } else {
          mapInstance.current.setCenter(destination);
        }
      })
      .catch(() => setMapUnavailable(true));
    return () => {
      cancelled = true;
    };
  }, [destination, driver, mapUnavailable]);

  const openInMaps = () => {
    if (!destination) return;
    const dest = `${destination.lat},${destination.lng}`;
    const origin = driver ? `${driver.lat},${driver.lng}` : "";
    const url =
      `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${dest}` +
      (origin ? `&origin=${origin}` : "");
    window.open(url, "_blank", "noopener");
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !track) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6 text-center">
        <div>
          <MapPin className="w-10 h-10 mx-auto text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">Link inválido</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Este código de rastreio não existe ou expirou.
          </p>
        </div>
      </div>
    );
  }

  const enderecoTxt = [
    `${track.endereco}${track.numero ? ", " + track.numero : ""}`,
    track.bairro,
    track.cidade,
  ]
    .filter(Boolean)
    .join(" · ");

  const isDone = track.status === "entregue";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-primary text-primary-foreground px-4 pt-6 pb-4 shadow-elevated">
        <p className="text-xs opacity-80">
          {track.empresa || "Sua entrega"}
        </p>
        <h1 className="text-lg font-bold">
          Olá {track.cliente || "cliente"}!
        </h1>
        <p className="text-sm mt-1 flex items-center gap-2">
          {isDone ? (
            <>
              <CheckCircle2 className="w-4 h-4" /> {statusLabel(track.status)}
            </>
          ) : (
            statusLabel(track.status)
          )}
        </p>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 pt-4 pb-8 space-y-3">
        {mapUnavailable ? (
          <div className="rounded-2xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
            Mapa indisponível neste dispositivo. Toque em "Abrir no Google Maps"
            para ver a rota atualizada.
          </div>
        ) : (
          <div
            ref={mapRef}
            className="w-full h-80 rounded-2xl border border-border bg-muted overflow-hidden"
          />
        )}

        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Endereço da entrega
          </p>
          <p className="text-sm font-medium">{enderecoTxt}</p>
        </div>

        {track.status === "em_rota" && driver && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <p className="font-medium text-primary">🛵 Entregador a caminho</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Última atualização: {fmtTime(driver.updated_at)}
            </p>
          </div>
        )}

        {track.status === "em_rota" && !driver && (
          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Aguardando o entregador ligar o GPS…
          </div>
        )}

        {isDone && (
          <div className="rounded-2xl border border-status-delivered/30 bg-status-delivered/10 p-4 text-sm">
            Sua entrega foi concluída. Bom apetite! 🙌
          </div>
        )}

        <Button
          onClick={openInMaps}
          disabled={!destination}
          variant="outline"
          className="w-full h-11 rounded-xl"
        >
          <Navigation className="w-4 h-4" />
          Abrir no Google Maps
        </Button>
      </main>
    </div>
  );
}
