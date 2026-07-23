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
    pendente: "Seu pedido está a caminho 🛵",
    em_rota: "Seu pedido está a caminho 🛵",
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

  const companyOrigin = useMemo(() => {
    if (!track || track.origem_lat == null || track.origem_lng == null) return null;
    return { lat: track.origem_lat, lng: track.origem_lng };
  }, [track]);

  // A origem preferida é a posição ao vivo do entregador; se não houver, usa o
  // endereço da empresa para desenhar a rota até o cliente.
  const routeOrigin = useMemo(() => {
    if (driver) return { lat: driver.lat, lng: driver.lng };
    if (companyOrigin) return companyOrigin;
    return null;
  }, [driver, companyOrigin]);

  // Renderiza / atualiza o mapa com pino do destino, do entregador e da rota.
  useEffect(() => {
    if (mapUnavailable || !mapRef.current) return;
    // Precisa de ao menos um ponto para inicializar o mapa.
    const center = destination ?? routeOrigin ?? companyOrigin;
    if (!center) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapRef.current) return;
        if (!mapInstance.current) {
          mapInstance.current = new g.maps.Map(mapRef.current, {
            center,
            zoom: 15,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "greedy",
          });
        }
        if (destination) {
          if (!destMarker.current) {
            destMarker.current = new g.maps.Marker({
              position: destination,
              map: mapInstance.current,
              label: { text: "📍", color: "#fff" },
              title: "Endereço da entrega",
            });
          } else {
            destMarker.current.setPosition(destination);
            destMarker.current.setMap(mapInstance.current);
          }
        } else if (destMarker.current) {
          destMarker.current.setMap(null);
        }

        // Marcador da empresa (visível apenas quando não há GPS ao vivo).
        if (companyOrigin && !driver) {
          if (!originMarker.current) {
            originMarker.current = new g.maps.Marker({
              position: companyOrigin,
              map: mapInstance.current,
              label: { text: "🏠", color: "#fff" },
              title: track?.empresa || "Origem",
            });
          } else {
            originMarker.current.setPosition(companyOrigin);
            originMarker.current.setMap(mapInstance.current);
          }
        } else if (originMarker.current) {
          originMarker.current.setMap(null);
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
        } else if (driverMarker.current) {
          driverMarker.current.setMap(null);
          driverMarker.current = null;
        }

        // Desenha rota (empresa/entregador → destino) enquanto a entrega
        // estiver em andamento e ambos os pontos existirem.
        const active = track?.status !== "entregue" && track?.status !== "cancelada";
        if (routeOrigin && destination && active) {
          if (!directionsService.current) {
            directionsService.current = new g.maps.DirectionsService();
          }
          if (!directionsRenderer.current) {
            directionsRenderer.current = new g.maps.DirectionsRenderer({
              map: mapInstance.current,
              suppressMarkers: true,
              preserveViewport: true,
              polylineOptions: {
                strokeColor: "#2563eb",
                strokeOpacity: 0.9,
                strokeWeight: 5,
              },
            });
          } else {
            directionsRenderer.current.setMap(mapInstance.current);
          }
          directionsService.current.route(
            {
              origin: routeOrigin,
              destination,
              travelMode: g.maps.TravelMode.DRIVING,
            },
            (result, status) => {
              if (cancelled) return;
              const bounds = new g.maps.LatLngBounds();
              bounds.extend(destination);
              bounds.extend(routeOrigin);
              if (status === g.maps.DirectionsStatus.OK && result) {
                directionsRenderer.current?.setDirections(result);
              }
              mapInstance.current?.fitBounds(bounds, 80);
            },
          );
        } else {
          if (directionsRenderer.current) directionsRenderer.current.setMap(null);
          // Ajusta o enquadramento aos pontos disponíveis.
          const bounds = new g.maps.LatLngBounds();
          let count = 0;
          if (destination) { bounds.extend(destination); count++; }
          if (driver) { bounds.extend({ lat: driver.lat, lng: driver.lng }); count++; }
          if (!driver && companyOrigin) { bounds.extend(companyOrigin); count++; }
          if (count > 1) mapInstance.current.fitBounds(bounds, 80);
          else mapInstance.current.setCenter(center);
        }
      })
      .catch(() => setMapUnavailable(true));
    return () => {
      cancelled = true;
    };
  }, [destination, driver, companyOrigin, routeOrigin, track?.status, track?.empresa, mapUnavailable]);



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
        ) : !destination && !companyOrigin && !driver ? (
          <div className="w-full h-80 rounded-2xl border border-border bg-muted/50 grid place-items-center text-center px-6">
            <div className="space-y-2">
              <MapPin className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Aguardando localização da entrega…
              </p>
              <p className="text-xs text-muted-foreground/80">
                O mapa aparece assim que a rota for calculada ou o entregador ligar o GPS.
              </p>
            </div>
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

        {track.status === "em_rota" && !driver && companyOrigin && (
          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Rota traçada a partir de {track.empresa || "nossa loja"} até seu endereço.
          </div>
        )}

        {track.status === "em_rota" && !driver && !companyOrigin && (
          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Aguardando o entregador ligar o GPS…
          </div>
        )}

        {isDone && (
          <div className="rounded-2xl border border-status-delivered/30 bg-status-delivered/10 p-4 text-sm">
            Sua entrega foi concluída. Bom apetite! 🙌
          </div>
        )}

      </main>
    </div>
  );
}
