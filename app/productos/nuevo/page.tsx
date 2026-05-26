"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Layout } from "@/components/Layout";
import { ProductoForm } from "@/components/ProductoForm";
import type { ProductoBaseOption, ProductoFormValues } from "@/components/ProductoForm";
import { getCurrentUserProfile, isAdmin, isTrabajador } from "@/lib/authRoles";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
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

function parsePositiveNumber(value: string, fallback: number | null) {
  const parsed = parseNumber(value, fallback);
  if (parsed === null) {
    return null;
  }

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export default function ProductoNuevoPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Cargando formulario...</div>}>
      <ProductoNuevoContent />
    </Suspense>
  );
}

function ProductoNuevoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productoId = searchParams.get("id");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([]);
  const [presentacionesCompra, setPresentacionesCompra] = useState<
    ProductoPresentacionCompra[]
  >([]);
  const [preciosMayor, setPreciosMayor] = useState<ProductoPrecioMayor[]>([]);
  const [productosBase, setProductosBase] = useState<ProductoBaseOption[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [productoEditando, setProductoEditando] = useState<Producto | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessMessage, setAccessMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function checkAccess() {
    const { profile } = await getCurrentUserProfile();
    const allowed = isAdmin(profile) || isTrabajador(profile);

    setHasAccess(allowed);
    setAccessMessage(
      allowed
        ? ""
        : "Debes iniciar sesion como admin o trabajador para registrar productos.",
    );
    setIsCheckingAccess(false);

    if (allowed) {
      void loadCatalogos();
      void loadProducto();
      void loadProductosBase();
    }
  }

  async function loadProductosBase() {
    if (!supabase) {
      return;
    }
    const { data, error } = await supabase
      .from("productos")
      .select("id,codigo_interno,nombre_producto,presentacion")
      .eq("activo", true)
      .is("producto_base_id", null)
      .order("nombre_producto");
    if (!error) {
      setProductosBase((data ?? []) as ProductoBaseOption[]);
    }
  }

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
    ]);

    if (
      categoriasResult.error ||
      subcategoriasResult.error ||
      marcasResult.error ||
      presentacionesResult.error
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

    const almacenesResult = await supabase
      .from("almacenes")
      .select("*")
      .eq("activo", true)
      .order("nombre");
    if (!almacenesResult.error) {
      setAlmacenes((almacenesResult.data ?? []) as Almacen[]);
    }
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

    if (data?.id) {
      const [presentacionesResult, preciosResult] = await Promise.all([
        supabase
          .from("producto_presentaciones_compra")
          .select("*")
          .eq("producto_id", data.id)
          .order("es_principal", { ascending: false })
          .order("created_at", { ascending: true }),
        supabase
          .from("producto_precios_mayor")
          .select("*")
          .eq("producto_id", data.id)
          .eq("activo", true)
          .order("cantidad_minima", { ascending: true }),
      ]);

      if (!presentacionesResult.error) {
        setPresentacionesCompra(
          (presentacionesResult.data ?? []) as ProductoPresentacionCompra[],
        );
      }

      if (!preciosResult.error) {
        setPreciosMayor((preciosResult.data ?? []) as ProductoPrecioMayor[]);
      }
    } else {
      setPresentacionesCompra([]);
      setPreciosMayor([]);
    }
  }

  useEffect(() => {
    void checkAccess();
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

  async function quickCreatePresentacion(nombre: string) {
    if (!supabase) {
      return null;
    }
    const normalized = normalizeSpaces(nombre);
    if (!normalized) {
      setMessage({ type: "error", text: "Ingresa una presentacion." });
      return null;
    }

    const existing = presentaciones.find(
      (item) => normalizeKey(item.nombre) === normalizeKey(normalized),
    );
    if (existing) {
      return existing;
    }

    const { data, error } = await supabase
      .from("presentaciones")
      .insert({ nombre: normalized })
      .select("*")
      .single();

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo crear presentacion: ${error.message}`,
      });
      return null;
    }

    const presentacion = data as Presentacion;
    setPresentaciones((current) =>
      [...current, presentacion].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    );
    return presentacion;
  }

  async function handleSubmit(values: ProductoFormValues) {
    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return false;
    }

    const nombreProducto = normalizeSpaces(values.nombre_producto);

    if (!nombreProducto) {
      setMessage({
        type: "error",
        text: "Nombre del producto es obligatorio.",
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

    if (!values.presentacion) {
      setMessage({
        type: "error",
        text: "Selecciona una presentacion.",
      });
      return false;
    }

    const unidadesEquivalentes =
      parsePositiveNumber(values.unidades_equivalentes, 1) ?? 1;
    const productoBaseId = values.producto_base_id || null;
    if (productoBaseId && unidadesEquivalentes <= 0) {
      setMessage({
        type: "error",
        text:
          "Unidades equivalentes debe ser mayor a cero cuando se vincula un producto base.",
      });
      return false;
    }
    if (productoBaseId && productoEditando?.id === productoBaseId) {
      setMessage({
        type: "error",
        text: "Un producto no puede ser su propio producto base.",
      });
      return false;
    }

    const payload = {
      categoria_id: values.categoria_id,
      subcategoria_id: values.subcategoria_id,
      nombre_producto: nombreProducto,
      marca_id: values.marca_id,
      presentacion: emptyToNull(values.presentacion),
      unidad_base: emptyToNull(values.unidad_base) ?? "und",
      stock_minimo: parseNumber(values.stock_minimo, 10),
      precio_compra_referencial: null as number | null,
      precio_venta: parseNumber(values.precio_venta, 1),
      imagen_url: emptyToNull(values.imagen_url),
      activo: values.activo,
      producto_base_id: productoBaseId,
      unidades_equivalentes: productoBaseId ? unidadesEquivalentes : 1,
    };
    // Modelo simplificado: el precio compra es por UNIDAD y el stock se
    // ingresa en UNIDADES. La nocion de "unidades_por_presentacion" se fija
    // siempre en 1 desde aqui; el factor de presentaciones vive en
    // unidades_equivalentes cuando el producto vincula a una base.
    const unidadesPorPresentacion = 1;
    const precioCompraPresentacion = parsePositiveNumber(
      values.precio_compra_presentacion,
      null,
    );
    const stockCantidadPresentaciones = parsePositiveNumber(
      values.stock_cantidad_presentaciones,
      0,
    );
    const stockUnidadesSueltas = 0;

    if (precioCompraPresentacion !== null) {
      payload.precio_compra_referencial = Number(precioCompraPresentacion.toFixed(2));
    }

    setIsSaving(true);
    const result = productoEditando
      ? await supabase.from("productos").update(payload).eq("id", productoEditando.id)
      : await supabase
          .from("productos")
          .insert(payload)
          .select("id,codigo_interno")
          .single();
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
      const stockInicialEnPresentacion =
        Number(stockCantidadPresentaciones ?? 0) * unidadesPorPresentacion +
        Number(stockUnidadesSueltas ?? 0);
      const almacenInicialId = values.stock_inicial_almacen_id || null;

      // Si hay cantidad inicial y se eligio almacen, depositar via ajustar_stock
      // (respeta el producto base si esta vinculado).
      if (stockInicialEnPresentacion > 0 && almacenInicialId) {
        const targetProductoId = productoBaseId ?? productoIdCreado;
        const stockEnBase = productoBaseId
          ? stockInicialEnPresentacion * unidadesEquivalentes
          : stockInicialEnPresentacion;
        await supabase.rpc("ajustar_stock", {
          p_producto_id: targetProductoId,
          p_almacen_id: almacenInicialId,
          p_stock_contado: stockEnBase,
          p_observacion: productoBaseId
            ? "Stock inicial via presentacion " + nombreProducto
            : "Stock inicial al crear producto",
          p_usuario_id: null,
        });

        // Si el usuario informo fecha de vencimiento del stock inicial,
        // registrar el lote correspondiente. Sin fecha = no perecedero.
        const fechaVtoInicial = values.stock_inicial_fecha_vencimiento;
        if (fechaVtoInicial && stockEnBase > 0) {
          await supabase.from("producto_lotes").insert({
            producto_id: targetProductoId,
            almacen_id: almacenInicialId,
            cantidad_inicial: stockEnBase,
            cantidad_actual: stockEnBase,
            fecha_vencimiento: fechaVtoInicial,
            origen: "inicial",
            notas: "Lote del stock inicial al crear producto",
          });
        }
      } else {
        // Crear fila en Tienda con 0 para que el producto aparezca en listados
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
    }

    const savedProductId = productoEditando
      ? productoEditando.id
      : (result.data as { id: string }).id;

    if (normalizeSpaces(values.presentacion)) {
      await supabase
        .from("producto_presentaciones_compra")
        .update({ es_principal: false })
        .eq("producto_id", savedProductId);

      const presentationPayload = {
        producto_id: savedProductId,
        proveedor_id: null,
        nombre_presentacion: normalizeSpaces(values.presentacion),
        unidades_por_presentacion: unidadesPorPresentacion,
        costo_presentacion: precioCompraPresentacion,
        es_principal: true,
        activo: true,
      };
      const presentationResult = values.presentacion_compra_id
        ? await supabase
            .from("producto_presentaciones_compra")
            .update(presentationPayload)
            .eq("id", values.presentacion_compra_id)
        : await supabase
            .from("producto_presentaciones_compra")
            .insert(presentationPayload);

      if (presentationResult.error) {
        setMessage({
          type: "error",
          text: `Producto guardado, pero fallo la presentacion de compra: ${presentationResult.error.message}`,
        });
        return false;
      }
    }

    await supabase
      .from("producto_precios_mayor")
      .delete()
      .eq("producto_id", savedProductId);
    const preciosMayorPayload = values.precios_mayor
      .map((precio) => {
        const cantidad = parsePositiveNumber(precio.cantidad_minima, null);
        const total = parsePositiveNumber(precio.precio_total, null);
        const unitario =
          cantidad !== null && total !== null && cantidad > 0
            ? Number((total / cantidad).toFixed(4))
            : null;
        return {
          producto_id: savedProductId,
          cantidad_minima: cantidad,
          precio_unitario: unitario,
          precio_total: total,
          tipo_precio: "paquete" as const,
          descripcion: emptyToNull(precio.descripcion),
          activo: true,
        };
      })
      .filter(
        (precio) =>
          precio.cantidad_minima !== null && precio.precio_unitario !== null,
      );

    if (preciosMayorPayload.length > 0) {
      const { error: preciosError } = await supabase
        .from("producto_precios_mayor")
        .insert(preciosMayorPayload);

      if (preciosError) {
        setMessage({
          type: "error",
          text: `Producto guardado, pero fallaron precios por mayor: ${preciosError.message}`,
        });
        return false;
      }
    }

    // Persistir presentaciones de compra adicionales (saco x49, caja x12,
    // etc.). Borramos las que ya existian con unidades > 1 y reinsertamos
    // las que vienen del form. La presentacion "x1" implicita NO se toca.
    const presentacionesValidas = values.presentaciones_compra
      .map((pres) => ({
        producto_id: savedProductId,
        proveedor_id: null,
        nombre_presentacion: normalizeSpaces(pres.nombre_presentacion),
        unidades_por_presentacion: parsePositiveNumber(pres.unidades_por_presentacion, 0),
        costo_presentacion: parsePositiveNumber(pres.costo_presentacion, null),
        es_principal: pres.es_principal,
        activo: true,
      }))
      .filter((p) => p.nombre_presentacion && (p.unidades_por_presentacion ?? 0) > 1);

    // Borrar presentaciones con unidades > 1 previas (las dinamicas).
    await supabase
      .from("producto_presentaciones_compra")
      .delete()
      .eq("producto_id", savedProductId)
      .gt("unidades_por_presentacion", 1);

    if (presentacionesValidas.length > 0) {
      // Si alguna esta marcada como principal, primero deshabilitamos el
      // principal anterior para evitar tener dos.
      const hayPrincipal = presentacionesValidas.some((p) => p.es_principal);
      if (hayPrincipal) {
        await supabase
          .from("producto_presentaciones_compra")
          .update({ es_principal: false })
          .eq("producto_id", savedProductId);
      }
      const { error: presError } = await supabase
        .from("producto_presentaciones_compra")
        .insert(presentacionesValidas);
      if (presError) {
        setMessage({
          type: "error",
          text: `Producto guardado, pero fallaron presentaciones: ${presError.message}`,
        });
        return false;
      }
    }

    setMessage({
      type: "success",
      text: productoEditando
        ? "Producto actualizado correctamente."
        : `Producto creado correctamente con codigo ${
            (result.data as { codigo_interno?: string } | null)?.codigo_interno ??
            "autogenerado"
          }.`,
    });
    await loadProducto();
    return true;
  }

  /**
   * Elimina el producto solo si nunca fue agregado a un pedido. Verifica
   * count en detalle_pedido por seguridad y muestra mensaje claro.
   * Borra producto, sus relaciones (cascade) y la imagen del storage si
   * vivia en nuestro bucket.
   */
  async function handleDelete(): Promise<boolean> {
    if (!supabase || !productoEditando) return false;
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "¿Eliminar este producto? Esta accion es permanente.",
      );
      if (!ok) return false;
    }

    // Verifica que no este en ningun pedido (ni como producto ni como base).
    const usoComoItem = await supabase
      .from("detalle_pedido")
      .select("id", { count: "exact", head: true })
      .or(`producto_id.eq.${productoEditando.id},producto_stock_id.eq.${productoEditando.id}`);

    if (usoComoItem.error) {
      setMessage({
        type: "error",
        text: `No se pudo verificar uso del producto: ${usoComoItem.error.message}`,
      });
      return false;
    }

    if ((usoComoItem.count ?? 0) > 0) {
      setMessage({
        type: "error",
        text: "Este producto ya fue agregado a un pedido. No se puede eliminar (para preservar el historial). Puedes desactivarlo desmarcando 'Producto activo'.",
      });
      return false;
    }

    // Verifica que no sea base de otra presentacion en uso.
    const esBase = await supabase
      .from("productos")
      .select("id", { count: "exact", head: true })
      .eq("producto_base_id", productoEditando.id);
    if ((esBase.count ?? 0) > 0) {
      setMessage({
        type: "error",
        text: "Otros productos lo tienen como base. Desvincula esas presentaciones antes de eliminar.",
      });
      return false;
    }

    // Borra la imagen del storage si vive en nuestro bucket.
    if (productoEditando.imagen_url) {
      try {
        const url = new URL(productoEditando.imagen_url);
        const marker = "/storage/v1/object/public/productos/";
        const idx = url.pathname.indexOf(marker);
        if (idx >= 0) {
          const objectPath = url.pathname.slice(idx + marker.length);
          if (objectPath) {
            await supabase.storage.from("productos").remove([objectPath]);
          }
        }
      } catch {
        // ignorar si la URL no es de nuestro bucket
      }
    }

    // Borrar relaciones y producto.
    await supabase.from("producto_almacen").delete().eq("producto_id", productoEditando.id);
    await supabase
      .from("producto_presentaciones_compra")
      .delete()
      .eq("producto_id", productoEditando.id);
    await supabase.from("producto_precios_mayor").delete().eq("producto_id", productoEditando.id);
    const del = await supabase.from("productos").delete().eq("id", productoEditando.id);
    if (del.error) {
      setMessage({
        type: "error",
        text: `No se pudo eliminar: ${del.error.message}`,
      });
      return false;
    }

    setMessage({ type: "success", text: "Producto eliminado correctamente." });
    setTimeout(() => router.push("/productos"), 800);
    return true;
  }

  return (
    <Layout
      title={productoEditando ? "Editar producto" : "Nuevo producto"}
      description="Registra los datos generales del producto. El stock se administra desde Almacen."
    >
      <div className="space-y-5">
        {isCheckingAccess ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            Verificando permisos...
          </section>
        ) : null}

        {!isCheckingAccess && !hasAccess ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            <h2 className="text-base font-semibold text-amber-950">
              Acceso restringido
            </h2>
            <p className="mt-2">{accessMessage}</p>
            <a
              href="/login"
              className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
            >
              Ir al login
            </a>
          </section>
        ) : null}

        {hasAccess ? (
          <>
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
          presentacionesCompra={presentacionesCompra}
          preciosMayor={preciosMayor}
          productoEditando={productoEditando}
          productosBase={productosBase}
          almacenes={almacenes}
          isSaving={isSaving}
          onSubmit={handleSubmit}
          onDelete={productoEditando ? handleDelete : undefined}
          onQuickCreateCategoria={quickCreateCategoria}
          onQuickCreateSubcategoria={quickCreateSubcategoria}
          onQuickCreateMarca={quickCreateMarca}
          onQuickCreatePresentacion={quickCreatePresentacion}
        />
          </>
        ) : null}
      </div>
    </Layout>
  );
}
