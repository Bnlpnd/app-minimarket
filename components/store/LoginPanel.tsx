"use client";

/**
 * Modal de cuenta para la tienda. Soporta:
 *  - Clientes: registro e inicio de sesion con correo/clave via Supabase Auth
 *    (asi quedan con identidad verificada y aplican las politicas RLS), o con
 *    Google.
 *  - Staff (admin/trabajador): si el correo/clave no es de un cliente de
 *    Supabase Auth, se intenta el login propio (RPC login_app) y se redirige
 *    al panel.
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

type Mode = "login" | "register";

export function LoginPanel({ open, onClose, onLoggedIn }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!open) return null;

  async function syncClientAndFinish() {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("cliente_sync_self", {});
    const p = data?.[0] as
      | {
          id: string;
          email: string;
          rol: string;
          nombres: string | null;
          apellidos: string | null;
          cliente_id: string | null;
        }
      | undefined;
    if (error || !p) {
      setMessage("No se pudo cargar tu cuenta. Intenta de nuevo.");
      return;
    }
    const stored: StoredAppUser = {
      id: p.id,
      email: p.email,
      rol: p.rol,
      nombres: p.nombres,
      apellidos: p.apellidos,
      cliente_id: p.cliente_id,
    };
    setStoredAppUser(stored);
    onLoggedIn(stored);
    onClose();
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setMessage(supabaseConfigError ?? "Sin conexion a Supabase.");
      return;
    }
    setLoading(true);
    setMessage(null);
    setInfo(null);

    // 1) Cliente (Supabase Auth)
    const { data: signIn, error: signErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (!signErr && signIn.session) {
      await syncClientAndFinish();
      setLoading(false);
      return;
    }
    if (signErr && /confirm/i.test(signErr.message)) {
      setLoading(false);
      setMessage("Tu correo no está confirmado. Revisa tu bandeja para activarlo.");
      return;
    }

    // 2) Staff (login propio)
    const { data, error } = await supabase.rpc("login_app", {
      p_email: email.trim(),
      p_password: password,
    });
    const user = data?.[0] as
      | { id: string; email: string; rol: string; nombres: string | null; apellidos: string | null }
      | undefined;
    setLoading(false);

    if (!error && user) {
      // Asegurar que el staff opere como anon (sin sesion Supabase Auth).
      await supabase.auth.signOut().catch(() => {});
      setStoredAppUser({
        id: user.id,
        email: user.email,
        rol: user.rol,
        nombres: user.nombres,
        apellidos: user.apellidos,
      });
      if (isStaffRole(user.rol)) {
        router.push("/dashboard");
        return;
      }
      onLoggedIn({
        id: user.id,
        email: user.email,
        rol: user.rol,
        nombres: user.nombres,
        apellidos: user.apellidos,
      });
      onClose();
      return;
    }

    setMessage("Correo o clave incorrectos.");
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setMessage(supabaseConfigError ?? "Sin conexion a Supabase.");
      return;
    }
    if (password.length < 8) {
      setMessage("La clave debe tener al menos 8 caracteres.");
      return;
    }
    setLoading(true);
    setMessage(null);
    setInfo(null);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: nombre.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setLoading(false);
      setMessage(`No se pudo registrar: ${error.message}`);
      return;
    }
    if (data.session) {
      await syncClientAndFinish();
      setLoading(false);
      return;
    }
    setLoading(false);
    setInfo("¡Listo! Te enviamos un correo para confirmar tu cuenta. Actívalo y luego inicia sesión.");
    setMode("login");
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
        "Google aún no está disponible. Activa el proveedor Google en Supabase para habilitarlo.",
      );
    }
  }

  const isRegister = mode === "register";

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
          {isRegister ? "Crear cuenta" : "Iniciar sesión"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isRegister
            ? "Regístrate para comprar y seguir tus pedidos."
            : "Accede para ver tus pedidos, deudas y pagos."}
        </p>

        {message ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {message}
          </p>
        ) : null}
        {info ? (
          <p className="mt-4 rounded-md border border-santa-200 bg-santa-50 p-3 text-xs text-santa-800">
            {info}
          </p>
        ) : null}

        <form onSubmit={isRegister ? handleRegister : handleLogin} className="mt-5 space-y-3">
          {isRegister ? (
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Nombre</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="name"
                required
                className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100"
              />
            </label>
          ) : null}
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
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-md bg-santa-800 text-sm font-semibold text-white hover:bg-santa-900 disabled:bg-slate-300"
          >
            {loading
              ? "Procesando..."
              : isRegister
                ? "Crear cuenta"
                : "Iniciar sesión"}
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

        <p className="mt-4 text-center text-xs text-slate-500">
          {isRegister ? "¿Ya tienes cuenta? " : "¿Eres cliente nuevo? "}
          <button
            type="button"
            onClick={() => {
              setMode(isRegister ? "login" : "register");
              setMessage(null);
              setInfo(null);
            }}
            className="font-semibold text-santa-700 hover:underline"
          >
            {isRegister ? "Inicia sesión" : "Crea tu cuenta"}
          </button>
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
