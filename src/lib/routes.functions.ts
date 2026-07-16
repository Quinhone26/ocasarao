import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const stopSchema = z.object({
  id: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  address: z.string().min(1),
  cep: z.string().default(""),
  cidade: z.string().default(""),
  label: z.string().default(""),
});

const inputSchema = z.object({
  origin: z.object({ lat: z.number(), lng: z.number() }),
  stops: z.array(stopSchema).min(1).max(23),
});

type LatLng = { lat: number; lng: number };

async function geocode(
  address: string,
  key: string,
  lovableKey: string,
  { allowPartial = true }: { allowPartial?: boolean } = {},
): Promise<LatLng | null> {
  const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?address=${encodeURIComponent(
    address,
  )}&region=br&components=country:BR`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": key,
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    status?: string;
    results?: Array<{
      geometry?: { location?: { lat: number; lng: number } };
      partial_match?: boolean;
    }>;
  };
  if (json.status !== "OK" || !json.results?.length) return null;
  // Prefere match exato; se só houver partial_match, aceita mesmo assim
  // (CEP costuma retornar partial_match por cobrir trecho de rua).
  const exact = json.results.find((r) => !r.partial_match);
  const chosen = exact ?? (allowPartial ? json.results[0] : null);
  return chosen?.geometry?.location ?? null;
}

// Fallback via OpenStreetMap Nominatim — usado quando o Google não localiza
// nem pelo CEP nem pela rua. Nominatim tem cobertura boa de ruas novas no BR
// e não depende da chave do Google.
async function geocodeOSM(address: string): Promise<LatLng | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: {
        // Nominatim exige User-Agent identificando a aplicação.
        "User-Agent": "ocasarao-delivery/1.0 (contact via app)",
        "Accept-Language": "pt-BR",
      },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
    const first = arr?.[0];
    if (!first) return null;
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export const optimizeRoute = createServerFn({ method: "POST" })
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps não configurado");
    }

    // Geocodifica cada parada priorizando o CEP (cidade+UF), pois nomes de
    // rua mudam mas o CEP permanece estável. Se o CEP falhar ou não existir,
    // cai para rua+número como fallback.
    const resolved = await Promise.all(
      data.stops.map(async (s) => {
        if (s.lat != null && s.lng != null) {
          return { id: s.id, latLng: { lat: s.lat, lng: s.lng }, source: "input" as const };
        }
        // 1º: endereço completo (rua+número+bairro+cidade+CEP) — mais preciso.
        const byAddr = await geocode(s.address, GOOGLE_MAPS_API_KEY, LOVABLE_API_KEY);
        if (byAddr) {
          return { id: s.id, latLng: byAddr, source: "address" as const };
        }
        // 2º: CEP puro — cai no centro da área do CEP, útil quando a rua
        // não é reconhecida pelo Google.
        if (s.cep) {
          const cepQuery = [s.cep, s.cidade || "Umuarama", "PR", "Brasil"]
            .filter(Boolean)
            .join(", ");
          const byCep = await geocode(cepQuery, GOOGLE_MAPS_API_KEY, LOVABLE_API_KEY);
          if (byCep) {
            return { id: s.id, latLng: byCep, source: "cep" as const };
          }
        }
        // 3º: OpenStreetMap — cobre ruas novas que o Google não tem.
        const osm = await geocodeOSM(s.address);
        if (osm) {
          return { id: s.id, latLng: osm, source: "osm" as const };
        }
        return { id: s.id, latLng: null, source: "failed" as const };
      }),
    );

    const failedIds = new Set(resolved.filter((r) => !r.latLng).map((r) => r.id));
    if (failedIds.size) {
      const details = data.stops
        .filter((s) => failedIds.has(s.id))
        .map((s) => {
          const who = s.label ? `${s.label} — ` : "";
          const cep = s.cep ? ` (CEP ${s.cep})` : "";
          return `• ${who}${s.address}${cep}`;
        })
        .join("\n");
      throw new Error(
        `Não foi possível localizar ${failedIds.size} endereço(s):\n${details}\nConfira rua/número/CEP.`,
      );
    }

    const lastIdx = resolved.length - 1;
    const body = {
      origin: {
        location: {
          latLng: { latitude: data.origin.lat, longitude: data.origin.lng },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: resolved[lastIdx].latLng!.lat,
            longitude: resolved[lastIdx].latLng!.lng,
          },
        },
      },
      intermediates: resolved.slice(0, lastIdx).map((r) => ({
        location: {
          latLng: { latitude: r.latLng!.lat, longitude: r.latLng!.lng },
        },
      })),
      travelMode: "DRIVE",
      optimizeWaypointOrder: true,
      routingPreference: "TRAFFIC_AWARE",
    };

    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Routes API ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      routes?: Array<{
        optimizedIntermediateWaypointIndex?: number[];
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
      }>;
    };
    const route = json.routes?.[0];
    if (!route) throw new Error("Nenhuma rota encontrada");

    const intermediates =
      route.optimizedIntermediateWaypointIndex ??
      resolved.slice(0, lastIdx).map((_, i) => i);
    const order = [...intermediates, lastIdx];

    return {
      order,
      distanceMeters: route.distanceMeters ?? 0,
      duration: route.duration ?? "0s",
      polyline: route.polyline?.encodedPolyline ?? "",
      // Coordenadas resolvidas por parada — o cliente pode persistir/exibir.
      resolved: resolved.map((r) => ({
        id: r.id,
        lat: r.latLng!.lat,
        lng: r.latLng!.lng,
        source: r.source,
      })),
    };
  });
