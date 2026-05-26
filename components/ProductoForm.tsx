"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/imageUtils";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  combineValidations,
  validatePrice,
} from "@/lib/validators";
import type {
  Almacen,
  Categoria,
  Marca,
  Presentacion,
  Producto,
  ProductoPrecioMayor,
  ProductoPresentacionCompra,
  Subcategoria,
} from "@/types/database";

export type PrecioMayorFormValue = {
  cantidad_minima: string;
  /**
   * El usuario tipea precio TOTAL (mas natural: "medio saco vale S/68").
   * El precio unitario se calcula al guardar: total / cantidad_minima.
   */
  precio_total: string;
  descripcion: string;
};

/**
 * Presentaciones de compra: como se compra/ingresa el producto.
 * Ejemplo: Arroz tiene unidad base "kg" y presentacion "Saco" con
 * unidades_por_presentacion=49 y costo_presentacion=143. Al ingresar
 * stock se eligen sacos y el sistema multiplica para descontar/agregar
 * en kg.
 */
export type PresentacionCompraFormValue = {
  id: string; // id de DB si ya existe; "" si es nueva
  nombre_presentacion: string;
  unidades_por_presentacion: string;
  costo_presentacion: string;
  es_principal: boolean;
};

export type ProductoFormValues = {
  codigo_interno: string;
  categoria_id: string;
  subcategoria_id: string;
  nombre_producto: string;
  marca_id: string;
  presentacion: string;
  stock_minimo: string;
  precio_venta: string;
  imagen_url: string;
  activo: boolean;
  presentacion_compra_id: string;
  presentacion_compra: string;
  unidades_por_presentacion: string;
  precio_compra_presentacion: string;
  stock_cantidad_presentaciones: string;
  stock_unidades_sueltas: string;
  stock_inicial_almacen_id: string;
  /** YYYY-MM-DD opcional: si hay stock inicial y se completa, crea un lote. */
  stock_inicial_fecha_vencimiento: string;
  precios_mayor: PrecioMayorFormValue[];
  presentaciones_compra: PresentacionCompraFormValue[];
  producto_base_id: string;
  unidades_equivalentes: string;
  unidad_base: string;
};

export type ProductoBaseOption = {
  id: string;
  nombre_producto: string;
  presentacion: string | null;
  codigo_interno: string | null;
};

type ProductoFormProps = {
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  marcas: Marca[];
  presentaciones: Presentacion[];
  presentacionesCompra?: ProductoPresentacionCompra[];
  preciosMayor?: ProductoPrecioMayor[];
  productoEditando?: Producto | null;
  productosBase?: ProductoBaseOption[];
  almacenes?: Almacen[];
  isSaving: boolean;
  onSubmit: (values: ProductoFormValues) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  onCancelEdit?: () => void;
  onQuickCreateCategoria?: (nombre: string) => Promise<Categoria | null>;
  onQuickCreateSubcategoria?: (
    categoriaId: string,
    nombre: string,
  ) => Promise<Subcategoria | null>;
  onQuickCreateMarca?: (nombre: string) => Promise<Marca | null>;
  onQuickCreatePresentacion?: (nombre: string) => Promise<Presentacion | null>;
};

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageSize = 1024 * 1024;
const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

const emptyValues: ProductoFormValues = {
  codigo_interno: "",
  categoria_id: "",
  subcategoria_id: "",
  nombre_producto: "",
  marca_id: "",
  presentacion: "",
  stock_minimo: "10",
  precio_venta: "1.00",
  imagen_url: "",
  activo: true,
  presentacion_compra_id: "",
  presentacion_compra: "UND",
  unidades_por_presentacion: "1",
  precio_compra_presentacion: "",
  stock_cantidad_presentaciones: "0",
  stock_unidades_sueltas: "0",
  stock_inicial_almacen_id: "",
  stock_inicial_fecha_vencimiento: "",
  precios_mayor: [],
  presentaciones_compra: [],
  producto_base_id: "",
  unidades_equivalentes: "1",
  unidad_base: "und",
};

function toInputValue(value: string | number | null, fallback = "") {
  return value === null ? fallback : String(value);
}

