import { useEffect } from "react";
import { publishDriverLocation } from "@/lib/tracking";
import type { Delivery } from "@/lib/deliveries";

/**
 * Transmite a posição do entregador (GPS) enquanto houver ao menos uma
 * entrega com status "em_rota". Roda em qualquer tela do app — assim o
 * cliente vê o motoboy se movendo no link de rastreio mesmo se o
 * entregador não estiver com a página /rota aberta.
 */
export function useDriverBroadcast(items: Delivery[]) {
  const hasEmRota = items.some((d) => d.status === "em_rota");

  useEffect(() => {
    if (!hasEmRota) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        void publishDriverLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        });
      },
      (err) => {
        console.warn("[driver-broadcast] watchPosition:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [hasEmRota]);
}
