"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
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
  precio_unitario: string;
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
  const preciosMayorValues = preciosMayor.map((precio) => ({
    cantidad_minima: toInputValue(precio.cantidad_minima),
    precio_unitario: toInputValue(precio.precio_unitario),
    descripcion: precio.descripcion ?? "",
  }));

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
    precio_compra_presentacion: toInputValue(
      presentacionPrincipal?.costo_presentacion ?? producto.precio_compra_referencial,
    ),
    stock_cantidad_presentaciones: "0",
    stock_unidades_sueltas: "0",
    stock_inicial_almacen_id: "",
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

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
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

    if (file.size > maxImageSize) {
      setImageError("La imagen no debe superar 1 MB.");
      event.target.value = "";
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
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

    const saved = await onSubmit({ ...values, imagen_url: uploadedUrl });

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
        { cantidad_minima: "", precio_unitario: "", descripcion: "" },
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
          <select
            value={values.categoria_id}
            onChange={(event) => updateValue("categoria_id", event.target.value)}
            className={inputClassName}
          >
            <option value="">Seleccionar</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Subcategoria" required>
          <select
            value={values.subcategoria_id}
            onChange={(event) =>
              updateValue("subcategoria_id", event.target.value)
            }
            className={inputClassName}
          >
            <option value="">Seleccionar</option>
            {subcategoriasDisponibles.map((subcategoria) => (
              <option key={subcategoria.id} value={subcategoria.id}>
                {subcategoria.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Marca" required>
          <select
            value={values.marca_id}
            onChange={(event) => updateValue("marca_id", event.target.value)}
            className={inputClassName}
          >
            <option value="">Seleccionar</option>
            {marcas.map((marca) => (
              <option key={marca.id} value={marca.id}>
                {marca.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Presentacion" required>
          <select
            value={values.presentacion}
            onChange={(event) => {
              updateValue("presentacion", event.target.value);
              updateValue("presentacion_compra", event.target.value);
            }}
            className={inputClassName}
          >
            <option value="">Seleccionar</option>
            {presentaciones.map((presentacion) => (
              <option key={presentacion.id} value={presentacion.nombre}>
                {presentacion.nombre}
              </option>
            ))}
          </select>
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
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={values.stock_cantidad_presentaciones}
                  onChange={(event) =>
                    updateValue("stock_cantidad_presentaciones", event.target.value)
                  }
                  className={inputClassName}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Cantidad inicial en unidades. Si dejas 0, lo agregas despues desde
                  Almacenes &rarr; Agregar stock.
                </p>
              </Field>
            </>
          ) : null}

        <Field label="Stock minimo">
          <input
            type="number"
            step="0.01"
            min="0"
            value={values.stock_minimo}
            onChange={(event) => updateValue("stock_minimo", event.target.value)}
            className={inputClassName}
          />
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

        <Field label="Subir imagen">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageChange}
            className="block w-full text-sm text-slate-700 file:mr-3 file:h-10 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
          />
          <p className="mt-1 text-xs text-slate-500">
            JPG, PNG o WebP. Tamano maximo 1 MB.
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
          {values.precios_mayor.map((precio, index) => (
            <div key={index} className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
              <input
                type="number"
                step="0.01"
                min="1"
                value={precio.cantidad_minima}
                onChange={(event) =>
                  updatePrecioMayor(index, "cantidad_minima", event.target.value)
                }
                placeholder="Desde unidades"
                className={inputClassName}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={precio.precio_unitario}
                onChange={(event) =>
                  updatePrecioMayor(index, "precio_unitario", event.target.value)
                }
                placeholder="Precio unitario"
                className={inputClassName}
              />
              <input
                value={precio.descripcion}
                onChange={(event) =>
                  updatePrecioMayor(index, "descripcion", event.target.value)
                }
                placeholder="Ej. precio x6"
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
          ))}
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
              <select
                value={values.producto_base_id}
                onChange={(event) => updateValue("producto_base_id", event.target.value)}
                className={inputClassName}
              >
                <option value="">Sin vinculo (este ES el producto base)</option>
                {productosBase
                  .filter((option) => option.id !== productoEditando?.id)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.nombre_producto}{option.presentacion ? " - " + option.presentacion : ""}
                    </option>
                  ))}
              </select>
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