function getInitialValues({
  producto,
  presentacionesCompra,
  preciosMayor,
}: {
  producto: Producto | null | undefined;
  presentacionesCompra: ProductoPresentacionCompra[];
  preciosMayor: ProductoPrecioMayor[];
}): ProductoFormValues {
  if (!producto) {
    return emptyValues;
  }

  const presentacionPrincipal =
    presentacionesCompra.find((item) => item.es_principal && item.activo) ??
    presentacionesCompra.find((item) => item.activo) ??
    null;
  const preciosMayorValues = preciosMayor.map((precio) => {
    // Si el registro ya tiene precio_total guardado, usalo; si no, calculalo
    // desde precio_unitario × cantidad_minima (compatibilidad con data vieja).
    const cantidad = Number(precio.cantidad_minima ?? 0);
    const total =
      precio.precio_total != null && precio.precio_total !== undefined
        ? Number(precio.precio_total)
        : cantidad > 0
          ? Number(precio.precio_unitario ?? 0) * cantidad
          : 0;
    return {
      cantidad_minima: toInputValue(precio.cantidad_minima),
      precio_total: total > 0 ? Number(total.toFixed(2)).toString() : "",
      descripcion: precio.descripcion ?? "",
    };
  });

  // Solo cargamos presentaciones de compra que tengan unidades > 1
  // (la principal "x1 unidad" se maneja implicita desde precio_compra
  // unidad y no aparece en esta lista).
  const presentacionesCompraValues: PresentacionCompraFormValue[] = presentacionesCompra
    .filter((p) => p.activo && Number(p.unidades_por_presentacion ?? 1) > 1)
    .map((p) => ({
      id: p.id,
      nombre_presentacion: p.nombre_presentacion,
      unidades_por_presentacion: toInputValue(p.unidades_por_presentacion ?? 1),
      costo_presentacion: toInputValue(p.costo_presentacion ?? ""),
      es_principal: Boolean(p.es_principal),
    }));

  return {
    codigo_interno: producto.codigo_interno,
    categoria_id: producto.categoria_id,
    subcategoria_id: producto.subcategoria_id,
    nombre_producto: producto.nombre_producto,
    marca_id: producto.marca_id,
    presentacion: producto.presentacion ?? "",
    stock_minimo: toInputValue(producto.stock_minimo, "10"),
    precio_venta: toInputValue(producto.precio_venta, "1.00"),
    imagen_url: producto.imagen_url ?? "",
    activo: producto.activo,
    presentacion_compra_id: presentacionPrincipal?.id ?? "",
    presentacion_compra: presentacionPrincipal?.nombre_presentacion ?? "UND",
    unidades_por_presentacion: toInputValue(
      presentacionPrincipal?.unidades_por_presentacion ?? 1,
      "1",
    ),
    // Preferir precio por UNIDAD ya guardado. Si no hay, calcularlo desde
    // la presentacion principal (costo total / unidades). Antes este campo
    // tomaba directamente el costo_presentacion, lo que hacia que al
    // editar y guardar se sobrescribiera precio_compra_referencial con el
    // costo TOTAL de la presentacion (bug visible: "Precio compra unidad"
    // = S/31.99 cuando deberia ser S/1.78 para una plancha x18 a S/31.99).
    precio_compra_presentacion: (() => {
      if (
        producto.precio_compra_referencial != null &&
        Number(producto.precio_compra_referencial) > 0
      ) {
        return toInputValue(producto.precio_compra_referencial);
      }
      const costoTotal = Number(presentacionPrincipal?.costo_presentacion ?? 0);
      const unidades = Number(
        presentacionPrincipal?.unidades_por_presentacion ?? 1,
      );
      if (
        Number.isFinite(costoTotal) &&
        costoTotal > 0 &&
        Number.isFinite(unidades) &&
        unidades > 0
      ) {
        return (costoTotal / unidades).toFixed(2);
      }
      return "";
    })(),
    stock_cantidad_presentaciones: "0",
    stock_unidades_sueltas: "0",
    stock_inicial_almacen_id: "",
    stock_inicial_fecha_vencimiento: "",
    precios_mayor: preciosMayorValues,
    presentaciones_compra: presentacionesCompraValues,
    producto_base_id: producto.producto_base_id ?? "",
    unidades_equivalentes: toInputValue(producto.unidades_equivalentes ?? 1, "1"),
    unidad_base: producto.unidad_base ?? "und",
  };
}

