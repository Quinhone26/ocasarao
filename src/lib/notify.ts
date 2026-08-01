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

/** Pede permissão de notificação (precisa de gesto do usuário em alguns browsers). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Notificação do sistema; ignora silenciosamente se não houver permissão. */
export function systemNotify(title: string, body: string, tag?: string) {
  if (!notificationsGranted()) return;
  try {
    new Notification(title, {
      body,
      tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });
  } catch {
    /* alguns browsers só permitem via service worker */
  }
}

/** Alerta completo de pedido novo: som + vibração + notificação. */
export function alertNewOrder(title: string, body: string, tag?: string) {
  playAlertSound();
  vibrate();
  systemNotify(title, body, tag);
}
