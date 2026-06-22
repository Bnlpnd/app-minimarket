"use client";

/**
 * Provee la sesion de la tienda y renderiza el modal de login y el carrito,
 * disponibles en cualquier pagina de la tienda. Implementa el flujo
 * "requiere sesion": al confirmar un pedido (o cualquier accion protegida)
 * abre el login automaticamente y reanuda la accion al iniciar sesion.
 * En login con Google (redireccion) reabre el carrito al volver.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredAppUser, signOut, type StoredAppUser } from "@/lib/authRoles";
import { StoreSessionContext } from "@/components/store/storeSessionContext";
import { LoginPanel } from "@/components/store/LoginPanel";
import { CartDrawer } from "@/components/store/CartDrawer";

const RESUME_KEY = "sa_resume_cart";

export function StoreSessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredAppUser | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    setUser(getStoredAppUser());
  }, []);

  // Al volver de un login con redireccion (Google), reabrir el carrito.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(RESUME_KEY) === "1") {
      window.sessionStorage.removeItem(RESUME_KEY);
      setCartOpen(true);
    }
  }, []);

  const requireAuth = useCallback((action: () => void) => {
    if (getStoredAppUser()) {
      action();
      return;
    }
    pending.current = action;
    try {
      window.sessionStorage.setItem(RESUME_KEY, "1");
    } catch {
      // sessionStorage no disponible: el carrito persiste igual en localStorage
    }
    setLoginOpen(true);
  }, []);

  const openLogin = useCallback(() => setLoginOpen(true), []);
  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const logout = useCallback(() => signOut("/"), []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    pending.current = null;
    try {
      window.sessionStorage.removeItem(RESUME_KEY);
    } catch {
      // ignore
    }
  }, []);

  const onLoggedIn = useCallback((u: StoredAppUser) => {
    setUser(u);
    setLoginOpen(false);
    try {
      window.sessionStorage.removeItem(RESUME_KEY);
    } catch {
      // ignore
    }
    const action = pending.current;
    pending.current = null;
    if (action) {
      // dar un tick para que el estado de sesion se asiente antes de reanudar
      window.setTimeout(action, 0);
    }
  }, []);

  return (
    <StoreSessionContext.Provider
      value={{ user, setUser, requireAuth, openLogin, openCart, closeCart, cartOpen, logout }}
    >
      {children}
      <LoginPanel open={loginOpen} onClose={closeLogin} onLoggedIn={onLoggedIn} />
      <CartDrawer />
    </StoreSessionContext.Provider>
  );
}
