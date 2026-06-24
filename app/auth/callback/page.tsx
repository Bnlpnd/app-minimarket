"use client";

/* eslint-disable react-hooks/set-state-in-effect */

/**
 * Callback de Google (Supabase Auth). Tras autenticar, obtiene el correo,
 * busca/crea el cliente vinculado (RPC cliente_sync_self, identidad del JWT),
 * guarda la sesion local y regresa a la tienda.
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

      // Si Google/Supabase devolvio un error en la URL, llevarlo a la tienda
      // para mostrar el mensaje y el formulario de crear cuenta.
      const q = new URLSearchParams(window.location.search);
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const oauthErr = q.get("error_description") || h.get("error_description") || q.get("error") || h.get("error");
      if (oauthErr) {
        router.replace(
          `/?authError=${encodeURIComponent(
            `No pudimos iniciar sesión con Google: ${decodeURIComponent(oauthErr).replace(/\+/g, " ")}. Crea tu cuenta con tu correo o intenta de nuevo.`,
          )}`,
        );
        return;
      }

      // Asegurar sesion: el cliente auto-detecta el token de la URL; si no,
      // intercambiamos el code (PKCE) manualmente.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const code = q.get("code");
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
        router.replace(
          `/?authError=${encodeURIComponent(
            "No se pudo completar el inicio con Google. Crea tu cuenta con tu correo o intenta de nuevo.",
          )}`,
        );
        return;
      }

      // Identidad tomada del JWT verificado (no se confia en parametros).
      const { data, error: rpcErr } = await supabase.rpc("cliente_sync_self", {});
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
