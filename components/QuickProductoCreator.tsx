"use client";

/* eslint-disable react-hooks/set-state-in-effect */

/**
 * Mini-form modal para crear un producto rapido sin salir del modulo de
 * compras a proveedor. Pide solo lo minimo (nombre, marca, categoria,
 * subcategoria, presentacion, precio venta, unidad base). El resto se
 * deja con defaults (activo=true, stock_minimo=10).
 *
 * Al guardar, llama onCreated(producto) con el producto recien creado
 * para que el padre lo autoseleccione en la fila correspondiente.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type {
  Categoria,
  Marca,
  Presentacion,
  Producto,
  Subcategoria,
} from "@/types/database";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (producto: Producto) => void;
  /** Pre-rellenar el nombre con lo que el usuario ya tipeaba. */
  initialName?: string;
  /** Catalogos compartidos. */
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  marcas: Marca[];
  presentaciones: Presentacion[];
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export function QuickProductoCreator({
  open,
  onClose,
  onCreated,
  initialName = "",
  categorias,
  subcategorias,
  marcas,
  presentaciones,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [subcategoriaId, setSubcategoriaId] = useState("");
  const [marcaId, setMarcaId] = useState("");
  const [presentacion, setPresentacion] = useState("");
  const [unidadBase, setUnidadBase] = useState("und");
  const [precioVenta, setPrecioVenta] = useState("1");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resetear al abrir.
  useEffect(() => {
    if (open) {
      setNombre(initialName);
      setCategoriaId("");
      setSubcategoriaId("");
      setMarcaId("");
      setPresentacion("");
      setUnidadBase("und");
      setPrecioVenta("1");
      setError(null);
    }
  }, [open, initialName]);

  if (!open) return null;

  const subcatsDisponibles = categoriaId
    ? subcategorias.filter((s) => s.categoria_id === categoriaId)
    : subcategorias;

  async function handleSave() {
    if (!supabase) {
      setError("Sin conexion a Supabase.");
      return;
    }
    const nombreLimpio = nombre.trim().replace(/\s+/g, " ");
    if (!nombreLimpio) {
      setError("Falta el nombre del producto.");
      return;
    }
    if (!categoriaId || !subcategoriaId || !marcaId || !presentacion) {
      setError("Categoria, subcategoria, marca y presentacion son obligatorios.");
      return;
    }
    const precio = Number(precioVenta);
    if (!Number.isFinite(precio) || precio < 0) {
      setError("Precio venta invalido.");
      return;
    }

    setIsSaving(true);
    setError(null);
    const { data, error: insertErr } = await supabase
      .from("productos")
      .insert({
        nombre_producto: nombreLimpio,
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId,
        marca_id: marcaId,
        presentacion,
        unidad_base: unidadBase.trim() || "und",
        precio_venta: precio,
        stock_minimo: 10,
        activo: true,
      })
      .select("*")
      .single();
    setIsSaving(false);

    if (insertErr || !data) {
      setError(insertErr?.message ?? "No se pudo crear.");
      return;
    }
    onCreated(data as Producto);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-950">
              Crear producto rapido
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Para ingresar mas detalles, edita el producto luego desde la
              seccion Productos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-slate-400 hover:text-slate-700"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Nombre *</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              className={`${inputClassName} mt-1`}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Categoria *</span>
              <div className="mt-1">
                <SearchableSelect
                  value={categoriaId}
                  onChange={(id) => {
                    setCategoriaId(id);
                    setSubcategoriaId("");
                  }}
                  options={categorias.map((c) => ({ id: c.id, label: c.nombre }))}
                  placeholder="Buscar..."
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Subcategoria *</span>
              <div className="mt-1">
                <SearchableSelect
                  value={subcategoriaId}
                  onChange={(id) => setSubcategoriaId(id)}
                  options={subcatsDisponibles.map((s) => ({
                    id: s.id,
                    label: s.nombre,
                  }))}
                  placeholder={
                    categoriaId ? "Buscar..." : "Elegi categoria primero"
                  }
                  disabled={!categoriaId}
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Marca *</span>
              <div className="mt-1">
                <SearchableSelect
                  value={marcaId}
                  onChange={(id) => setMarcaId(id)}
                  options={marcas.map((m) => ({ id: m.id, label: m.nombre }))}
                  placeholder="Buscar..."
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Presentacion *</span>
              <div className="mt-1">
                <SearchableSelect
                  value={presentacion}
                  onChange={(nom) => setPresentacion(nom)}
                  options={presentaciones.map((p) => ({
                    id: p.nombre,
                    label: p.nombre,
                  }))}
                  placeholder="Buscar..."
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Unidad base</span>
              <input
                value={unidadBase}
                onChange={(e) => setUnidadBase(e.target.value)}
                placeholder="und, kg, lt..."
                className={`${inputClassName} mt-1`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Precio venta *</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={precioVenta}
                onChange={(e) => setPrecioVenta(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className={`${inputClassName} mt-1`}
              />
            </label>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
          >
            {isSaving ? "Creando..." : "Crear producto"}
          </button>
        </div>
      </div>
    </div>
  );
}
