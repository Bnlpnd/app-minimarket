"use client";

/**
 * Encabezado de la tienda (storefront y area de cliente). Logo a la
 * izquierda; a la derecha el carrito y el modulo de cuenta / inicio de
 * sesion. El modal de login y el carrito viven en StoreSessionProvider;
 * aqui solo se disparan.
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, LayoutDashboard, LogOut, ShoppingCart, User } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { useStoreSession } from "@/components/store/storeSessionContext";
import { isStaffRole } from "@/lib/authRoles";
import { useCart } from "@/lib/cart";

export function StoreHeader() {
  const { count } = useCart();
  const { user, openLogin, openCart, logout } = useStoreSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const nombre = user?.nombres?.split(" ")[0] ?? "Mi cuenta";
  const staff = isStaffRole(user?.rol);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <BrandMark variant="horizontal" className="h-9 w-auto" />
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCart}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
            aria-label="Abrir carrito"
          >
            <ShoppingCart className="h-5 w-5" />
            {count > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-halo-500 px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            ) : null}
          </button>

          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-santa-100 text-santa-800">
                  <User className="h-4 w-4" />
                </span>
                <span className="hidden max-w-24 truncate sm:block">{nombre}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {menuOpen ? (
                <>
                  <button
                    type="button"
                    aria-hidden="true"
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <Link
                      href="/mi-cuenta"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <User className="h-4 w-4 text-slate-400" />
                      Mi cuenta
                    </Link>
                    {staff ? (
                      <Link
                        href="/dashboard"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <LayoutDashboard className="h-4 w-4 text-slate-400" />
                        Panel de gestión
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={logout}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Cerrar sesión
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={openLogin}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-santa-800 px-4 text-sm font-semibold text-white hover:bg-santa-900"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Iniciar sesión</span>
              <span className="sm:hidden">Entrar</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
