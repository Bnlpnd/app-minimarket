"use client";

import { useEffect, useState } from "react";
import { getCurrentUserProfile, isAdmin } from "@/lib/authRoles";

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const [isChecking, setIsChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      const { profile } = await getCurrentUserProfile();
      setAllowed(isAdmin(profile));
      setIsChecking(false);
    }

    void checkAccess();
  }, []);

  if (isChecking) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Verificando permisos...
      </section>
    );
  }

  if (!allowed) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        <h2 className="text-base font-semibold text-amber-950">Acceso restringido</h2>
        <p className="mt-2">Debes iniciar sesion como admin para acceder a esta seccion.</p>
        <a
          href="/login"
          className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
        >
          Ir al login
        </a>
      </section>
    );
  }

  return <>{children}</>;
}
