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

type GeocodeDiag = {
  query: string;
  status: string;
  httpStatus: number;
  resultsCount: number;
  matchType: "exact" | "partial" | "none";
  chosen?: {
    formattedAddress?: string;
    placeId?: string;
    locationType?: string;
    partialMatch?: boolean;
    types?: string[];
    location?: LatLng;
  };
  error?: string;
};

async function geocode(
  address: string,
  key: string,
  lovableKey: string,
  { allowPartial = true }: { allowPartial?: boolean } = {},
): Promise<{ location: LatLng | null; diag: GeocodeDiag }> {
  const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?address=${encodeURIComponent(
    address,
  )}&region=br&components=country:BR`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": key,
    },
  });
  const diag: GeocodeDiag = {
    query: address,
    status: "UNKNOWN",
    httpStatus: res.status,
    resultsCount: 0,
    matchType: "none",
  };
  if (!res.ok) {
    diag.error = (await res.text()).slice(0, 200);
    return { location: null, diag };
  }
  const json = (await res.json()) as {
    status?: string;
    error_message?: string;
    results?: Array<{
      formatted_address?: string;
      place_id?: string;
      geometry?: {
        location?: { lat: number; lng: number };
        location_type?: string;
      };
      partial_match?: boolean;
      types?: string[];
    }>;
  };
  diag.status = json.status ?? "UNKNOWN";
  if (json.error_message) diag.error = json.error_message;
  diag.resultsCount = json.results?.length ?? 0;
  if (json.status !== "OK" || !json.results?.length) {
    return { location: null, diag };
  }
  const exact = json.results.find((r) => !r.partial_match);
  const chosen = exact ?? (allowPartial ? json.results[0] : null);
  if (!chosen) {
    diag.matchType = "none";
    return { location: null, diag };
  }
  diag.matchType = chosen.partial_match ? "partial" : "exact";
  diag.chosen = {
    formattedAddress: chosen.formatted_address,
    placeId: chosen.place_id,
    locationType: chosen.geometry?.location_type,
    partialMatch: chosen.partial_match,
    types: chosen.types,
    location: chosen.geometry?.location,
  };
  return { location: chosen.geometry?.location ?? null, diag };
}

// Fallback via OpenStreetMap Nominatim — usado quando o Google não localiza
// nem pelo CEP nem pela rua. Nominatim tem cobertura boa de ruas novas no BR
// e não depende da chave do Google.
async function geocodeOSM(
  address: string,
): Promise<{ location: LatLng | null; diag: Record<string, unknown> }> {
  const diag: Record<string, unknown> = { query: address, provider: "osm" };
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&addressdetails=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ocasarao-delivery/1.0 (contact via app)",
        "Accept-Language": "pt-BR",
      },
    });
    diag.httpStatus = res.status;
    if (!res.ok) return { location: null, diag };
    const arr = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name?: string;
      type?: string;
      class?: string;
      importance?: number;
    }>;
    diag.resultsCount = arr?.length ?? 0;
    const first = arr?.[0];
    if (!first) return { location: null, diag };
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return { location: null, diag };
    diag.chosen = {
      displayName: first.display_name,
      type: first.type,
      class: first.class,
      importance: first.importance,
      location: { lat, lng },
    };
    return { location: { lat, lng }, diag };
  } catch (err) {
    diag.error = err instanceof Error ? err.message : String(err);
    return { location: null, diag };
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

    const resolved = await Promise.all(
      data.stops.map(async (s) => {
        const who = s.label || s.id;
        const attempts: Array<{
          strategy: string;
          diag: GeocodeDiag | Record<string, unknown>;
        }> = [];
        const log = (msg: string, extra?: unknown) =>
          console.log(`[optimizeRoute] ${who} | ${msg}`, extra ?? "");

        if (s.lat != null && s.lng != null) {
          log("usando coordenadas salvas (source=input)", {
            lat: s.lat,
            lng: s.lng,
          });
          return {
            id: s.id,
            latLng: { lat: s.lat, lng: s.lng },
            source: "input" as const,
            attempts,
          };
        }

        // 1º: endereço completo (rua+número+bairro+cidade+CEP)
        const addrRes = await geocode(
          s.address,
          GOOGLE_MAPS_API_KEY,
          LOVABLE_API_KEY,
        );
        attempts.push({ strategy: "google:address", diag: addrRes.diag });
        log(
          `google:address status=${addrRes.diag.status} match=${addrRes.diag.matchType} results=${addrRes.diag.resultsCount}`,
          {
            query: addrRes.diag.query,
            chosen: addrRes.diag.chosen,
            error: addrRes.diag.error,
          },
        );
        if (addrRes.location) {
          return {
            id: s.id,
            latLng: addrRes.location,
            source: "address" as const,
            attempts,
          };
        }

        // 2º: CEP puro
        if (s.cep) {
          const cepQuery = [s.cep, s.cidade || "Umuarama", "PR", "Brasil"]
            .filter(Boolean)
            .join(", ");
          const cepRes = await geocode(
            cepQuery,
            GOOGLE_MAPS_API_KEY,
            LOVABLE_API_KEY,
          );
          attempts.push({ strategy: "google:cep", diag: cepRes.diag });
          log(
            `google:cep status=${cepRes.diag.status} match=${cepRes.diag.matchType} results=${cepRes.diag.resultsCount}`,
            {
              query: cepRes.diag.query,
              chosen: cepRes.diag.chosen,
              error: cepRes.diag.error,
            },
          );
          if (cepRes.location) {
            return {
              id: s.id,
              latLng: cepRes.location,
              source: "cep" as const,
              attempts,
            };
          }
        }

        // 3º: OpenStreetMap
        const osmRes = await geocodeOSM(s.address);
        attempts.push({ strategy: "osm", diag: osmRes.diag });
        log("osm", osmRes.diag);
        if (osmRes.location) {
          return {
            id: s.id,
            latLng: osmRes.location,
            source: "osm" as const,
            attempts,
          };
        }

        log("FALHA — nenhum geocoder localizou o endereço");
        return {
          id: s.id,
          latLng: null,
          source: "failed" as const,
          attempts,
        };
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
