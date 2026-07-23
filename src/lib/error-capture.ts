// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

// "ResizeObserver loop completed with undelivered notifications" e
// "ResizeObserver loop limit exceeded" são avisos benignos do Chromium
// (disparados por libs como Radix/Recharts quando um observer causa um
// segundo layout no mesmo frame). Silenciamos para não poluir o overlay
// de erros do preview — nunca representam falha real.
function isBenignResizeObserverError(message: unknown): boolean {
  return typeof message === "string" && message.includes("ResizeObserver loop");
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => {
    const e = event as ErrorEvent;
    if (isBenignResizeObserverError(e.message)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    record(e.error ?? event);
  });
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
