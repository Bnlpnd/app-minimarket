"use client";

/**
 * Toast / banner de feedback estandar para todo el sistema.
 *
 * Comportamiento:
 *   - Desktop (sm+): aparece como banner inline (donde lo pongas).
 *   - Mobile: ademas se muestra como toast flotante fijo arriba.
 *   - Auto-dismiss para success (default 4s); error persiste hasta
 *     que el usuario lo cierre con la X (para no perder informacion
 *     importante).
 *
 * Uso:
 *   const [msg, setMsg] = useState<{type, text} | null>(null);
 *   ...
 *   <Toast message={msg} onDismiss={() => setMsg(null)} />
 *
 * Despues de un guardar exitoso, setMsg({type: "success", text: "..."}).
 * El componente se ocupa de mostrarse y auto-cerrarse.
 */

import { useEffect } from "react";

export type ToastMessage = {
  type: "success" | "error" | "warning" | "info";
  text: string;
};

type Props = {
  message: ToastMessage | null;
  onDismiss: () => void;
  /** Auto-dismiss en ms para success/info. 0 = no auto-dismiss. */
  autoDismissMs?: number;
};

const STYLES_INLINE: Record<ToastMessage["type"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

const STYLES_FLOATING: Record<ToastMessage["type"], string> = {
  success: "bg-emerald-600 text-white border-emerald-700",
  error: "bg-rose-600 text-white border-rose-700",
  warning: "bg-amber-500 text-white border-amber-600",
  info: "bg-sky-600 text-white border-sky-700",
};

const ICONS: Record<ToastMessage["type"], string> = {
  success: "✓",
  error: "✕",
  warning: "!",
  info: "i",
};

export function Toast({ message, onDismiss, autoDismissMs = 4000 }: Props) {
  // Auto-dismiss para success/info/warning. Errores persisten hasta cerrar.
  useEffect(() => {
    if (!message) return;
    if (message.type === "error") return;
    if (autoDismissMs <= 0) return;
    const id = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.text, message?.type, autoDismissMs]);

  if (!message) return null;

  return (
    <>
      {/* Banner inline (desktop). Mantiene el flow del documento. */}
      <div
        role={message.type === "error" ? "alert" : "status"}
        className={`hidden items-start gap-2 rounded-lg border p-3 text-sm sm:flex ${STYLES_INLINE[message.type]}`}
      >
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${STYLES_FLOATING[message.type]}`}
        >
          {ICONS[message.type]}
        </span>
        <span className="flex-1">{message.text}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          className="shrink-0 text-current opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>

      {/* Toast flotante (mobile). Position fixed para que se vea siempre. */}
      <div
        role={message.type === "error" ? "alert" : "status"}
        aria-live="polite"
        className={`fixed inset-x-3 top-3 z-50 flex items-start gap-2 rounded-lg border p-3 text-sm shadow-lg sm:hidden ${STYLES_FLOATING[message.type]}`}
      >
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/30 text-xs font-bold"
        >
          {ICONS[message.type]}
        </span>
        <span className="flex-1">{message.text}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          className="shrink-0 text-white/80 hover:text-white"
        >
          ✕
        </button>
      </div>
    </>
  );
}
