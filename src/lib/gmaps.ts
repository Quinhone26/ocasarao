// Loader do Google Maps JS API — carrega uma única vez, compartilhado entre chamadas.
let loaderPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps só carrega no browser"));
  }
  if ((window as unknown as { google?: typeof google }).google?.maps) {
    return Promise.resolve((window as unknown as { google: typeof google }).google);
  }
  if (loaderPromise) return loaderPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
    | string
    | undefined;
  const channel = import.meta.env
    .VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  if (!key) {
    return Promise.reject(new Error("Chave do Google Maps não configurada"));
  }

  loaderPromise = new Promise((resolve, reject) => {
    const cbName = `__gmapsInit_${Math.random().toString(36).slice(2)}`;
    (window as unknown as Record<string, unknown>)[cbName] = () => {
      const g = (window as unknown as { google: typeof google }).google;
      delete (window as unknown as Record<string, unknown>)[cbName];
      resolve(g);
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key,
      loading: "async",
      callback: cbName,
      libraries: "geometry",
    });
    if (channel) params.set("channel", channel);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      loaderPromise = null;
      reject(new Error("Falha ao carregar Google Maps"));
    };
    document.head.appendChild(script);
  });
  return loaderPromise;
}

// Decodifica uma polyline codificada (algoritmo padrão do Google).
export function decodePolyline(str: string): Array<{ lat: number; lng: number }> {
  let index = 0;
  const len = str.length;
  let lat = 0;
  let lng = 0;
  const path: Array<{ lat: number; lng: number }> = [];
  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    path.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return path;
}
