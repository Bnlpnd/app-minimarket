"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type {
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
  precios_mayor: PrecioMayorFormValue[];
  producto_base_id: string;
  unidades_equivalentes: string;
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
  isSaving: boolean;
  onSubmit: (values: ProductoFormValues) => Promise<boolean>;
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
  precios_mayor: [
    { cantidad_minima: "3", precio_unitario: "", descripcion: "Mayor x3" },
    { cantidad_minima: "6", precio_unitario: "", descripcion: "Mayor x6" },
    { cantidad_minima: "12", precio_unitario: "", descripcion: "Mayor x12" },
  ],
  producto_base_id: "",
  unidades_equivalentes: "1",
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
  const preciosMayorValues =
    preciosMayor.length > 0
      ? preciosMayor.map((precio) => ({
          cantidad_minima: toInputValue(precio.cantidad_minima),
          precio_unitario: toInputValue(precio.precio_unitario),
          descripcion: precio.descripcion ?? "",
        }))
      : emptyValues.precios_mayor;

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
    precios_mayor: preciosMayorValues,
    producto_base_id: producto.producto_base_id ?? "",
    unidades_equivalentes: toInputValue(producto.unidades_equivalentes ?? 1, "1"),
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
  isSaving,
  onSubmit,
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
  const costoUnitarioCalculado = useMemo(() => {
    const costoPresentacion = Number(values.precio_compra_presentacion);
    const unidades = Number(values.unidades_por_presentacion);

    if (
      !Number.isFinite(costoPresentacion) ||
      !Number.isFinite(unidades) ||
      costoPresentacion < 0 ||
      unidades <= 0
    ) {
      return null;
    }

    return costoPresentacion / unidades;
  }, [values.precio_compra_presentacion, values.unidades_por_presentacion]);
  const stockInicialUnidades = useMemo(() => {
    const cantidadPresentaciones = Number(values.stock_cantidad_presentaciones);
    const unidadesPresentacion = Number(values.unidades_por_presentacion);
    const unidadesSueltas = Number(values.stock_unidades_sueltas);

    return (
      (Number.isFinite(cantidadPresentaciones) ? cantidadPresentaciones : 0) *
        (Number.isFinite(unidadesPresentacion) ? unidadesPresentacion : 0) +
      (Number.isFinite(unidadesSueltas) ? unidadesSueltas : 0)
    );
  }, [
    values.stock_cantidad_presentaciones,
    values.stock_unidades_sueltas,
    values.unidades_por_presentacion,
  ]);

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
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
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

          <Field label="Precio compra presentacion">
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

          <Field label="Unidades de la presentacion">
            <input
              type="number"
              step="0.01"
              min="1"
              value={values.unidades_por_presentacion}
              onChange={(event) =>
                updateValue("unidades_por_presentacion", event.target.value)
              }
              className={inputClassName}
            />
          </Field>

          <Field label="Costo unidad">
            <input
              value={
                costoUnitarioCalculado === null
                  ? ""
                  : costoUnitarioCalculado.toFixed(2)
              }
              readOnly
              className={`${inputClassName} bg-slate-50 text-slate-600`}
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
              <Field label="Stock: cantidad de presentaciones">
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
              </Field>
              <Field label="Stock: unidades sueltas o bonificacion">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={values.stock_unidades_sueltas}
                  onChange={(event) =>
                    updateValue("stock_unidades_sueltas", event.target.value)
                  }
                  className={inputClassName}
                />
              </Field>
              <div className="rounded-md bg-white p-3">
                <p className="text-xs text-slate-500">Stock inicial en unidades</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {Number.isFinite(stockInicialUnidades)
                    ? stockInicialUnidades.toFixed(2).replace(/\.00$/, "")
                    : "0"}
                </p>
              </div>
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
          <div className="min-w-0 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Preview de imagen</p>
            <p className="mt-1 break-all text-xs">
              {imageFile ? imageFile.name : values.imagen_url}
            </p>
            {imageFile ? (
              <button
                type="button"
                onClick={clearSelectedImage}
                className="mt-2 text-xs font-medium text-red-700 hover:text-red-800"
              >
                Quitar seleccion
              </button>
            ) : null}
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

      <div className="mt-5 flex justify-end">
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
