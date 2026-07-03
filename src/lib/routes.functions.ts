import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const stopSchema = z.object({
  id: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  address: z.string().min(1),
});

const inputSchema = z.object({
  origin: z.object({ lat: z.number(), lng: z.number() }),
  stops: z.array(stopSchema).min(1).max(23),
});

type Waypoint =
  | { location: { latLng: { latitude: number; longitude: number } } }
  | { address: string };

function toWaypoint(s: z.infer<typeof stopSchema>): Waypoint {
  if (s.lat != null && s.lng != null) {
    return { location: { latLng: { latitude: s.lat, longitude: s.lng } } };
  }
  return { address: s.address };
}

export const optimizeRoute = createServerFn({ method: "POST" })
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps não configurado");
    }

    const stops = data.stops;
    const lastIdx = stops.length - 1;
    const body = {
      origin: {
        location: {
          latLng: { latitude: data.origin.lat, longitude: data.origin.lng },
        },
      },
      destination: toWaypoint(stops[lastIdx]),
      intermediates: stops.slice(0, lastIdx).map(toWaypoint),
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
      stops.slice(0, lastIdx).map((_, i) => i);
    // ordem final: intermediários otimizados + destino no fim
    const order = [...intermediates, lastIdx];

    return {
      order,
      distanceMeters: route.distanceMeters ?? 0,
      duration: route.duration ?? "0s",
      polyline: route.polyline?.encodedPolyline ?? "",
    };
  });
