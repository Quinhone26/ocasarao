/**
 * Alertas do app: som curto + notificação do sistema (quando permitido).
 * Usado para avisar sobre pedido novo (online ou cadastrado no painel).
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/** Bipe duplo (WebAudio — não depende de arquivo de áudio). */
export function playAlertSound() {
  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume?.().catch(() => {});
  const now = ctx.currentTime;
  [0, 0.22].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = i === 0 ? 880 : 1180;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.2);
  });
}

export function vibrate(pattern: number | number[] = [120, 60, 120]) {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sem suporte */
  }
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationsGranted() {
  return notificationsSupported() && Notification.permission === "granted";
}

/** Registra o worker de notificações (necessário no Android/Chrome mobile). */
async function getNotifyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/notify-sw.js");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/notify-sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/** Pede permissão de notificação (precisa de gesto do usuário em alguns browsers). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "denied") return false;
  if (Notification.permission === "granted") {
    void getNotifyRegistration();
    return true;
  }
  try {
    const ok = (await Notification.requestPermission()) === "granted";
    if (ok) await getNotifyRegistration();
    return ok;
  } catch {
    return false;
  }
}

/** Notificação do sistema; usa service worker no mobile e cai para Notification no desktop. */
export async function systemNotify(title: string, body: string, tag?: string) {
  if (!notificationsGranted()) return;
  const options: NotificationOptions = {
    body,
    tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: "/" },
  };
  const reg = await getNotifyRegistration();
  if (reg) {
    try {
      await reg.showNotification(title, { ...options, requireInteraction: true } as NotificationOptions);
      return;
    } catch {
      /* tenta o fallback abaixo */
    }
  }
  try {
    new Notification(title, options);
  } catch {
    /* mobile sem service worker: só som/vibração */
  }
}

/** Alerta completo de pedido novo: som + vibração + notificação. */
export function alertNewOrder(title: string, body: string, tag?: string) {
  playAlertSound();
  vibrate();
  void systemNotify(title, body, tag);
}

