"use client";

/**
 * Modal de inicio de sesion para la tienda. Soporta:
 *  - Correo + clave (RPC login_app, usuarios staff y clientes con clave).
 *  - Continuar con Google (Supabase Auth, solo clientes). Requiere que el
 *    proveedor Google este activado en Supabase; mientras no lo este,
 *    Supabase responde con error y se muestra un aviso.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { isStaffRole, setStoredAppUser, type StoredAppUser } from "@/lib/authRoles";
import { BrandIso } from "@/components/ui/BrandMark";

type Props = {
  open: boolean;
  onClose: () => void;
  onLoggedIn: (user: StoredAppUser) => void;
};

export function LoginPanel({ open, onClose, onLoggedIn }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return null;

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setMessage(supabaseConfigError ?? "Sin conexion a Supabase.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("login_app", {
      p_email: email.trim(),
      p_password: password,
    });
    setLoading(false);

    const user = data?.[0] as
      | { id: string; email: string; rol: string; nombres: string | null; apellidos: string | null }
      | undefined;
    if (error || !user) {
      setMessage(
        error ? `No se pudo iniciar sesion: ${error.message}` : "Correo o clave incorrectos.",
      );
      return;
    }

    const stored: StoredAppUser = {
      id: user.id,
      email: user.email,
      rol: user.rol,
      nombres: user.nombres,
      apellidos: user.apellidos,
    };
    setStoredAppUser(stored);
    if (isStaffRole(user.rol)) {
      router.push("/dashboard");
      return;
    }
    onLoggedIn(stored);
    onClose();
  }

  async function handleGoogle() {
    if (!supabase) {
      setMessage(supabaseConfigError ?? "Sin conexion a Supabase.");
      return;
    }
    setGoogleLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setGoogleLoading(false);
      setMessage(
        "Google aun no esta disponible. Activa el proveedor Google en Supabase para habilitarlo.",
      );
    }
    // Si no hay error, el navegador redirige a Google.
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <BrandIso size={40} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-2xl leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <h2 className="font-display mt-4 text-2xl font-semibold text-santa-900">
          Iniciar sesion
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Accede para ver tus pedidos, deudas y pagos.
        </p>

        {message ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {message}
          </p>
        ) : null}

        <form onSubmit={handleEmailLogin} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Clave</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-md bg-santa-800 text-sm font-semibold text-white hover:bg-santa-900 disabled:bg-slate-300"
          >
            {loading ? "Ingresando..." : "Iniciar sesion"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          o
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={() => void handleGoogle()}
          disabled={googleLoading}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <GoogleIcon />
          {googleLoading ? "Conectando..." : "Continuar con Google"}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Los clientes nuevos se registran automaticamente al entrar con Google.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
