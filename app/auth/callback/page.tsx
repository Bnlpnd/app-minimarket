"use client";

/* eslint-disable react-hooks/set-state-in-effect */

/**
 * Callback de Google (Supabase Auth). Tras autenticar, obtiene el correo,
 * busca/crea el cliente vinculado (RPC cliente_login_google), guarda la
 * sesion local y regresa a la tienda.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { setStoredAppUser } from "@/lib/authRoles";
import { BrandIso } from "@/components/ui/BrandMark";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      if (!supabase) {
        setError("Sin conexion a Supabase.");
        return;
      }

      // Asegurar sesion: el cliente auto-detecta el token de la URL; si no,
      // intercambiamos el code (PKCE) manualmente.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          try {
            await supabase.auth.exchangeCodeForSession(code);
          } catch {
            // ignorar: se valida con getUser() abajo
          }
        }
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user?.email) {
        setError("No se pudo obtener tu correo de Google. Intenta de nuevo.");
        return;
      }

      const nombres =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        "";

      const { data, error: rpcErr } = await supabase.rpc("cliente_login_google", {
        p_email: user.email,
        p_nombres: nombres,
      });
      const profile = data?.[0] as
        | {
            id: string;
            email: string;
            rol: string;
            nombres: string | null;
            apellidos: string | null;
            cliente_id: string | null;
          }
        | undefined;

      if (rpcErr || !profile) {
        setError(`No se pudo crear tu cuenta: ${rpcErr?.message ?? "sin respuesta"}`);
        return;
      }

      setStoredAppUser({
        id: profile.id,
        email: profile.email,
        rol: profile.rol,
        nombres: profile.nombres,
        apellidos: profile.apellidos,
        cliente_id: profile.cliente_id,
      });
      router.replace("/");
    }

    void run();
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-crema px-6 text-center">
      <BrandIso size={56} />
      {error ? (
        <>
          <p className="max-w-sm text-sm text-rose-700">{error}</p>
          <a
            href="/"
            className="h-11 rounded-md bg-santa-800 px-5 text-sm font-semibold leading-[44px] text-white hover:bg-santa-900"
          >
            Volver a la tienda
          </a>
        </>
      ) : (
        <p className="text-sm text-slate-500">Iniciando sesión...</p>
      )}
    </main>
  );
}