export function ProductoForm({
  categorias,
  subcategorias,
  marcas,
  presentaciones,
  presentacionesCompra = [],
  preciosMayor = [],
  productoEditando,
  productosBase = [],
  almacenes = [],
  isSaving,
  onSubmit,
  onDelete,
  onCancelEdit,
  onQuickCreateCategoria,
  onQuickCreateSubcategoria,
  onQuickCreateMarca,
  onQuickCreatePresentacion,
}: ProductoFormProps) {
  const [values, setValues] = useState<ProductoFormValues>(() =>
    getInitialValues({ producto: productoEditando, presentacionesCompra, preciosMayor }),
  );
  const [quickCatalogOpen, setQuickCatalogOpen] = useState(false);
  const [quickCategoria, setQuickCategoria] = useState("");
  const [quickSubcategoria, setQuickSubcategoria] = useState("");
  const [quickMarca, setQuickMarca] = useState("");
  const [quickPresentacion, setQuickPresentacion] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageError, setImageError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  // Modos de las cantidades de stock: "" = unidad base; "idx-N" = una de
  // las presentaciones_compra (indice N). Asi el usuario tipea "4" y elige
  // "Saco x49" y el sistema sabe que son 196 kg al guardar.
  const [stockMinimoMode, setStockMinimoMode] = useState<string>("");
  const [stockInicialMode, setStockInicialMode] = useState<string>("");

  function getModeFactor(mode: string): { factor: number; label: string } {
    if (mode.startsWith("idx-")) {
      const idx = Number(mode.slice(4));
      const pres = values.presentaciones_compra[idx];
      if (pres) {
        const factor = Number(pres.unidades_por_presentacion);
        if (Number.isFinite(factor) && factor > 0) {
          return { factor, label: pres.nombre_presentacion || `Pres. x${factor}` };
        }
      }
    }
    return { factor: 1, label: values.unidad_base || "unidad" };
  }

  useEffect(() => {
    setValues(getInitialValues({ producto: productoEditando, presentacionesCompra, preciosMayor }));
    clearSelectedImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoEditando?.id, presentacionesCompra.length, preciosMayor.length]);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const subcategoriasDisponibles = useMemo(() => {
    if (!values.categoria_id) {
      return subcategorias;
    }

    return subcategorias.filter(
      (subcategoria) => subcategoria.categoria_id === values.categoria_id,
    );
  }, [subcategorias, values.categoria_id]);
  // El stock inicial es ahora directo en unidades. La nocion de
  // "presentaciones * unidades por presentacion + sueltas" se elimino:
  // los productos-presentacion (Plancha x6) ya tienen ese factor en
  // unidades_equivalentes y vinculan al producto base.
  const stockInicialUnidades = useMemo(() => {
    const valor = Number(values.stock_cantidad_presentaciones);
    return Number.isFinite(valor) && valor > 0 ? valor : 0;
  }, [values.stock_cantidad_presentaciones]);

  function updateValue<Key extends keyof ProductoFormValues>(
    key: Key,
    value: ProductoFormValues[Key],
  ) {
    setValues((current) => ({
      ...current,
      [key]: value,
      ...(key === "categoria_id" ? { subcategoria_id: "" } : {}),
    }));
  }

  function clearSelectedImage() {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(null);
    setImagePreview("");
    setImageError("");
  }

  /**
   * Quita la foto del producto: borra del storage si la URL apunta a
   * nuestro bucket, y limpia imagen_url en el form. El usuario debe
   * guardar despues para persistir el cambio en la BD.
   */
  async function removeStoredImage() {
    if (!values.imagen_url) {
      clearSelectedImage();
      return;
    }
    if (typeof window !== "undefined" && !window.confirm("¿Eliminar la foto del producto?")) {
      return;
    }
    if (supabase) {
      try {
        const url = new URL(values.imagen_url);
        // URL publica de Supabase Storage tiene la forma
        // /storage/v1/object/public/productos/<path>
        const marker = "/storage/v1/object/public/productos/";
        const idx = url.pathname.indexOf(marker);
        if (idx >= 0) {
          const objectPath = url.pathname.slice(idx + marker.length);
          if (objectPath) {
            await supabase.storage.from("productos").remove([objectPath]);
          }
        }
      } catch {
        // Si no es URL de nuestro storage (ej. enlace manual), solo
        // limpiamos el campo sin tocar storage.
      }
    }
    updateValue("imagen_url", "");
    clearSelectedImage();
  }

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    clearSelectedImage();

    if (!file) {
      return;
    }

    if (!allowedImageTypes.includes(file.type)) {
      setImageError("La imagen debe ser jpg, jpeg, png o webp.");
      event.target.value = "";
      return;
    }

    // Si pesa mas del limite, comprimir automaticamente (resize + JPEG).
    let finalFile = file;
    if (file.size > maxImageSize) {
      try {
        finalFile = await compressImage(file, { maxSizeBytes: maxImageSize });
      } catch (err) {
        setImageError(
          err instanceof Error
            ? err.message
            : "La imagen es muy grande y no se pudo comprimir.",
        );
        event.target.value = "";
        return;
      }
    }

    setImageFile(finalFile);
    setImagePreview(URL.createObjectURL(finalFile));
  }

  function buildImagePath(file: File) {
    const codeOrName =
      values.codigo_interno.trim() ||
      values.nombre_producto.trim() ||
      "producto";
    const safeCodigo = codeOrName.replace(/[^a-zA-Z0-9-_]/g, "-");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";

    return `imagenes/${safeCodigo}-${Date.now()}.${extension}`;
  }

  async function uploadSelectedImage() {
    if (!imageFile) {
      return values.imagen_url;
    }

    if (!supabase) {
      setImageError(
        supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      );
      return null;
    }

    setIsUploadingImage(true);
    const imagePath = buildImagePath(imageFile);
    const { error } = await supabase.storage
      .from("productos")
      .upload(imagePath, imageFile, {
        cacheControl: "3600",
        contentType: imageFile.type,
        upsert: false,
      });
    setIsUploadingImage(false);

    if (error) {
      setImageError(`No se pudo subir la imagen: ${error.message}`);
      return null;
    }

    const { data } = supabase.storage.from("productos").getPublicUrl(imagePath);
    return data.publicUrl;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImageError("");

    // Validaciones obligatorias antes de subir imagen y guardar.
    const validations = combineValidations(
      validatePrice(values.precio_venta, { label: "Precio de venta" }),
    );
    if (values.precio_compra_presentacion !== "") {
      const precioCompra = validatePrice(values.precio_compra_presentacion, {
        label: "Precio de compra",
        allowZero: true,
      });
      if (!precioCompra.ok) {
        setImageError(precioCompra.error);
        return;
      }
    }
    if (!validations.ok) {
      setImageError(validations.error);
      return;
    }

    const uploadedUrl = await uploadSelectedImage();

    if (uploadedUrl === null) {
      return;
    }

    // Aplicar factores de los toggles (saco/kg) al guardar:
    const stockMinNum = Number(values.stock_minimo);
    const stockMinFactor = getModeFactor(stockMinimoMode).factor;
    const stockMinFinal = Number.isFinite(stockMinNum)
      ? String(stockMinNum * stockMinFactor)
      : values.stock_minimo;

    const stockInicialNum = Number(values.stock_cantidad_presentaciones);
    const stockInicialFactor = getModeFactor(stockInicialMode).factor;
    const stockInicialFinal = Number.isFinite(stockInicialNum)
      ? String(stockInicialNum * stockInicialFactor)
      : values.stock_cantidad_presentaciones;

    const saved = await onSubmit({
      ...values,
      imagen_url: uploadedUrl,
      stock_minimo: stockMinFinal,
      stock_cantidad_presentaciones: stockInicialFinal,
    });

    if (saved && !productoEditando) {
      setValues(emptyValues);
      clearSelectedImage();
    }
  }

  function updatePrecioMayor(
    index: number,
    key: keyof PrecioMayorFormValue,
    value: string,
  ) {
    setValues((current) => ({
      ...current,
      precios_mayor: current.precios_mayor.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    }));
  }

  function addPrecioMayor() {
    setValues((current) => ({
      ...current,
      precios_mayor: [
        ...current.precios_mayor,
        { cantidad_minima: "", precio_total: "", descripcion: "" },
      ],
    }));
  }

  function removePrecioMayor(index: number) {
    setValues((current) => ({
      ...current,
      precios_mayor: current.precios_mayor.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updatePresentacionCompra(
    index: number,
    key: keyof PresentacionCompraFormValue,
    value: string | boolean,
  ) {
    setValues((current) => ({
      ...current,
      presentaciones_compra: current.presentaciones_compra.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    }));
  }

  function setPresentacionPrincipal(index: number) {
    setValues((current) => ({
      ...current,
      presentaciones_compra: current.presentaciones_compra.map((item, i) => ({
        ...item,
        es_principal: i === index,
      })),
    }));
  }

  function addPresentacionCompra() {
    setValues((current) => ({
      ...current,
      presentaciones_compra: [
        ...current.presentaciones_compra,
        {
          id: "",
          nombre_presentacion: "",
          unidades_por_presentacion: "",
          costo_presentacion: "",
          es_principal: current.presentaciones_compra.length === 0,
        },
      ],
    }));
  }

  function removePresentacionCompra(index: number) {
    setValues((current) => ({
      ...current,
      presentaciones_compra: current.presentaciones_compra.filter((_, i) => i !== index),
    }));
  }

  async function handleQuickCategoria() {
    if (!onQuickCreateCategoria) {
      return;
    }

    const categoria = await onQuickCreateCategoria(quickCategoria);
    if (categoria) {
      updateValue("categoria_id", categoria.id);
      setQuickCategoria("");
    }
  }

  async function handleQuickSubcategoria() {
    if (!onQuickCreateSubcategoria) {
      return;
    }

    const subcategoria = await onQuickCreateSubcategoria(
      values.categoria_id,
      quickSubcategoria,
    );
    if (subcategoria) {
      updateValue("subcategoria_id", subcategoria.id);
      setQuickSubcategoria("");
    }
  }

  async function handleQuickMarca() {
    if (!onQuickCreateMarca) {
      return;
    }

    const marca = await onQuickCreateMarca(quickMarca);
    if (marca) {
      updateValue("marca_id", marca.id);
      setQuickMarca("");
    }
  }

  async function handleQuickPresentacion() {
    if (!onQuickCreatePresentacion) {
      return;
    }

    const presentacion = await onQuickCreatePresentacion(quickPresentacion);
    if (presentacion) {
      updateValue("presentacion", presentacion.nombre);
      updateValue("presentacion_compra", presentacion.nombre);
      setQuickPresentacion("");
    }
  }

  const hasCatalogOptions =
    categorias.length > 0 &&
    subcategorias.length > 0 &&
    marcas.length > 0 &&
    presentaciones.length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5 pb-24 sm:pb-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            {productoEditando ? "Editar producto" : "Nuevo producto"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            El codigo se genera automaticamente al guardar. Registra compra,
            unidades y precio de venta por unidad.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setQuickCatalogOpen((current) => !current)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Catalogos rapidos
          </button>
          {productoEditando && onCancelEdit ? (
            <button
              type="button"
              onClick={onCancelEdit}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </div>

      {!hasCatalogOptions ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Para crear productos necesitas al menos una categoria, una
          subcategoria, una marca y una presentacion activas.
        </p>
      ) : null}

      {quickCatalogOpen ? (
        <section className="mt-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-4">
          <QuickCreate
            label="Nueva categoria"
            value={quickCategoria}
            onChange={setQuickCategoria}
            onCreate={handleQuickCategoria}
          />
          <QuickCreate
            label="Nueva subcategoria"
            value={quickSubcategoria}
            onChange={setQuickSubcategoria}
            onCreate={handleQuickSubcategoria}
            helper="Usa la categoria seleccionada."
          />
          <QuickCreate
            label="Nueva marca"
            value={quickMarca}
            onChange={setQuickMarca}
            onCreate={handleQuickMarca}
          />
          <QuickCreate
            label="Nueva presentacion"
            value={quickPresentacion}
            onChange={setQuickPresentacion}
            onCreate={handleQuickPresentacion}
          />
        </section>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Nombre producto" required>
          <input
            type="text"
            value={values.nombre_producto}
            onChange={(event) =>
              updateValue("nombre_producto", event.target.value)
            }
            className={inputClassName}
          />
        </Field>

        <Field label="Categoria" required>
          <SearchableSelect
            value={values.categoria_id}
            onChange={(id) => updateValue("categoria_id", id)}
            options={categorias.map((c) => ({ id: c.id, label: c.nombre }))}
            placeholder="Buscar categoria..."
          />
        </Field>

        <Field label="Subcategoria" required>
          <SearchableSelect
            value={values.subcategoria_id}
            onChange={(id) => updateValue("subcategoria_id", id)}
            options={subcategoriasDisponibles.map((s) => ({
              id: s.id,
              label: s.nombre,
            }))}
            placeholder={
              values.categoria_id ? "Buscar subcategoria..." : "Elegi categoria primero"
            }
            disabled={!values.categoria_id}
          />
        </Field>

        <Field label="Marca" required>
          <SearchableSelect
            value={values.marca_id}
            onChange={(id) => updateValue("marca_id", id)}
            options={marcas.map((m) => ({ id: m.id, label: m.nombre }))}
            placeholder="Escribe la marca..."
          />
        </Field>

        <Field label="Presentacion" required>
          {/* Presentacion usa nombre como id (legacy), no UUID. */}
          <SearchableSelect
            value={values.presentacion}
            onChange={(nombre) => {
              updateValue("presentacion", nombre);
              updateValue("presentacion_compra", nombre);
            }}
            options={presentaciones.map((p) => ({
              id: p.nombre,
              label: p.nombre,
            }))}
            placeholder="Buscar presentacion..."
          />
        </Field>

        <Field label="Unidad base">
          <input
            value={values.unidad_base}
            onChange={(event) => updateValue("unidad_base", event.target.value)}
            placeholder="kg, und, lt, ml..."
            className={inputClassName}
          />
          <p className="mt-1 text-xs text-slate-500">
            En que se cuenta el stock. Ej: arroz=kg, gaseosa=und, aceite=lt.
            Por defecto: und.
          </p>
        </Field>

          <Field label="Precio compra unidad">
            <input
              type="number"
              step="0.01"
              min="0"
              value={values.precio_compra_presentacion}
              onChange={(event) =>
                updateValue("precio_compra_presentacion", event.target.value)
              }
              className={inputClassName}
            />
            {(() => {
              // Helper visual: muestra el equivalente por presentacion para
              // que el usuario no confunda "por unidad" con "por plancha".
              const principal = values.presentaciones_compra.find(
                (p) => p.es_principal,
              );
              const unidades = Number(principal?.unidades_por_presentacion ?? 0);
              const porUnidad = Number(values.precio_compra_presentacion);
              if (
                principal &&
                Number.isFinite(unidades) &&
                unidades > 1 &&
                Number.isFinite(porUnidad) &&
                porUnidad > 0
              ) {
                const porPresentacion = porUnidad * unidades;
                const nombre =
                  principal.nombre_presentacion || `Pres. x${unidades}`;
                return (
                  <p className="mt-1 text-xs text-slate-500">
                    ≡ S/ {porPresentacion.toFixed(2)} por {nombre} (x{unidades}).
                  </p>
                );
              }
              return (
                <p className="mt-1 text-xs text-slate-500">
                  Costo por {values.unidad_base || "unidad"} (no por presentacion).
                </p>
              );
            })()}
          </Field>

          <Field label="Precio venta unidad">
            <input
              type="number"
              step="0.01"
              min="0"
              value={values.precio_venta}
              onChange={(event) => updateValue("precio_venta", event.target.value)}
              className={inputClassName}
            />
          </Field>

          {!productoEditando ? (
            <>
              <Field label={stockInicialUnidades > 0 ? "Almacen del stock inicial *" : "Almacen del stock inicial (opcional)"}>
                <select
                  value={values.stock_inicial_almacen_id}
                  onChange={(event) =>
                    updateValue("stock_inicial_almacen_id", event.target.value)
                  }
                  className={inputClassName}
                >
                  <option value="">{stockInicialUnidades > 0 ? "Elige almacen..." : "Sin stock inicial"}</option>
                  {almacenes.map((almacen) => (
                    <option key={almacen.id} value={almacen.id}>
                      {almacen.nombre}
                    </option>
                  ))}
                </select>
                {stockInicialUnidades > 0 && !values.stock_inicial_almacen_id ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Si dejas el almacen vacio, el stock no se registrara y arrancara en 0.
                  </p>
                ) : null}
              </Field>
              <Field label="Stock">
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={values.stock_cantidad_presentaciones}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      updateValue("stock_cantidad_presentaciones", event.target.value)
                    }
                    className={`${inputClassName} flex-1`}
                  />
                  <select
                    value={stockInicialMode}
                    onChange={(event) => setStockInicialMode(event.target.value)}
                    className="h-11 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-sm"
                  >
                    <option value="">{values.unidad_base || "unidad"}</option>
                    {values.presentaciones_compra.map((pres, i) => (
                      <option key={i} value={`idx-${i}`}>
                        {pres.nombre_presentacion || `Pres ${i + 1}`} (x{pres.unidades_por_presentacion})
                      </option>
                    ))}
                  </select>
                </div>
                {(() => {
                  const { factor, label } = getModeFactor(stockInicialMode);
                  const num = Number(values.stock_cantidad_presentaciones);
                  if (!Number.isFinite(num) || num <= 0) {
                    return (
                      <p className="mt-1 text-xs text-slate-500">
                        Si dejas 0, lo agregas despues desde Almacenes.
                      </p>
                    );
                  }
                  const equivalente = num * factor;
                  return (
                    <p className="mt-1 text-xs text-emerald-700">
                      = {equivalente.toFixed(2).replace(/\.00$/, "")} {values.unidad_base || "unidades"} ({num} {label})
                    </p>
                  );
                })()}
              </Field>
              <Field label="Fecha vencimiento (opcional)">
                <input
                  type="date"
                  value={values.stock_inicial_fecha_vencimiento}
                  onChange={(event) =>
                    updateValue("stock_inicial_fecha_vencimiento", event.target.value)
                  }
                  disabled={stockInicialUnidades <= 0}
                  className={
                    inputClassName +
                    (stockInicialUnidades > 0 ? "" : " bg-slate-50 text-slate-400")
                  }
                />
                <p className="mt-1 text-xs text-slate-500">
                  Si lo dejas vacio, no se registra lote (productos no perecederos).
                </p>
              </Field>
            </>
          ) : null}

        <Field label="Stock minimo">
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={values.stock_minimo}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => updateValue("stock_minimo", event.target.value)}
              className={`${inputClassName} flex-1`}
            />
            <select
              value={stockMinimoMode}
              onChange={(event) => setStockMinimoMode(event.target.value)}
              className="h-11 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="">{values.unidad_base || "unidad"}</option>
              {values.presentaciones_compra.map((pres, i) => (
                <option key={i} value={`idx-${i}`}>
                  {pres.nombre_presentacion || `Pres ${i + 1}`} (x{pres.unidades_por_presentacion})
                </option>
              ))}
            </select>
          </div>
          {(() => {
            const { factor, label } = getModeFactor(stockMinimoMode);
            const num = Number(values.stock_minimo);
            if (!Number.isFinite(num) || num <= 0) return null;
            const equivalente = num * factor;
            return (
              <p className="mt-1 text-xs text-slate-500">
                Alerta cuando queden ≤ {equivalente.toFixed(2).replace(/\.00$/, "")} {values.unidad_base || "unidades"} ({num} {label}).
              </p>
            );
          })()}
        </Field>

        <Field label="Imagen URL">
          <input
            type="url"
            value={values.imagen_url}
            onChange={(event) => updateValue("imagen_url", event.target.value)}
            placeholder="https://..."
            className={inputClassName}
          />
        </Field>

        <Field label="Foto del producto">
          <div className="grid gap-2 sm:grid-cols-2">
            {/* Galeria: en mobile abre selector. En desktop abre el dialog
                de archivo. Sin atributo capture. */}
            <label className="flex h-11 cursor-pointer items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700">
              Subir imagen
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="sr-only"
              />
            </label>
            {/* Camara: en mobile abre la camara trasera directamente. En
                desktop muchos navegadores caen al selector normal. */}
            <label className="flex h-11 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Tomar foto
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={handleImageChange}
                className="sr-only"
              />
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            JPG, PNG o WebP. Si pesa mas de 1 MB se comprime automaticamente.
          </p>
          {imageError ? (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {imageError}
            </p>
          ) : null}
        </Field>
      </div>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              Precios por mayor
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Define desde cuantas unidades aplica un precio especial.
            </p>
          </div>
          <button
            type="button"
            onClick={addPrecioMayor}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Agregar escala
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {values.precios_mayor.map((precio, index) => {
            const cantidad = Number(precio.cantidad_minima);
            const total = Number(precio.precio_total);
            const unitarioCalc =
              Number.isFinite(cantidad) && cantidad > 0 && Number.isFinite(total) && total > 0
                ? total / cantidad
                : null;
            return (
              <div key={index} className="rounded-md border border-slate-200 p-3">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={precio.cantidad_minima}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      updatePrecioMayor(index, "cantidad_minima", event.target.value)
                    }
                    placeholder={`Desde ${values.unidad_base || "unidades"}`}
                    className={inputClassName}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={precio.precio_total}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      updatePrecioMayor(index, "precio_total", event.target.value)
                    }
                    placeholder="S/ total"
                    className={inputClassName}
                  />
                  <input
                    value={precio.descripcion}
                    onChange={(event) =>
                      updatePrecioMayor(index, "descripcion", event.target.value)
                    }
                    placeholder="Ej. medio saco S/68"
                    className={inputClassName}
                  />
                  <button
                    type="button"
                    onClick={() => removePrecioMayor(index)}
                    className="h-11 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Quitar
                  </button>
                </div>
                {unitarioCalc !== null ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Equivale a S/ {unitarioCalc.toFixed(2)} por {values.unidad_base || "unidad"}.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              Presentaciones de compra
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Como compras este producto: saco x49, caja x12, etc. Sirve para
              ingresar stock por presentacion (el sistema multiplica por las
              unidades). La unidad base sigue siendo {values.unidad_base || "1 unidad"}.
            </p>
          </div>
          <button
            type="button"
            onClick={addPresentacionCompra}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Agregar presentacion
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {values.presentaciones_compra.length === 0 ? (
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
              Sin presentaciones extra. Si solo compras por unidad base, dejalo
              vacio.
            </p>
          ) : null}
          {values.presentaciones_compra.map((pres, index) => (
            <div
              key={pres.id || index}
              className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto_auto]"
            >
              <input
                value={pres.nombre_presentacion}
                onChange={(event) =>
                  updatePresentacionCompra(index, "nombre_presentacion", event.target.value)
                }
                placeholder="Saco, Caja, Pack..."
                className={inputClassName}
              />
              <input
                type="number"
                step="0.01"
                min="1"
                value={pres.unidades_por_presentacion}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) =>
                  updatePresentacionCompra(index, "unidades_por_presentacion", event.target.value)
                }
                placeholder={`Cantidad en ${values.unidad_base || "unidades"}`}
                className={inputClassName}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={pres.costo_presentacion}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) =>
                  updatePresentacionCompra(index, "costo_presentacion", event.target.value)
                }
                placeholder="Costo total"
                className={inputClassName}
              />
              <label className="flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700">
                <input
                  type="radio"
                  name="presentacion_principal"
                  checked={pres.es_principal}
                  onChange={() => setPresentacionPrincipal(index)}
                  className="h-4 w-4 text-emerald-700"
                />
                Principal
              </label>
              <button
                type="button"
                onClick={() => removePresentacionCompra(index)}
                className="h-11 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Vinculo a producto base</h3>
            <p className="mt-1 text-sm text-slate-600">
              Si este producto es una presentacion de otro (ej. plancha x6 de papel),
              elige el producto base y cuantas unidades base equivale 1 de este. El stock
              se descontara y mostrara unificado en el producto base.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Producto base (opcional)</span>
            <span className="mt-1 block">
              <SearchableSelect
                value={values.producto_base_id}
                onChange={(id) => updateValue("producto_base_id", id)}
                options={productosBase
                  .filter((option) => option.id !== productoEditando?.id)
                  .map((option) => ({
                    id: option.id,
                    label:
                      option.nombre_producto +
                      (option.presentacion ? " - " + option.presentacion : ""),
                    sub: option.codigo_interno ?? undefined,
                  }))}
                placeholder="Sin vinculo (este ES el producto base)"
                emptyText="Sin productos base coincidentes"
              />
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Unidades base equivalentes a 1 presentacion</span>
            <span className="mt-1 block">
              <input
                type="number"
                step="0.01"
                min="1"
                value={values.unidades_equivalentes}
                onChange={(event) => updateValue("unidades_equivalentes", event.target.value)}
                disabled={!values.producto_base_id}
                className={inputClassName + (values.producto_base_id ? "" : " bg-slate-50 text-slate-400") }
              />
            </span>
          </label>
        </div>
        {values.producto_base_id ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            Al registrar o vender 1 unidad de este producto se afectaran{" "}
            <strong>{Number(values.unidades_equivalentes || 1)}</strong> unidades del producto base seleccionado.
          </p>
        ) : null}
      </section>

      {imagePreview || values.imagen_url ? (
        <div className="mt-4 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview || values.imagen_url}
            alt="Vista previa del producto"
            className="h-20 w-20 rounded-md border border-slate-200 object-cover"
          />
          <div className="min-w-0 flex-1 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Preview de imagen</p>
            <p className="mt-1 break-all text-xs">
              {imageFile ? imageFile.name : values.imagen_url}
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {imageFile ? (
                <button
                  type="button"
                  onClick={clearSelectedImage}
                  className="text-xs font-medium text-slate-700 hover:text-slate-950"
                >
                  Quitar seleccion
                </button>
              ) : null}
              {values.imagen_url && !imageFile ? (
                <button
                  type="button"
                  onClick={() => void removeStoredImage()}
                  className="text-xs font-medium text-red-700 hover:text-red-800"
                >
                  Eliminar foto
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <label className="mt-4 flex w-fit items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={values.activo}
          onChange={(event) => updateValue("activo", event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-emerald-700"
        />
        Producto activo
      </label>

      {/* Botonera desktop (oculta en mobile) */}
      <div className="mt-5 hidden gap-3 sm:flex sm:justify-between">
        {productoEditando && onDelete ? (
          <button
            type="button"
            disabled={isSaving || isUploadingImage}
            onClick={() => void onDelete()}
            className="h-11 rounded-md border border-red-200 px-5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Eliminar producto
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={isSaving || isUploadingImage || !hasCatalogOptions}
          className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSaving || isUploadingImage
            ? "Guardando..."
            : productoEditando
              ? "Guardar cambios"
              : "Crear producto"}
        </button>
      </div>

      {/* Botonera sticky mobile (oculta en >=sm) */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-slate-200 bg-white p-3 shadow-lg sm:hidden">
        {productoEditando && onDelete ? (
          <button
            type="button"
            disabled={isSaving || isUploadingImage}
            onClick={() => void onDelete()}
            className="h-12 shrink-0 rounded-md border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
            aria-label="Eliminar producto"
          >
            Eliminar
          </button>
        ) : null}
        <button
          type="submit"
          disabled={isSaving || isUploadingImage || !hasCatalogOptions}
          className="h-12 flex-1 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSaving || isUploadingImage
            ? "Guardando..."
            : productoEditando
              ? "Guardar cambios"
              : "Crear producto"}
        </button>
      </div>
    </form>
  );
}

function QuickCreate({
  label,
  value,
  helper,
  onChange,
  onCreate,
}: {
  label: string;
  value: string;
  helper?: string;
  onChange: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1 flex gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={inputClassName}
        />
        <button
          type="button"
          onClick={onCreate}
          className="h-11 shrink-0 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-white"
        >
          Crear
        </button>
      </div>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
