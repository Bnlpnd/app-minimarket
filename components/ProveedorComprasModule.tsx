"use client";

/* eslint-disable react-hooks/set-state-in-effect */

/**
 * Compras a proveedor con boletas y pagos.
 *
 * Flujo del usuario (lo mas usado primero):
 *  1) Click "Nueva compra" -> form con cabecera obligatoria
 *     (proveedor, fecha, monto total) + pago inicial opcional.
 *  2) Opcional: desplegar "Detalle de items" para anotar lo que trajo
 *     el proveedor producto por producto. Si tiene fecha vto, crea
 *     lote en producto_lotes. Si tiene almacen destino, suma al stock.
 *  3) Al guardar la compra: inserta cabecera, items (si hay) y el pago
 *     inicial (si > 0). El trigger de la BD recalcula monto_pagado y
 *     estado_pago.
 *  4) Lista debajo con filtros (proveedor, mes, estado). Click en una
 *     compra abre el detalle expandible donde se pueden ver items,
 *     historial de pagos, y registrar un nuevo abono.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { selectOnFocus } from "@/lib/inputUtils";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import { matchesSearch } from "@/lib/searchUtils";
import { formatFechaCorta } from "@/lib/loteUtils";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { QuickProductoCreator } from "@/components/QuickProductoCreator";
import type {
  Almacen,
  Categoria,
  Marca,
  Presentacion,
  Producto,
  Proveedor,
  ProveedorCompra,
  ProveedorCompraEstadoPago,
  ProveedorCompraItem,
  ProveedorCompraTipoDoc,
  ProveedorPago,
  ProveedorPagoMetodo,
  Subcategoria,
  VistaProveedorResumen,
} from "@/types/database";

type Message = { type: "success" | "error"; text: string };

type CompraConProveedor = ProveedorCompra & {
  proveedores: Pick<Proveedor, "id" | "nombre"> | null;
};

type ItemForm = {
  key: string;
  producto_id: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  fecha_vencimiento: string;
  almacen_destino_id: string;
  registrar_stock: boolean;
};

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function newItemKey() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyItem(defaultAlmacen: string): ItemForm {
  return {
    key: newItemKey(),
    producto_id: "",
    descripcion: "",
    cantidad: "1",
    precio_unitario: "0",
    fecha_vencimiento: "",
    almacen_destino_id: defaultAlmacen,
    registrar_stock: true,
  };
}

function formatMoney(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function hoyInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inicioDeMesInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const ESTADO_LABEL: Record<ProveedorCompraEstadoPago, string> = {
  pagado: "Pagado",
  parcial: "Parcial",
  pendiente: "Pendiente",
};

const ESTADO_BADGE: Record<ProveedorCompraEstadoPago, string> = {
  pagado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  parcial: "bg-amber-100 text-amber-700 border-amber-200",
  pendiente: "bg-red-100 text-red-700 border-red-200",
};

export function ProveedorComprasModule() {
  // Catalogos
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([]);

  // Lista
  const [compras, setCompras] = useState<CompraConProveedor[]>([]);
  const [resumen, setResumen] = useState<VistaProveedorResumen[]>([]);
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | ProveedorCompraEstadoPago>("todos");
  const [filtroDesde, setFiltroDesde] = useState(inicioDeMesInput());
  const [filtroHasta, setFiltroHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  // Form nueva compra
  const [showForm, setShowForm] = useState(false);
  const [formProveedorId, setFormProveedorId] = useState("");
  const [formFecha, setFormFecha] = useState(hoyInput());
  const [formNumeroDoc, setFormNumeroDoc] = useState("");
  const [formTipoDoc, setFormTipoDoc] = useState<ProveedorCompraTipoDoc>("boleta");
  const [formTotal, setFormTotal] = useState("0");
  const [formObservacion, setFormObservacion] = useState("");
  const [formPagoInicial, setFormPagoInicial] = useState("0");
  const [formPagoMetodo, setFormPagoMetodo] = useState<ProveedorPagoMetodo>("efectivo");
  const [formPagoRef, setFormPagoRef] = useState("");
  const [showItems, setShowItems] = useState(false);
  const [items, setItems] = useState<ItemForm[]>([]);

  // Crear producto rapido
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickForItemKey, setQuickForItemKey] = useState<string | null>(null);
  const [quickInitialName, setQuickInitialName] = useState("");

  // Detalle expandido
  const [openCompraId, setOpenCompraId] = useState<string | null>(null);
  const [compraItems, setCompraItems] = useState<ProveedorCompraItem[]>([]);
  const [compraPagos, setCompraPagos] = useState<ProveedorPago[]>([]);

  // Abono nuevo
  const [abonoMonto, setAbonoMonto] = useState("");
  const [abonoMetodo, setAbonoMetodo] = useState<ProveedorPagoMetodo>("efectivo");
  const [abonoFecha, setAbonoFecha] = useState(hoyInput());
  const [abonoRef, setAbonoRef] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const defaultAlmacen = useMemo(() => {
    return (
      almacenes.find((a) => a.nombre.toLowerCase() === "casa")?.id ??
      almacenes[0]?.id ??
      ""
    );
  }, [almacenes]);

  async function loadCatalogos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "Sin Supabase." });
      return;
    }
    const [
      proveedoresRes,
      almacenesRes,
      productosRes,
      categoriasRes,
      subcategoriasRes,
      marcasRes,
      presentacionesRes,
    ] = await Promise.all([
      supabase.from("proveedores").select("*").eq("activo", true).order("nombre"),
      supabase.from("almacenes").select("*").eq("activo", true).order("nombre"),
      fetchAllRows<Producto>(
        supabase.from("productos").select("*").eq("activo", true).order("nombre_producto"),
      ),
      supabase.from("categorias").select("*").eq("activo", true).order("nombre"),
      supabase.from("subcategorias").select("*").eq("activo", true).order("nombre"),
      supabase.from("marcas").select("*").eq("activo", true).order("nombre"),
      supabase.from("presentaciones").select("*").eq("activo", true).order("nombre"),
    ]);
    setProveedores((proveedoresRes.data ?? []) as Proveedor[]);
    setAlmacenes((almacenesRes.data ?? []) as Almacen[]);
    setProductos(productosRes.data ?? []);
    setCategorias((categoriasRes.data ?? []) as Categoria[]);
    setSubcategorias((subcategoriasRes.data ?? []) as Subcategoria[]);
    setMarcas((marcasRes.data ?? []) as Marca[]);
    setPresentaciones((presentacionesRes.data ?? []) as Presentacion[]);
  }

  async function loadCompras() {
    if (!supabase) return;
    setIsLoading(true);
    let q = supabase
      .from("proveedor_compras")
      .select("*, proveedores(id, nombre)")
      .order("fecha_compra", { ascending: false })
      .order("created_at", { ascending: false });
    if (filtroProveedor) q = q.eq("proveedor_id", filtroProveedor);
    if (filtroEstado !== "todos") q = q.eq("estado_pago", filtroEstado);
    if (filtroDesde) q = q.gte("fecha_compra", filtroDesde);
    if (filtroHasta) q = q.lte("fecha_compra", filtroHasta);

    const { data, error } = await fetchAllRows<CompraConProveedor>(q);
    setIsLoading(false);
    if (error) {
      setMessage({ type: "error", text: `No se cargaron compras: ${error.message}` });
      return;
    }
    setCompras(data ?? []);
  }

  async function loadResumen() {
    if (!supabase) return;
    const { data } = await supabase
      .from("vista_proveedor_resumen")
      .select("*")
      .order("deuda_total", { ascending: false });
    setResumen(((data ?? []) as VistaProveedorResumen[]).filter(
      (r) => r.compras_total > 0,
    ));
  }

  useEffect(() => {
    void loadCatalogos();
    void loadResumen();
  }, []);

  useEffect(() => {
    void loadCompras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroProveedor, filtroEstado, filtroDesde, filtroHasta]);

  const comprasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return compras;
    return compras.filter((c) =>
      matchesSearch(busqueda, [
        c.numero_documento,
        c.proveedores?.nombre,
        c.observacion,
      ]),
    );
  }, [compras, busqueda]);

  const kpiMesActual = useMemo(() => {
    const desde = inicioDeMesInput();
    let totalCompradoMes = 0;
    for (const c of compras) {
      if (c.fecha_compra >= desde) {
        totalCompradoMes += Number(c.total ?? 0);
      }
    }
    const deudaTotal = resumen.reduce((sum, r) => sum + Number(r.deuda_total ?? 0), 0);
    return { totalCompradoMes, deudaTotal };
  }, [compras, resumen]);

  function resetForm() {
    setFormProveedorId("");
    setFormFecha(hoyInput());
    setFormNumeroDoc("");
    setFormTipoDoc("boleta");
    setFormTotal("0");
    setFormObservacion("");
    setFormPagoInicial("0");
    setFormPagoMetodo("efectivo");
    setFormPagoRef("");
    setShowItems(false);
    setItems([]);
  }

  function addItem() {
    setItems((curr) => [...curr, emptyItem(defaultAlmacen)]);
  }

  function updateItem(key: string, patch: Partial<ItemForm>) {
    setItems((curr) =>
      curr.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    );
  }

  function removeItem(key: string) {
    setItems((curr) => curr.filter((it) => it.key !== key));
  }

  function openQuickCreate(itemKey: string, initialName: string) {
    setQuickForItemKey(itemKey);
    setQuickInitialName(initialName);
    setQuickOpen(true);
  }

  function handleProductoCreado(producto: Producto) {
    setProductos((curr) => [...curr, producto].sort((a, b) =>
      a.nombre_producto.localeCompare(b.nombre_producto),
    ));
    if (quickForItemKey) {
      updateItem(quickForItemKey, { producto_id: producto.id });
    }
    setQuickOpen(false);
    setQuickForItemKey(null);
    setQuickInitialName("");
  }

  const itemsTotal = useMemo(() => {
    return items.reduce((sum, it) => {
      const cant = Number(it.cantidad);
      const precio = Number(it.precio_unitario);
      if (Number.isFinite(cant) && Number.isFinite(precio)) {
        return sum + cant * precio;
      }
      return sum;
    }, 0);
  }, [items]);

  async function saveCompra() {
    if (!supabase) return;
    if (!formProveedorId) {
      setMessage({ type: "error", text: "Selecciona un proveedor." });
      return;
    }
    const total = Number(formTotal);
    if (!Number.isFinite(total) || total < 0) {
      setMessage({ type: "error", text: "El total debe ser un numero >= 0." });
      return;
    }
    const pagoInicial = Number(formPagoInicial) || 0;
    if (pagoInicial < 0 || pagoInicial > total) {
      setMessage({
        type: "error",
        text: "El monto pagado debe estar entre 0 y el total.",
      });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    // 1) Cabecera
    const { data: compraData, error: compraErr } = await supabase
      .from("proveedor_compras")
      .insert({
        proveedor_id: formProveedorId,
        fecha_compra: formFecha,
        numero_documento: formNumeroDoc.trim() || null,
        tipo_documento: formTipoDoc,
        subtotal: total,
        descuento: 0,
        total,
        monto_pagado: 0, // el trigger lo recalcula al insertar el pago
        observacion: formObservacion.trim() || null,
      })
      .select("id")
      .single();

    if (compraErr || !compraData) {
      setIsSaving(false);
      setMessage({
        type: "error",
        text: `No se guardo la compra: ${compraErr?.message ?? "sin respuesta"}`,
      });
      return;
    }
    const compraId = compraData.id as string;

    // 2) Items (si los hay)
    const itemsValidos = items.filter((it) => {
      const cant = Number(it.cantidad);
      const precio = Number(it.precio_unitario);
      const hayDescripcion = it.descripcion.trim().length > 0;
      return (
        Number.isFinite(cant) &&
        cant > 0 &&
        Number.isFinite(precio) &&
        precio >= 0 &&
        (it.producto_id || hayDescripcion)
      );
    });
    if (itemsValidos.length > 0) {
      const payload = itemsValidos.map((it) => ({
        compra_id: compraId,
        producto_id: it.producto_id || null,
        descripcion: it.producto_id ? null : it.descripcion.trim(),
        cantidad: Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
        fecha_vencimiento: it.fecha_vencimiento || null,
        almacen_destino_id: it.almacen_destino_id || null,
        registrar_stock: it.registrar_stock && Boolean(it.producto_id),
      }));
      const { error: itemsErr } = await supabase
        .from("proveedor_compra_items")
        .insert(payload);
      if (itemsErr) {
        setIsSaving(false);
        setMessage({
          type: "error",
          text: `Compra creada pero los items fallaron: ${itemsErr.message}`,
        });
        await loadCompras();
        await loadResumen();
        return;
      }

      // 3) Para los items con producto + registrar_stock + almacen,
      // ajustar stock y crear lote si trae vencimiento.
      for (const it of itemsValidos) {
        if (!it.producto_id || !it.registrar_stock || !it.almacen_destino_id) continue;
        const cant = Number(it.cantidad);
        // Obtener stock actual para sumar.
        const { data: rowStock } = await supabase
          .from("producto_almacen")
          .select("stock_actual")
          .eq("producto_id", it.producto_id)
          .eq("almacen_id", it.almacen_destino_id)
          .maybeSingle();
        const actual = Number(rowStock?.stock_actual ?? 0);
        await supabase.rpc("ajustar_stock", {
          p_producto_id: it.producto_id,
          p_almacen_id: it.almacen_destino_id,
          p_stock_contado: actual + cant,
          p_observacion: `Compra proveedor ${compraId.slice(0, 8)}`,
          p_usuario_id: null,
        });
        if (it.fecha_vencimiento) {
          await supabase.from("producto_lotes").insert({
            producto_id: it.producto_id,
            almacen_id: it.almacen_destino_id,
            cantidad_inicial: cant,
            cantidad_actual: cant,
            fecha_vencimiento: it.fecha_vencimiento,
            origen: "compra",
            notas: `Compra ${compraId.slice(0, 8)}`,
          });
        }
      }
    }

    // 4) Pago inicial (si > 0)
    if (pagoInicial > 0) {
      const { error: pagoErr } = await supabase.from("proveedor_pagos").insert({
        compra_id: compraId,
        fecha_pago: formFecha,
        monto: pagoInicial,
        metodo: formPagoMetodo,
        referencia: formPagoRef.trim() || null,
      });
      if (pagoErr) {
        setIsSaving(false);
        setMessage({
          type: "error",
          text: `Compra creada pero el pago fallo: ${pagoErr.message}`,
        });
        await loadCompras();
        await loadResumen();
        return;
      }
    }

    setIsSaving(false);
    setMessage({ type: "success", text: "Compra registrada correctamente." });
    resetForm();
    setShowForm(false);
    await loadCompras();
    await loadResumen();
  }

  async function openCompra(compraId: string) {
    if (openCompraId === compraId) {
      setOpenCompraId(null);
      return;
    }
    if (!supabase) return;
    setOpenCompraId(compraId);
    setCompraItems([]);
    setCompraPagos([]);
    setAbonoMonto("");
    setAbonoMetodo("efectivo");
    setAbonoFecha(hoyInput());
    setAbonoRef("");

    const [itemsRes, pagosRes] = await Promise.all([
      supabase
        .from("proveedor_compra_items")
        .select("*")
        .eq("compra_id", compraId)
        .order("created_at"),
      supabase
        .from("proveedor_pagos")
        .select("*")
        .eq("compra_id", compraId)
        .order("fecha_pago", { ascending: false }),
    ]);
    setCompraItems((itemsRes.data ?? []) as ProveedorCompraItem[]);
    setCompraPagos((pagosRes.data ?? []) as ProveedorPago[]);
  }

  async function registrarAbono(compraId: string) {
    if (!supabase) return;
    const monto = Number(abonoMonto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setMessage({ type: "error", text: "Monto invalido." });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    const { error } = await supabase.from("proveedor_pagos").insert({
      compra_id: compraId,
      fecha_pago: abonoFecha,
      monto,
      metodo: abonoMetodo,
      referencia: abonoRef.trim() || null,
    });
    setIsSaving(false);
    if (error) {
      setMessage({ type: "error", text: `No se registro: ${error.message}` });
      return;
    }
    setMessage({ type: "success", text: "Abono registrado." });
    setAbonoMonto("");
    setAbonoRef("");
    await loadCompras();
    await loadResumen();
    // Recargar pagos del detalle
    const { data } = await supabase
      .from("proveedor_pagos")
      .select("*")
      .eq("compra_id", compraId)
      .order("fecha_pago", { ascending: false });
    setCompraPagos((data ?? []) as ProveedorPago[]);
  }

  async function eliminarPago(pagoId: string, compraId: string) {
    if (!supabase) return;
    if (typeof window !== "undefined" && !window.confirm("¿Eliminar este pago?")) {
      return;
    }
    const { error } = await supabase
      .from("proveedor_pagos")
      .delete()
      .eq("id", pagoId);
    if (error) {
      setMessage({ type: "error", text: `No se elimino: ${error.message}` });
      return;
    }
    setMessage({ type: "success", text: "Pago eliminado." });
    await loadCompras();
    await loadResumen();
    const { data } = await supabase
      .from("proveedor_pagos")
      .select("*")
      .eq("compra_id", compraId)
      .order("fecha_pago", { ascending: false });
    setCompraPagos((data ?? []) as ProveedorPago[]);
  }

  return (
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

      {/* KPIs arriba */}
      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Comprado este mes"
          value={formatMoney(kpiMesActual.totalCompradoMes)}
          tone="slate"
        />
        <KpiCard
          label="Deuda total a proveedores"
          value={formatMoney(kpiMesActual.deudaTotal)}
          tone={kpiMesActual.deudaTotal > 0 ? "amber" : "slate"}
        />
        <button
          type="button"
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetForm();
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
          className="flex h-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
        >
          {showForm ? "Cerrar form" : "+ Nueva compra"}
        </button>
      </section>

      {/* Form Nueva compra */}
      {showForm ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="text-base font-semibold text-slate-950">Nueva compra</h3>
          <p className="mt-1 text-sm text-slate-600">
            Lo minimo es proveedor + monto total. Despues podes registrar los
            items y los pagos parciales.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Proveedor *">
              <SearchableSelect
                value={formProveedorId}
                onChange={setFormProveedorId}
                options={proveedores.map((p) => ({
                  id: p.id,
                  label: p.nombre,
                  sub: p.ruc ?? undefined,
                }))}
                placeholder="Buscar proveedor..."
              />
            </Field>
            <Field label="Fecha *">
              <input
                type="date"
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                max={hoyInput()}
                className={inputClassName}
              />
            </Field>
            <Field label="Tipo documento">
              <select
                value={formTipoDoc}
                onChange={(e) =>
                  setFormTipoDoc(e.target.value as ProveedorCompraTipoDoc)
                }
                className={inputClassName}
              >
                <option value="boleta">Boleta</option>
                <option value="factura">Factura</option>
                <option value="nota">Nota</option>
                <option value="sin_documento">Sin documento</option>
              </select>
            </Field>
            <Field label="N° documento">
              <input
                value={formNumeroDoc}
                onChange={(e) => setFormNumeroDoc(e.target.value)}
                placeholder="B001-123456"
                className={inputClassName}
              />
            </Field>
            <Field label="Total *">
              <input
                type="number"
                step="0.01"
                min="0"
                value={formTotal}
                onChange={(e) => setFormTotal(e.target.value)}
                onFocus={selectOnFocus}
                className={inputClassName}
              />
              {items.length > 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  Suma items: {formatMoney(itemsTotal)}{" "}
                  <button
                    type="button"
                    onClick={() => setFormTotal(itemsTotal.toFixed(2))}
                    className="ml-1 text-emerald-700 underline"
                  >
                    usar
                  </button>
                </p>
              ) : null}
            </Field>
            <Field label="Pago inicial">
              <input
                type="number"
                step="0.01"
                min="0"
                value={formPagoInicial}
                onChange={(e) => setFormPagoInicial(e.target.value)}
                onFocus={selectOnFocus}
                className={inputClassName}
              />
              <p className="mt-1 text-xs text-slate-500">
                Saldo:{" "}
                {formatMoney(
                  Math.max(0, Number(formTotal || 0) - Number(formPagoInicial || 0)),
                )}
              </p>
            </Field>
            <Field label="Metodo de pago">
              <select
                value={formPagoMetodo}
                onChange={(e) =>
                  setFormPagoMetodo(e.target.value as ProveedorPagoMetodo)
                }
                className={inputClassName}
              >
                <option value="efectivo">Efectivo</option>
                <option value="yape">Yape</option>
                <option value="transferencia">Transferencia</option>
                <option value="otro">Otro</option>
              </select>
            </Field>
            <Field label="Referencia (operacion)">
              <input
                value={formPagoRef}
                onChange={(e) => setFormPagoRef(e.target.value)}
                placeholder="N° op. Yape"
                className={inputClassName}
              />
            </Field>
            <Field label="Observacion" wide>
              <input
                value={formObservacion}
                onChange={(e) => setFormObservacion(e.target.value)}
                placeholder="Ej. compra semanal de bebidas"
                className={inputClassName}
              />
            </Field>
          </div>

          {/* Items opcionales */}
          <details
            open={showItems}
            onToggle={(e) => setShowItems((e.target as HTMLDetailsElement).open)}
            className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3"
          >
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Detalle de productos {items.length > 0 ? `(${items.length})` : "(opcional)"}
            </summary>
            <p className="mt-2 text-xs text-slate-500">
              Si carga items con producto + almacen, al guardar se suma al stock
              y se registra lote si hay fecha de vencimiento. Si el producto no
              esta en tu catalogo, podes usar &quot;Crear nuevo producto&quot;.
            </p>

            <div className="mt-3 space-y-3">
              {items.map((it) => (
                <ItemRow
                  key={it.key}
                  item={it}
                  productos={productos}
                  almacenes={almacenes}
                  onUpdate={(patch) => updateItem(it.key, patch)}
                  onRemove={() => removeItem(it.key)}
                  onQuickCreate={(name) => openQuickCreate(it.key, name)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="mt-3 h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              + Agregar item
            </button>
          </details>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="h-11 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void saveCompra()}
              className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
            >
              {isSaving ? "Guardando..." : "Guardar compra"}
            </button>
          </div>
        </section>
      ) : null}

      {/* Filtros lista */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar n° doc, proveedor, nota"
            className={inputClassName}
          />
          <SearchableSelect
            value={filtroProveedor}
            onChange={setFiltroProveedor}
            options={proveedores.map((p) => ({ id: p.id, label: p.nombre }))}
            placeholder="Todos los proveedores"
          />
          <select
            value={filtroEstado}
            onChange={(e) =>
              setFiltroEstado(e.target.value as typeof filtroEstado)
            }
            className={inputClassName}
          >
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="parcial">Parciales</option>
            <option value="pagado">Pagados</option>
          </select>
          <input
            type="date"
            value={filtroDesde}
            onChange={(e) => setFiltroDesde(e.target.value)}
            className={inputClassName}
            title="Desde"
          />
          <input
            type="date"
            value={filtroHasta}
            onChange={(e) => setFiltroHasta(e.target.value)}
            className={inputClassName}
            title="Hasta"
          />
        </div>
      </section>

      {/* Lista de compras */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950">
            Compras ({comprasFiltradas.length})
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {isLoading ? (
            <p className="p-4 text-sm text-slate-500">Cargando...</p>
          ) : comprasFiltradas.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              No hay compras con estos filtros.
            </p>
          ) : (
            comprasFiltradas.map((c) => (
              <CompraRow
                key={c.id}
                compra={c}
                open={openCompraId === c.id}
                onOpen={() => void openCompra(c.id)}
                items={openCompraId === c.id ? compraItems : []}
                pagos={openCompraId === c.id ? compraPagos : []}
                productos={productos}
                almacenes={almacenes}
                abonoMonto={abonoMonto}
                abonoMetodo={abonoMetodo}
                abonoFecha={abonoFecha}
                abonoRef={abonoRef}
                isSaving={isSaving}
                onAbonoMonto={setAbonoMonto}
                onAbonoMetodo={setAbonoMetodo}
                onAbonoFecha={setAbonoFecha}
                onAbonoRef={setAbonoRef}
                onAbonoSave={() => void registrarAbono(c.id)}
                onPagoDelete={(pagoId) => void eliminarPago(pagoId, c.id)}
              />
            ))
          )}
        </div>
      </section>

      {/* Resumen por proveedor (deuda) */}
      {resumen.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">
            Deuda por proveedor
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2">Compras</th>
                  <th className="px-3 py-2">Comprado</th>
                  <th className="px-3 py-2">Pagado</th>
                  <th className="px-3 py-2">Deuda</th>
                  <th className="px-3 py-2">Ultima compra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resumen.map((r) => (
                  <tr
                    key={r.proveedor_id}
                    className={r.deuda_total > 0 ? "bg-amber-50/40" : ""}
                  >
                    <td className="px-3 py-2 font-medium text-slate-950">
                      {r.proveedor_nombre}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.compras_total} ({r.compras_con_saldo} con saldo)
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {formatMoney(r.compras_monto_total)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {formatMoney(r.pagos_total)}
                    </td>
                    <td
                      className={`px-3 py-2 font-semibold ${
                        r.deuda_total > 0 ? "text-amber-700" : "text-slate-500"
                      }`}
                    >
                      {formatMoney(r.deuda_total)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {r.ultima_compra ? formatFechaCorta(r.ultima_compra) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <QuickProductoCreator
        open={quickOpen}
        initialName={quickInitialName}
        onClose={() => {
          setQuickOpen(false);
          setQuickForItemKey(null);
        }}
        onCreated={handleProductoCreado}
        categorias={categorias}
        subcategorias={subcategorias}
        marcas={marcas}
        presentaciones={presentaciones}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "amber" | "emerald";
}) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-slate-200 bg-white text-slate-800";
  return (
    <article className={`rounded-lg border p-4 shadow-sm ${cls}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </article>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? "md:col-span-2 xl:col-span-4" : ""}`}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ItemRow({
  item,
  productos,
  almacenes,
  onUpdate,
  onRemove,
  onQuickCreate,
}: {
  item: ItemForm;
  productos: Producto[];
  almacenes: Almacen[];
  onUpdate: (patch: Partial<ItemForm>) => void;
  onRemove: () => void;
  onQuickCreate: (initialName: string) => void;
}) {
  const subtotal = (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0);
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
        <div>
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Producto
          </span>
          <div className="mt-1 flex items-center gap-1">
            <div className="flex-1">
              <SearchableSelect
                value={item.producto_id}
                onChange={(id) => onUpdate({ producto_id: id, descripcion: "" })}
                options={productos.map((p) => ({
                  id: p.id,
                  label: p.nombre_producto,
                  sub: p.presentacion ?? undefined,
                }))}
                placeholder="Buscar o item libre"
              />
            </div>
            <button
              type="button"
              onClick={() => onQuickCreate(item.descripcion)}
              className="h-11 shrink-0 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              title="Crear producto nuevo en el catalogo"
            >
              + Nuevo
            </button>
          </div>
          {!item.producto_id ? (
            <input
              value={item.descripcion}
              onChange={(e) => onUpdate({ descripcion: e.target.value })}
              placeholder="Descripcion libre (si no esta en catalogo)"
              className={`${inputClassName} mt-1`}
            />
          ) : null}
        </div>
        <div>
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Cantidad
          </span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={item.cantidad}
            onChange={(e) => onUpdate({ cantidad: e.target.value })}
            onFocus={selectOnFocus}
            className={`${inputClassName} mt-1`}
          />
        </div>
        <div>
          <span className="text-[10px] font-medium uppercase text-slate-500">
            Precio unit
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={item.precio_unitario}
            onChange={(e) => onUpdate({ precio_unitario: e.target.value })}
            onFocus={selectOnFocus}
            className={`${inputClassName} mt-1`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Subtotal: {formatMoney(subtotal)}
          </p>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={onRemove}
            className="h-11 rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Quitar
          </button>
        </div>
      </div>
      {item.producto_id ? (
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="text-[10px] font-medium uppercase text-slate-500">
              Almacen destino
            </span>
            <select
              value={item.almacen_destino_id}
              onChange={(e) => onUpdate({ almacen_destino_id: e.target.value })}
              className={`${inputClassName} mt-1`}
            >
              <option value="">Sin almacen (no suma stock)</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase text-slate-500">
              Fecha vto (opcional)
            </span>
            <input
              type="date"
              value={item.fecha_vencimiento}
              onChange={(e) => onUpdate({ fecha_vencimiento: e.target.value })}
              className={`${inputClassName} mt-1`}
            />
          </label>
          <label className="flex items-end gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={item.registrar_stock}
              onChange={(e) => onUpdate({ registrar_stock: e.target.checked })}
              className="h-4 w-4"
            />
            Sumar stock
          </label>
        </div>
      ) : null}
    </div>
  );
}

function CompraRow({
  compra,
  open,
  onOpen,
  items,
  pagos,
  productos,
  almacenes,
  abonoMonto,
  abonoMetodo,
  abonoFecha,
  abonoRef,
  isSaving,
  onAbonoMonto,
  onAbonoMetodo,
  onAbonoFecha,
  onAbonoRef,
  onAbonoSave,
  onPagoDelete,
}: {
  compra: CompraConProveedor;
  open: boolean;
  onOpen: () => void;
  items: ProveedorCompraItem[];
  pagos: ProveedorPago[];
  productos: Producto[];
  almacenes: Almacen[];
  abonoMonto: string;
  abonoMetodo: ProveedorPagoMetodo;
  abonoFecha: string;
  abonoRef: string;
  isSaving: boolean;
  onAbonoMonto: (v: string) => void;
  onAbonoMetodo: (v: ProveedorPagoMetodo) => void;
  onAbonoFecha: (v: string) => void;
  onAbonoRef: (v: string) => void;
  onAbonoSave: () => void;
  onPagoDelete: (pagoId: string) => void;
}) {
  return (
    <article className="p-4">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex-1">
          <p className="font-semibold text-slate-950">
            {compra.proveedores?.nombre ?? "Sin proveedor"} ·{" "}
            <span className="text-sm text-slate-500">
              {compra.numero_documento ? compra.numero_documento : compra.tipo_documento}
            </span>
          </p>
          <p className="text-xs text-slate-500">
            {formatFechaCorta(compra.fecha_compra)}
            {compra.observacion ? ` · ${compra.observacion}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold text-slate-950">{formatMoney(compra.total)}</p>
            <p className="text-xs text-slate-500">
              Pagado {formatMoney(compra.monto_pagado)} · Saldo{" "}
              <span
                className={compra.saldo > 0 ? "font-semibold text-amber-700" : ""}
              >
                {formatMoney(compra.saldo)}
              </span>
            </p>
          </div>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
              ESTADO_BADGE[compra.estado_pago]
            }`}
          >
            {ESTADO_LABEL[compra.estado_pago]}
          </span>
        </div>
      </button>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          {/* Items */}
          {items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Producto</th>
                    <th className="px-2 py-2">Cant</th>
                    <th className="px-2 py-2">P.Unit</th>
                    <th className="px-2 py-2">Subtotal</th>
                    <th className="px-2 py-2">Almacen</th>
                    <th className="px-2 py-2">Vto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it) => {
                    const prod = it.producto_id
                      ? productos.find((p) => p.id === it.producto_id)
                      : null;
                    const alm = it.almacen_destino_id
                      ? almacenes.find((a) => a.id === it.almacen_destino_id)
                      : null;
                    return (
                      <tr key={it.id}>
                        <td className="px-2 py-2">
                          {prod?.nombre_producto ?? it.descripcion ?? "—"}
                        </td>
                        <td className="px-2 py-2">{Number(it.cantidad)}</td>
                        <td className="px-2 py-2">{formatMoney(it.precio_unitario)}</td>
                        <td className="px-2 py-2 font-medium">
                          {formatMoney(it.subtotal)}
                        </td>
                        <td className="px-2 py-2 text-slate-500">
                          {alm?.nombre ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-slate-500">
                          {it.fecha_vencimiento
                            ? formatFechaCorta(it.fecha_vencimiento)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-500">
              Sin detalle de items. Solo cabecera y pagos.
            </p>
          )}

          {/* Pagos */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700">
              Pagos ({pagos.length})
            </h4>
            <div className="mt-2 space-y-1">
              {pagos.length === 0 ? (
                <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-500">
                  Sin pagos registrados.
                </p>
              ) : (
                pagos.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 p-2 text-xs"
                  >
                    <div>
                      <p className="font-medium text-slate-700">
                        {formatMoney(p.monto)} · {p.metodo}
                      </p>
                      <p className="text-slate-500">
                        {formatFechaCorta(p.fecha_pago)}
                        {p.referencia ? ` · ref ${p.referencia}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onPagoDelete(p.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Nuevo abono */}
          {compra.estado_pago !== "pagado" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
              <h4 className="text-sm font-semibold text-emerald-900">
                Registrar abono
              </h4>
              <div className="mt-2 grid gap-2 md:grid-cols-4">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={abonoMonto}
                  onChange={(e) => onAbonoMonto(e.target.value)}
                  onFocus={selectOnFocus}
                  placeholder={`Monto (saldo ${formatMoney(compra.saldo)})`}
                  className={inputClassName}
                />
                <select
                  value={abonoMetodo}
                  onChange={(e) =>
                    onAbonoMetodo(e.target.value as ProveedorPagoMetodo)
                  }
                  className={inputClassName}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="yape">Yape</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="otro">Otro</option>
                </select>
                <input
                  type="date"
                  value={abonoFecha}
                  onChange={(e) => onAbonoFecha(e.target.value)}
                  className={inputClassName}
                />
                <input
                  value={abonoRef}
                  onChange={(e) => onAbonoRef(e.target.value)}
                  placeholder="Referencia"
                  className={inputClassName}
                />
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={onAbonoSave}
                className="mt-2 h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
              >
                {isSaving ? "Guardando..." : "Registrar abono"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
