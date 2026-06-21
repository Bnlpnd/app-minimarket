"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { isStaffRole, setStoredAppUser } from "@/lib/authRoles";
import { BrandMark } from "@/components/ui/BrandMark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage(supabaseConfigError ?? "No hay conexion a Supabase.");
      return;
    }

    setIsLoading(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("login_app", {
      p_email: email.trim(),
      p_password: password,
    });
    setIsLoading(false);

    const user = data?.[0];

    if (error || !user) {
      setMessage(
        error
          ? `No se pudo iniciar sesion: ${error.message}`
          : "Correo o clave incorrectos.",
      );
      return;
    }

    setStoredAppUser({
      id: user.id,
      email: user.email,
      rol: user.rol,
      nombres: user.nombres,
      apellidos: user.apellidos,
    });
    router.push(isStaffRole(user.rol) ? "/dashboard" : "/mi-cuenta");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-crema px-6 py-12 text-slate-900">
      <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <BrandMark variant="vertical" className="mx-auto h-40 w-auto" />
        <h1 className="font-display mt-5 text-center text-2xl font-semibold text-santa-900">
          Ingreso al sistema
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Usa tu correo y clave asignados por el administrador.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Clave</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100"
            />
          </label>

          {message ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-santa-700 px-4 text-sm font-semibold text-white hover:bg-santa-800 disabled:bg-slate-300"
          >
            {isLoading ? "Ingresando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-400">
          ¿Eres cliente?{" "}
          <Link href="/" className="font-semibold text-santa-700 hover:underline">
            Ir a la tienda
          </Link>
        </p>
      </section>
    </main>
  );
}
