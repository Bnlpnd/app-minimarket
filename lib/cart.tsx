"use client";

/**
 * Carrito de la tienda (storefront). Estado global persistido en
 * localStorage para que sobreviva recargas y navegacion entre paginas
 * de la tienda. Solo se usa en el lado cliente.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CartItem = {
  productoId: string;
  nombre: string;
  precio: number;
  imagenUrl: string | null;
  unidad: string | null;
  cantidad: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  addItem: (item: Omit<CartItem, "cantidad">, cantidad?: number) => void;
  setQty: (productoId: string, cantidad: number) => void;
  removeItem: (productoId: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "sa_cart_v1";

const CartContext = createContext<CartContextValue | null>(null);

function readStored(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i) => i && typeof i.productoId === "string" && Number(i.cantidad) > 0,
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Cargar del localStorage una vez en el cliente.
  useEffect(() => {
    setItems(readStored());
    setHydrated(true);
  }, []);

  // Persistir cambios.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // almacenamiento lleno o bloqueado: ignorar
    }
  }, [items, hydrated]);

  const addItem = useCallback(
    (item: Omit<CartItem, "cantidad">, cantidad = 1) => {
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.productoId === item.productoId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], cantidad: next[idx].cantidad + cantidad };
          return next;
        }
        return [...prev, { ...item, cantidad }];
      });
    },
    [],
  );

  const setQty = useCallback((productoId: string, cantidad: number) => {
    setItems((prev) => {
      if (cantidad <= 0) return prev.filter((i) => i.productoId !== productoId);
      return prev.map((i) =>
        i.productoId === productoId ? { ...i, cantidad } : i,
      );
    });
  }, []);

  const removeItem = useCallback((productoId: string) => {
    setItems((prev) => prev.filter((i) => i.productoId !== productoId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, i) => sum + i.cantidad, 0);
    const total = items.reduce((sum, i) => sum + i.cantidad * i.precio, 0);
    return { items, count, total, addItem, setQty, removeItem, clear };
  }, [items, addItem, setQty, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart debe usarse dentro de <CartProvider>");
  }
  return ctx;
}
