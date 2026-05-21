"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { ProductoCatalogManager } from "@/components/ProductoCatalogManager";
import { ProductoForm } from "@/components/ProductoForm";
import type { ProductoFormValues } from "@/components/ProductoForm";
import { ProductoSearch } from "@/components/ProductoSearch";
import { ProductoTable } from "@/components/ProductoTable";
import type { ProductoConRelaciones } from "@/components/ProductoTable";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type { Categoria, Marca, Producto, Subcategoria } from "@/types/database";

type Message = {
  type: "success" | "error";
  text: string;
};

type ProductoPayload = {
  codigo_interno: string;
  categoria_id: string;
  subcategoria_id: string;
  nombre_producto: string;
  marca_id: string;
  presentacion: string | null;
  unidad_base: string | null;
  stock_actual: number | null;
  stock_minimo: number | null;
  precio_compra_referencial: number | null;
  precio_venta: number | null;
  imagen_url: string | null;
  activo: boolean;
};

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return normalizeSearch(normalizeSpaces(value));
}

function parseOptionalNumber(value: string) {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStockActual(value: string) {
  if (value.trim() === "") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildProductoPayload(values: ProductoFormValues): {
  payload: ProductoPayload | null;
  error: string | null;
} {
  const codigoInterno = values.codigo_interno.trim();
  const nombreProducto = values.nombre_producto.trim();

  if (!codigoInterno) {
    return { payload: null, error: "El codigo interno es obligatorio." };
  }

  if (!nombreProducto) {
    return { payload: null, error: "El nombre del producto es obligatorio." };
  }

  if (!values.categoria_id || !values.subcategoria_id || !values.marca_id) {
    return {
      payload: null,
      error: "Selecciona categoria, subcategoria y marca.",
    };
  }

  return {
    error: null,
    payload: {
      codigo_interno: codigoInterno,
      categoria_id: values.categoria_id,
      subcategoria_id: values.subcategoria_id,
      nombre_producto: nombreProducto,
      marca_id: values.marca_id,
      presentacion: emptyToNull(values.presentacion),
      unidad_base: emptyToNull(values.unidad_base),
      stock_actual: parseStockActual(values.stock_actual),
      stock_minimo: parseOptionalNumber(values.stock_minimo),
      precio_compra_referencial: parseOptionalNumber(
        values.precio_compra_referencial,
      ),
      precio_venta: parseOptionalNumber(values.precio_venta),
      imagen_url: emptyToNull(values.imagen_url),
      activo: values.activo,
    },
  };
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function ProductosPage() {
  const [productos, setProductos] = useState<ProductoConRelaciones[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [search, setSearch] = useState("");
  const [productoEditando, setProductoEditando] = useState<Producto | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCatalogo, setIsSavingCatalogo] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function loadCatalogos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      return;
    }

    const [categoriasResult, subcategoriasResult, marcasResult] =
      await Promise.all([
        supabase
          .from("categorias")
          .select("*")
          .eq("activo", true)
          .order("nombre", { ascending: true }),
        supabase
          .from("subcategorias")
          .select("*")
          .eq("activo", true)
          .order("nombre", { ascending: true }),
        supabase
          .from("marcas")
          .select("*")
          .eq("activo", true)
          .order("nombre", { ascending: true }),
      ]);

    if (categoriasResult.error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar categorias: ${categoriasResult.error.message}`,
      });
      return;
    }

    if (subcategoriasResult.error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar subcategorias: ${subcategoriasResult.error.message}`,
      });
      return;
    }

    if (marcasResult.error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar marcas: ${marcasResult.error.message}`,
      });
      return;
    }

    setCategorias((categoriasResult.data ?? []) as Categoria[]);
    setSubcategorias((subcategoriasResult.data ?? []) as Subcategoria[]);
    setMarcas((marcasResult.data ?? []) as Marca[]);
  }

  async function handleCreateCategoria(nombre: string) {
    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return;
    }

    const normalizedName = normalizeSpaces(nombre);

    if (!normalizedName) {
      setMessage({ type: "error", text: "Ingresa el nombre de la categoria." });
      return;
    }

    const exists = categorias.some(
      (categoria) => normalizeKey(categoria.nombre) === normalizeKey(normalizedName),
    );

    if (exists) {
      setMessage({ type: "error", text: "Ya existe una categoria con ese nombre." });
      return;
    }

    setIsSavingCatalogo(true);
    const { error } = await supabase
      .from("categorias")
      .insert({ nombre: normalizedName });
    setIsSavingCatalogo(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo crear la categoria: ${error.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Categoria creada correctamente." });
    await loadCatalogos();
  }

  async function handleCreateSubcategoria(categoriaId: string, nombre: string) {
    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return;
    }

    const normalizedName = normalizeSpaces(nombre);

    if (!categoriaId) {
      setMessage({ type: "error", text: "Selecciona una categoria." });
      return;
    }

    if (!normalizedName) {
      setMessage({
        type: "error",
        text: "Ingresa el nombre de la subcategoria.",
      });
      return;
    }

    const exists = subcategorias.some(
      (subcategoria) =>
        subcategoria.categoria_id === categoriaId &&
        normalizeKey(subcategoria.nombre) === normalizeKey(normalizedName),
    );

    if (exists) {
      setMessage({
        type: "error",
        text: "Ya existe una subcategoria con ese nombre en la categoria seleccionada.",
      });
      return;
    }

    setIsSavingCatalogo(true);
    const { error } = await supabase.from("subcategorias").insert({
      categoria_id: categoriaId,
      nombre: normalizedName,
    });
    setIsSavingCatalogo(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo crear la subcategoria: ${error.message}`,
      });
      return;
    }

    setMessage({ type: "success", text: "Subcategoria creada correctamente." });
    await loadCatalogos();
  }

  async function handleUpdateCategoria(categoriaId: string, nombre: string) {
    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return;
    }

    const normalizedName = normalizeSpaces(nombre);

    if (!categoriaId) {
      setMessage({ type: "error", text: "Selecciona una categoria." });
      return;
    }

    if (!normalizedName) {
      setMessage({ type: "error", text: "Ingresa el nuevo nombre." });
      return;
    }

    const exists = categorias.some(
      (categoria) =>
        categoria.id !== categoriaId &&
        normalizeKey(categoria.nombre) === normalizeKey(normalizedName),
    );

    if (exists) {
      setMessage({
        type: "error",
        text: "Ya existe otra categoria con ese nombre.",
      });
      return;
    }

    setIsSavingCatalogo(true);
    const { error } = await supabase
      .from("categorias")
      .update({ nombre: normalizedName })
      .eq("id", categoriaId);
    setIsSavingCatalogo(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo actualizar la categoria: ${error.message}`,
      });
      return;
    }

    setMessage({
      type: "success",
      text: "Categoria actualizada. Los productos relacionados ya muestran el nuevo nombre.",
    });
    await loadCatalogos();
    await loadProductos();
  }

  async function handleUpdateSubcategoria(
    subcategoriaId: string,
    nombre: string,
  ) {
    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return;
    }

    const normalizedName = normalizeSpaces(nombre);
    const currentSubcategoria = subcategorias.find(
      (subcategoria) => subcategoria.id === subcategoriaId,
    );

    if (!currentSubcategoria) {
      setMessage({ type: "error", text: "Selecciona una subcategoria." });
      return;
    }

    if (!normalizedName) {
      setMessage({ type: "error", text: "Ingresa el nuevo nombre." });
      return;
    }

    const exists = subcategorias.some(
      (subcategoria) =>
        subcategoria.id !== subcategoriaId &&
        subcategoria.categoria_id === currentSubcategoria.categoria_id &&
        normalizeKey(subcategoria.nombre) === normalizeKey(normalizedName),
    );

    if (exists) {
      setMessage({
        type: "error",
        text: "Ya existe otra subcategoria con ese nombre en la misma categoria.",
      });
      return;
    }

    setIsSavingCatalogo(true);
    const { error } = await supabase
      .from("subcategorias")
      .update({ nombre: normalizedName })
      .eq("id", subcategoriaId);
    setIsSavingCatalogo(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo actualizar la subcategoria: ${error.message}`,
      });
      return;
    }

    setMessage({
      type: "success",
      text: "Subcategoria actualizada. Los productos relacionados ya muestran el nuevo nombre.",
    });
    await loadCatalogos();
    await loadProductos();
  }

  async function createMarca(nombre: string): Promise<Marca | null> {
    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return null;
    }

    const normalizedName = normalizeSpaces(nombre);

    if (!normalizedName) {
      setMessage({ type: "error", text: "Ingresa el nombre de la marca." });
      return null;
    }

    const existingMarca = marcas.find(
      (marca) => normalizeKey(marca.nombre) === normalizeKey(normalizedName),
    );

    if (existingMarca) {
      setMessage({
        type: "success",
        text: "La marca ya existia y fue seleccionada.",
      });
      return existingMarca;
    }

    setIsSavingCatalogo(true);
    const { data, error } = await supabase
      .from("marcas")
      .insert({ nombre: normalizedName })
      .select("*")
      .single();
    setIsSavingCatalogo(false);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo crear la marca: ${error.message}`,
      });
      return null;
    }

    const marca = data as Marca;
    setMessage({ type: "success", text: "Marca creada correctamente." });
    await loadCatalogos();
    return marca;
  }

  async function handleCreateMarca(nombre: string) {
    await createMarca(nombre);
  }

  async function loadProductos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase
      .from("productos")
      .select(
        `
          *,
          categorias(nombre),
          subcategorias(nombre),
          marcas(nombre)
        `,
      )
      .order("nombre_producto", { ascending: true });

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar productos: ${error.message}`,
      });
      setProductos([]);
      setIsLoading(false);
      return;
    }

    setProductos((data ?? []) as ProductoConRelaciones[]);
    setIsLoading(false);
  }

  useEffect(() => {
    async function loadData() {
      await loadCatalogos();
      await loadProductos();
    }

    void loadData();
  }, []);

  const filteredProductos = useMemo(() => {
    const term = normalizeSearch(search.trim());

    if (!term) {
      return productos;
    }

    return productos.filter((producto) => {
      const searchable = normalizeSearch(
        [
          producto.codigo_interno,
          producto.nombre_producto,
          producto.marcas?.nombre,
          producto.categorias?.nombre,
          producto.subcategorias?.nombre,
        ]
          .filter(Boolean)
          .join(" "),
      );

      return searchable.includes(term);
    });
  }, [productos, search]);

  async function handleSubmit(values: ProductoFormValues) {
    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return false;
    }

    const { payload, error } = buildProductoPayload(values);

    if (error || !payload) {
      setMessage({ type: "error", text: error ?? "Datos invalidos." });
      return false;
    }

    setIsSaving(true);
    setMessage(null);

    const result = productoEditando
      ? await supabase
          .from("productos")
          .update(payload)
          .eq("id", productoEditando.id)
      : await supabase.from("productos").insert(payload);

    setIsSaving(false);

    if (result.error) {
      setMessage({
        type: "error",
        text: `No se pudo guardar el producto: ${result.error.message}`,
      });
      return false;
    }

    setMessage({
      type: "success",
      text: productoEditando
        ? "Producto actualizado correctamente."
        : "Producto creado correctamente.",
    });
    setProductoEditando(null);
    await loadProductos();
    return true;
  }

  async function handleToggleActivo(producto: Producto) {
    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return;
    }

    const { error } = await supabase
      .from("productos")
      .update({ activo: !producto.activo })
      .eq("id", producto.id);

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo cambiar el estado del producto: ${error.message}`,
      });
      return;
    }

    setMessage({
      type: "success",
      text: producto.activo
        ? "Producto desactivado correctamente."
        : "Producto activado correctamente.",
    });
    await loadProductos();
  }

  function handleEdit(producto: Producto) {
    setProductoEditando(producto);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Layout
      title="Productos"
      description="Gestiona el catalogo del minimarket: productos, stock, precios, imagen principal y estado activo."
    >
      <div className="space-y-5">
        <div className="flex justify-end">
          <Link
            href="/productos/importar"
            className="inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700"
          >
            Importar CSV
          </Link>
        </div>

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
          productoEditando={productoEditando}
          isSaving={isSaving}
          onSubmit={handleSubmit}
          onCancelEdit={() => setProductoEditando(null)}
          onQuickCreateMarca={createMarca}
        />

        <ProductoCatalogManager
          categorias={categorias}
          subcategorias={subcategorias}
          marcas={marcas}
          isSaving={isSavingCatalogo}
          onCreateCategoria={handleCreateCategoria}
          onCreateSubcategoria={handleCreateSubcategoria}
          onCreateMarca={handleCreateMarca}
          onUpdateCategoria={handleUpdateCategoria}
          onUpdateSubcategoria={handleUpdateSubcategoria}
        />

        <ProductoSearch value={search} onChange={setSearch} />

        <ProductoTable
          productos={filteredProductos}
          isLoading={isLoading}
          onEdit={handleEdit}
          onToggleActivo={handleToggleActivo}
        />
      </div>
    </Layout>
  );
}
