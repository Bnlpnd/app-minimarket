"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type {
  Categoria,
  Marca,
  Presentacion,
  Producto,
  Subcategoria,
  UnidadBase,
} from "@/types/database";

export type ProductoFormValues = {
  codigo_interno: string;
  categoria_id: string;
  subcategoria_id: string;
  nombre_producto: string;
  marca_id: string;
  presentacion: string;
  unidad_base: string;
  stock_minimo: string;
  precio_compra_referencial: string;
  precio_venta: string;
  imagen_url: string;
  activo: boolean;
};

type ProductoFormProps = {
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  marcas: Marca[];
  presentaciones: Presentacion[];
  unidadesBase: UnidadBase[];
  productoEditando?: Producto | null;
  isSaving: boolean;
  onSubmit: (values: ProductoFormValues) => Promise<boolean>;
  onCancelEdit?: () => void;
  onQuickCreateCategoria?: (nombre: string) => Promise<Categoria | null>;
  onQuickCreateSubcategoria?: (
    categoriaId: string,
    nombre: string,
  ) => Promise<Subcategoria | null>;
  onQuickCreateMarca?: (nombre: string) => Promise<Marca | null>;
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
  unidad_base: "unidad",
  stock_minimo: "10",
  precio_compra_referencial: "",
  precio_venta: "1.00",
  imagen_url: "",
  activo: true,
};

function toInputValue(value: string | number | null, fallback = "") {
  return value === null ? fallback : String(value);
}

function getInitialValues(producto: Producto | null | undefined): ProductoFormValues {
  if (!producto) {
    return emptyValues;
  }

  return {
    codigo_interno: producto.codigo_interno,
    categoria_id: producto.categoria_id,
    subcategoria_id: producto.subcategoria_id,
    nombre_producto: producto.nombre_producto,
    marca_id: producto.marca_id,
    presentacion: producto.presentacion ?? "",
    unidad_base: producto.unidad_base ?? "unidad",
    stock_minimo: toInputValue(producto.stock_minimo, "10"),
    precio_compra_referencial: toInputValue(producto.precio_compra_referencial),
    precio_venta: toInputValue(producto.precio_venta, "1.00"),
    imagen_url: producto.imagen_url ?? "",
    activo: producto.activo,
  };
}

function productCodeSegment(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();

  return (normalized || "XXX").slice(0, 3).padEnd(3, "X");
}

export function ProductoForm({
  categorias,
  subcategorias,
  marcas,
  presentaciones,
  unidadesBase,
  productoEditando,
  isSaving,
  onSubmit,
  onCancelEdit,
  onQuickCreateCategoria,
  onQuickCreateSubcategoria,
  onQuickCreateMarca,
}: ProductoFormProps) {
  const [values, setValues] = useState<ProductoFormValues>(() =>
    getInitialValues(productoEditando),
  );
  const [quickCatalogOpen, setQuickCatalogOpen] = useState(false);
  const [quickCategoria, setQuickCategoria] = useState("");
  const [quickSubcategoria, setQuickSubcategoria] = useState("");
  const [quickMarca, setQuickMarca] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageError, setImageError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    setValues(getInitialValues(productoEditando));
    clearSelectedImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoEditando?.id]);

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
  const codigoPreview = useMemo(() => {
    const categoria = categorias.find((item) => item.id === values.categoria_id);
    const subcategoria = subcategorias.find(
      (item) => item.id === values.subcategoria_id,
    );

    if (!categoria || !subcategoria) {
      return "Selecciona categoria y subcategoria";
    }

    return `${productCodeSegment(categoria.nombre)}-${productCodeSegment(
      subcategoria.nombre,
    )}-###`;
  }, [categorias, subcategorias, values.categoria_id, values.subcategoria_id]);

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

  const hasCatalogOptions =
    categorias.length > 0 && subcategorias.length > 0 && marcas.length > 0;

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
            El stock operativo se controla por almacen. Aqui registra los datos
            generales del producto.
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
          subcategoria y una marca activas.
        </p>
      ) : null}

      {quickCatalogOpen ? (
        <section className="mt-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
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
        </section>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {productoEditando ? (
          <Field label="Codigo interno">
            <input
              type="text"
              value={values.codigo_interno}
              readOnly
              className={`${inputClassName} bg-slate-50 text-slate-500`}
            />
          </Field>
        ) : (
          <Field label="Codigo interno">
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Autogenerado al guardar</p>
              <p className="mt-1">{codigoPreview}</p>
            </div>
          </Field>
        )}

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

        <Field label="Presentacion">
          <input
            list="presentaciones-list"
            value={values.presentacion}
            onChange={(event) => updateValue("presentacion", event.target.value)}
            placeholder="Ej. Bolsa 1 kg"
            className={inputClassName}
          />
          <datalist id="presentaciones-list">
            {presentaciones.map((presentacion) => (
              <option key={presentacion.id} value={presentacion.nombre} />
            ))}
          </datalist>
        </Field>

        <Field label="Unidad base">
          <select
            value={values.unidad_base}
            onChange={(event) => updateValue("unidad_base", event.target.value)}
            className={inputClassName}
          >
            <option value="">Sin unidad</option>
            {unidadesBase.map((unidad) => (
              <option key={unidad.id} value={unidad.nombre}>
                {unidad.nombre}
              </option>
            ))}
          </select>
        </Field>

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

        <Field label="Precio compra referencial">
          <input
            type="number"
            step="0.01"
            min="0"
            value={values.precio_compra_referencial}
            onChange={(event) =>
              updateValue("precio_compra_referencial", event.target.value)
            }
            className={inputClassName}
          />
        </Field>

        <Field label="Precio venta">
          <input
            type="number"
            step="0.01"
            min="0"
            value={values.precio_venta}
            onChange={(event) => updateValue("precio_venta", event.target.value)}
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
