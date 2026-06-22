"use client";

/**
 * Contexto de sesion de la tienda. Centraliza el usuario actual, el modal de
 * login/registro y el carrito, y expone `requireAuth` para "acciones que
 * necesitan sesion": si no hay sesion, abre el login y reanuda la accion al
 * iniciar sesion (sin perder el carrito).
 */

import { createContext, useContext } from "react";
import type { StoredAppUser } from "@/lib/authRoles";

export type StoreSessionValue = {
  user: StoredAppUser | null;
  setUser: (u: StoredAppUser | null) => void;
  /** Ejecuta la accion si hay sesion; si no, abre login y la reanuda al entrar. */
  requireAuth: (action: () => void) => void;
  openLogin: () => void;
  openCart: () => void;
  closeCart: () => void;
  cartOpen: boolean;
  logout: () => void;
};

export const StoreSessionContext = createContext<StoreSessionValue | null>(null);

export function useStoreSession() {
  const ctx = useContext(StoreSessionContext);
  if (!ctx) {
    throw new Error("useStoreSession debe usarse dentro de <StoreSessionProvider>");
  }
  return ctx;
}
