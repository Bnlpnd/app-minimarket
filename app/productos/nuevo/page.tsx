"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Layout } from "@/components/Layout";
import { ProductoForm } from "@/components/ProductoForm";
import type { ProductoFormValues } from "@/components/ProductoForm";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type {
  Categoria,
  Marca,
  Presentacion,
  Producto,
  Subcategoria,
  UnidadBase,
} from "@/types/database";

type Message = {
  type: "success" | "error";
  text: string;
};

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return normalizeSpaces(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseNumber(value: string, fallback: number | null) {
  if (value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ProductoNuevoPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Cargando formulario...</div>}>
      <ProductoNuevoContent />
    </Suspense>
  );
}

function ProductoNuevoContent() {
  const searchParams = useSearchParams();
  const productoId = searchParams.get("id");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([]);
  const [unidadesBase, setUnidadesBase] = useState<UnidadBase[]>([]);
  const [productoEditando, setProductoEditando] = useState<Producto | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function loadCatalogos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      return;
    }

    const [
      categoriasResult,
      subcategoriasResult,
      marcasResult,
      presentacionesResult,
      unidadesResult,
    ] = await Promise.all([
      supabase.from("categorias").select("*").eq("activo", true).order("nombre"),
      supabase
        .from("subcategorias")
        .select("*")
        .eq("activo", true)
        .order("nombre"),
      supabase.from("marcas").select("*").eq("activo", true).order("nombre"),
      supabase
        .from("presentaciones")
        .select("*")
        .eq("activo", true)
        .order("nombre"),
      supabase.from("unidades_base").select("*").eq("activo", true).order("nombre"),
    ]);

    if (
      categoriasResult.error ||
      subcategoriasResult.error ||
      marcasResult.error ||
      presentacionesResult.error ||
      unidadesResult.error
    ) {
      setMessage({
        type: "error",
        text: "No se pudieron cargar los catalogos del formulario.",
      });
      return;
    }

    setCategorias((categoriasResult.data ?? []) as Categoria[]);
    setSubcategorias((subcategoriasResult.data ?? []) as Subcategoria[]);
    setMarcas((marcasResult.data ?? []) as Marca[]);
    setPresentaciones((presentacionesResult.data ?? []) as Presentacion[]);
    setUnidadesBase((unidadesResult.data ?? []) as UnidadBase[]);
  }

  async function loadProducto() {
    if (!supabase || !productoId) {
      setProductoEditando(null);
      return;
    }

    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .eq("id", productoId)
      .maybeSingle();

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo cargar el producto: ${error.message}`,
      });
      return;
    }

    setProductoEditando((data ?? null) as Producto | null);
  }

  useEffect(() => {
    void loadCatalogos();
    void loadProducto();
  }, [productoId]);

  async function quickCreateCategoria(nombre: string) {
    if (!supabase) {
      return null;
    }
    const normalized = normalizeSpaces(nombre);
    if (!normalized) {
      setMessage({ type: "error", text: "Ingresa una categoria." });
      return null;
    }

    const existing = categorias.find(
      (item) => normalizeKey(item.nombre) === normalizeKey(normalized),
    );
    if (existing) {
      return existing;
    }

    const { data, error } = await supabase
      .from("categorias")
      .insert({ nombre: normalized })
      .select("*")
      .single();

    if (error) {
      setMessage({ type: "error", text: `No se pudo crear categoria: ${error.message}` });
      return null;
    }

    const categoria = data as Categoria;
    setCategorias((current) => [...current, categoria].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    return categoria;
  }

  async function quickCreateSubcategoria(categoriaId: string, nombre: string) {
    if (!supabase) {
      return null;
    }
    const normalized = normalizeSpaces(nombre);
    if (!categoriaId) {
      setMessage({ type: "error", text: "Selecciona una categoria primero." });
      return null;
    }
    if (!normalized) {
      setMessage({ type: "error", text: "Ingresa una subcategoria." });
      return null;
    }

    const existing = subcategorias.find(
      (item) =>
        item.categoria_id === categoriaId &&
        normalizeKey(item.nombre) === normalizeKey(normalized),
    );
    if (existing) {
      return existing;
    }

    const { data, error } = await supabase
      .from("subcategorias")
      .insert({ categoria_id: categoriaId, nombre: normalized })
      .select("*")
      .single();

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo crear subcategoria: ${error.message}`,
      });
      return null;
    }

    const subcategoria = data as Subcategoria;
    setSubcategorias((current) =>
      [...current, subcategoria].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    );
    return subcategoria;
  }

  async function quickCreateMarca(nombre: string) {
    if (!supabase) {
      return null;
    }
    const normalized = normalizeSpaces(nombre);
    if (!normalized) {
      setMessage({ type: "error", text: "Ingresa una marca." });
      return null;
    }

    const existing = marcas.find(
      (item) => normalizeKey(item.nombre) === normalizeKey(normalized),
    );
    if (existing) {
      return existing;
    }

    const { data, error } = await supabase
      .from("marcas")
      .insert({ nombre: normalized })
      .select("*")
      .single();

    if (error) {
      setMessage({ type: "error", text: `No se pudo crear marca: ${error.message}` });
      return null;
    }

    const marca = data as Marca;
    setMarcas((current) => [...current, marca].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    return marca;
  }

  async function handleSubmit(values: ProductoFormValues) {
    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return false;
    }

    const codigoInterno = normalizeSpaces(values.codigo_interno);
    const nombreProducto = normalizeSpaces(values.nombre_producto);

    if (!codigoInterno || !nombreProducto) {
      setMessage({
        type: "error",
        text: "Codigo interno y nombre del producto son obligatorios.",
      });
      return false;
    }

    if (!values.categoria_id || !values.subcategoria_id || !values.marca_id) {
      setMessage({
        type: "error",
        text: "Selecciona categoria, subcategoria y marca.",
      });
      return false;
    }

    const payload = {
      codigo_interno: codigoInterno,
      categoria_id: values.categoria_id,
      subcategoria_id: values.subcategoria_id,
      nombre_producto: nombreProducto,
      marca_id: values.marca_id,
      presentacion: emptyToNull(values.presentacion),
      unidad_base: emptyToNull(values.unidad_base),
      stock_minimo: parseNumber(values.stock_minimo, 10),
      precio_compra_referencial: parseNumber(
        values.precio_compra_referencial,
        null,
      ),
      precio_venta: parseNumber(values.precio_venta, 1),
      imagen_url: emptyToNull(values.imagen_url),
      activo: values.activo,
    };

    setIsSaving(true);
    const result = productoEditando
      ? await supabase.from("productos").update(payload).eq("id", productoEditando.id)
      : await supabase.from("productos").insert(payload).select("id").single();
    setIsSaving(false);

    if (result.error) {
      setMessage({
        type: "error",
        text:
          result.error.code === "23505"
            ? "Ya existe un producto con ese codigo interno."
            : `No se pudo guardar: ${result.error.message}`,
      });
      return false;
    }

    if (!productoEditando) {
      const productoIdCreado = (result.data as { id: string }).id;
      const tienda = await supabase
        .from("almacenes")
        .select("id")
        .eq("nombre", "Tienda")
        .maybeSingle();

      if (tienda.data?.id) {
        await supabase.from("producto_almacen").upsert({
          producto_id: productoIdCreado,
          almacen_id: tienda.data.id,
          stock_actual: 0,
        });
      }
    }

    setMessage({
      type: "success",
      text: productoEditando
        ? "Producto actualizado correctamente."
        : "Producto creado correctamente. El stock inicial queda en 0 en Tienda.",
    });
    await loadProducto();
    return true;
  }

  return (
    <Layout
      title={productoEditando ? "Editar producto" : "Nuevo producto"}
      description="Registra los datos generales del producto. El stock se administra desde Almacen."
    >
      <div className="space-y-5">
        {message ? (
          <div
            className={`rounded-lg border p-4 text-sm ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <ProductoForm
          key={productoEditando?.id ?? "nuevo"}
          categorias={categorias}
          subcategorias={subcategorias}
          marcas={marcas}
          presentaciones={presentaciones}
          unidadesBase={unidadesBase}
          productoEditando={productoEditando}
          isSaving={isSaving}
          onSubmit={handleSubmit}
          onQuickCreateCategoria={quickCreateCategoria}
          onQuickCreateSubcategoria={quickCreateSubcategoria}
          onQuickCreateMarca={quickCreateMarca}
        />
      </div>
    </Layout>
  );
}
