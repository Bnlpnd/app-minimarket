"use client";

/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */

/**
 * Tienda online (home publica). Catalogo de productos activos con buscador,
 * filtro por categoria y boton de agregar al carrito. El encabezado incluye
 * el modulo de inicio de sesion y el carrito.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Search, ShoppingBasket } from "lucide-react";
import { StoreHeader } from "@/components/store/StoreHeader";
import { useCart } from "@/lib/cart";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";

type StoreProducto = {
  id: string;
  nombre_producto: string;
  precio_venta: number | null;
  imagen_url: string | null;
  unidad_base: string | null;
  presentacion: string | null;
  categoria_id: string | null;
  categorias: { nombre: string } | { nombre: string }[] | null;
};

type Categoria = { id: string; nombre: string };

function money(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function catNombre(rel: StoreProducto["categorias"]) {
  if (!rel) return "";
  return Array.isArray(rel) ? rel[0]?.nombre ?? "" : rel.nombre;
}

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function Storefront() {
  const { addItem } = useCart();
  const [productos, setProductos] = useState<StoreProducto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [catId, setCatId] = useState<string>("all");
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (supabaseConfigError || !supabase) {
        setError(supabaseConfigError ?? "Sin conexion a Supabase.");
        setLoading(false);
        return;
      }
      const [prodRes, catRes] = await Promise.all([
        supabase
          .from("productos")
          .select(
            "id,nombre_producto,precio_venta,imagen_url,unidad_base,presentacion,categoria_id,categorias(nombre)",
          )
          .eq("activo", true)
          .is("producto_base_id", null)
          .order("nombre_producto")
          .limit(1000),
        supabase.from("categorias").select("id,nombre").eq("activo", true).order("nombre"),
      ]);

      if (prodRes.error) {
        setError(`No se pudieron cargar los productos: ${prodRes.error.message}`);
        setLoading(false);
        return;
      }
      const prods = ((prodRes.data ?? []) as StoreProducto[]).filter(
        (p) => Number(p.precio_venta ?? 0) > 0,
      );
      setProductos(prods);
      setCategorias((catRes.data ?? []) as Categoria[]);
      setLoading(false);
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return productos.filter((p) => {
      if (catId !== "all" && p.categoria_id !== catId) return false;
      if (!q) return true;
      const hay = normalize(`${p.nombre_producto} ${catNombre(p.categorias)}`);
      return q.split(/\s+/).every((tok) => hay.includes(tok));
    });
  }, [productos, query, catId]);

  function handleAdd(p: StoreProducto) {
    addItem(
      {
        productoId: p.id,
        nombre: p.nombre_producto,
        precio: Number(p.precio_venta ?? 0),
        imagenUrl: p.imagen_url,
        unidad: p.unidad_base,
      },
      1,
    );
    setAdded(p.id);
    window.setTimeout(() => setAdded((cur) => (cur === p.id ? null : cur)), 1200);
  }

  return (
    <div className="min-h-screen bg-crema">
      <StoreHeader />

      {/* Hero */}
      <section className="bg-santa-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-halo-400">
            Tu minimarket de barrio
          </p>
          <h1 className="font-display mt-2 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
            Productos frescos y de siempre, listos para recoger
          </h1>
          <p className="mt-3 max-w-xl text-sm text-santa-100">
            Arma tu pedido, confírmalo y recógelo en tienda. Cercano, ordenado y
            confiable.
          </p>
        </div>
      </section>

      {/* Buscador + categorias */}
      <div className="sticky top-16 z-30 border-b border-slate-200 bg-crema/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar productos..."
              className="h-11 w-full rounded-full border border-slate-300 bg-white pl-10 pr-4 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100"
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <Chip active={catId === "all"} onClick={() => setCatId("all")}>
              Todos
            </Chip>
            {categorias.map((c) => (
              <Chip key={c.id} active={catId === c.id} onClick={() => setCatId(c.id)}>
                {c.nombre}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </p>
        ) : loading ? (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Cargando productos...
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No se encontraron productos.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {filtered.map((p) => (
              <article
                key={p.id}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="aspect-square w-full overflow-hidden bg-slate-50">
                  {p.imagen_url ? (
                    <img
                      src={p.imagen_url}
                      alt={p.nombre_producto}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                      <ShoppingBasket className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-halo-600">
                    {catNombre(p.categorias) || "Producto"}
                  </p>
                  <h3 className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-900">
                    {p.nombre_producto}
                  </h3>
                  {p.presentacion ? (
                    <p className="mt-0.5 text-xs text-slate-500">{p.presentacion}</p>
                  ) : null}
                  <div className="mt-auto pt-3">
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <p className="text-base font-bold text-santa-900">
                          {money(Number(p.precio_venta ?? 0))}
                        </p>
                        {p.unidad_base ? (
                          <p className="text-[11px] text-slate-400">/ {p.unidad_base}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAdd(p)}
                        aria-label={`Agregar ${p.nombre_producto}`}
                        className={`inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold transition ${
                          added === p.id
                            ? "bg-santa-100 text-santa-800"
                            : "bg-santa-800 text-white hover:bg-santa-900"
                        }`}
                      >
                        {added === p.id ? (
                          <>
                            <Check className="h-4 w-4" /> Listo
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" /> Agregar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-slate-400 sm:px-6">
          Santa Ana minimarket · Cercano, ordenado y confiable
        </div>
      </footer>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "border-santa-800 bg-santa-800 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:border-santa-400 hover:text-santa-800"
      }`}
    >
      {children}
    </button>
  );
}
