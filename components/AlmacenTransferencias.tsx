"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getBaseStockByName,
  getStockProductId,
  resolveCasaTiendaIds,
} from "@/lib/inventoryUtils";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import type {
  Almacen,
  AlmacenTransferenciaSolicitud,
  Categoria,
  Marca,
  Producto,
  ProductoAlmacen,
  ProductoPresentacionCompra,
  Proveedor,
  Subcategoria,
} from "@/types/database";

type ProductoStockRow = Producto & {
  categorias: Pick<Categoria, "nombre"> | null;
  subcategorias: Pick<Subcategoria, "nombre"> | null;
  marcas: Pick<Marca, "nombre"> | null;
  producto_almacen: Array<Pick<ProductoAlmacen, "almacen_id" | "stock_actual"> & {
    almacenes: Pick<Almacen, "id" | "nombre"> | null;
  }>;
  producto_base?: {
    id: string;
    nombre_producto?: string | null;
    producto_almacen: Array<Pick<ProductoAlmacen, "almacen_id" | "stock_actual"> & {
      almacenes: Pick<Almacen, "id" | "nombre"> | null;
    }>;
  } | null;
  producto_presentaciones_compra: Array<
    Pick<ProductoPresentacionCompra, "proveedor_id"> & {
      proveedores: Pick<Proveedor, "id" | "nombre" | "telefono"> | null;
    }
  >;
};

type TransferDireccion = "casa_a_negocio" | "negocio_a_casa";

type CartItem = {
  producto: ProductoStockRow;
  cantidad: string;
  direccion?: TransferDireccion;
};

type TransferenciaGuardada = AlmacenTransferenciaSolicitud & {
  almacen_transferencias_items: Array<{
    id: string;
    cantidad_solicitada: number;
    cantidad_recibida: number | null;
    almacen_origen_id: string | null;
    almacen_destino_id: string | null;
    productos: Pick<Producto, "id" | "nombre_producto" | "presentacion" | "producto_base_id"> | null;
    almacen_origen: Pick<Almacen, "id" | "nombre"> | null;
    almacen_destino: Pick<Almacen, "id" | "nombre"> | null;
  }>;
};

function directionLabel(direccion: TransferDireccion) {
  return direccion === "casa_a_negocio" ? "Casa -> Negocio" : "Negocio -> Casa";
}

function defaultDireccionForSide(side: "negocio" | "casa"): TransferDireccion {
  return side === "casa" ? "casa_a_negocio" : "negocio_a_casa";
}

type Message = {
  type: "success" | "error";
  text: string;
};

const almacenWhatsapp = "942025999";
const abastecimientoWhatsapp = "943104987";
const abastecimientoUrl = "https://app-minimarket.vercel.app/almacen/abastecimiento";
const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function formatStock(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2).replace(/\.00$/, "");
}

function getStockLevel(producto: ProductoStockRow) {
  const negocio = getBaseStockByName(producto, "Tienda");
  const minimo = Number(producto.stock_minimo ?? 10);

  if (negocio <= 0) {
    return "sin";
  }
  if (negocio <= minimo) {
    return "bajo";
  }
  if (negocio > minimo * 3) {
    return "alto";
  }
  return "normal";
}

function proveedorPrincipal(producto: ProductoStockRow) {
  return producto.producto_presentaciones_compra.find((item) => item.proveedores)?.proveedores ?? null;
}

function buildWhatsAppUrl(numero: string, mensaje: string) {
  return `https://wa.me/51${numero}?text=${encodeURIComponent(mensaje)}`;
}

export function AlmacenTransferencias() {
  const [productos, setProductos] = useState<ProductoStockRow[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [solicitudes, setSolicitudes] = useState<TransferenciaGuardada[]>([]);
  const [search, setSearch] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [subcategoriaId, setSubcategoriaId] = useState("");
  const [stockFilter, setStockFilter] = useState<"todos" | "bajo" | "normal" | "alto" | "sin">("bajo");
  const [transferCart, setTransferCart] = useState<CartItem[]>([]);
  const [pedidoCart, setPedidoCart] = useState<CartItem[]>([]);
  const [pedidoProveedorId, setPedidoProveedorId] = useState("");
  const [pedidoUrgencia, setPedidoUrgencia] = useState<"baja" | "normal" | "alta">("normal");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const filteredProductos = useMemo(() => {
    return productos.filter((producto) => {
      const level = getStockLevel(producto);
      return stockFilter === "todos" || level === stockFilter;
    });
  }, [productos, stockFilter]);

  async function loadCatalogos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      return;
    }

    const [categoriasResult, subcategoriasResult, almacenesResult, proveedoresResult] = await Promise.all([
      supabase.from("categorias").select("*").eq("activo", true).order("nombre"),
      supabase.from("subcategorias").select("*").eq("activo", true).order("nombre"),
      supabase.from("almacenes").select("*").eq("activo", true).order("nombre"),
      supabase.from("proveedores").select("*").eq("activo", true).order("nombre"),
    ]);

    if (!categoriasResult.error) {
      setCategorias((categoriasResult.data ?? []) as Categoria[]);
    }
    if (!subcategoriasResult.error) {
      setSubcategorias((subcategoriasResult.data ?? []) as Subcategoria[]);
    }
    if (!almacenesResult.error) {
      setAlmacenes((almacenesResult.data ?? []) as Almacen[]);
    }
    if (!proveedoresResult.error) {
      setProveedores((proveedoresResult.data ?? []) as Proveedor[]);
    }
  }

  async function loadProductos() {
    if (!supabase) {
      return;
    }

    setIsLoading(true);
    let query = supabase
      .from("productos")
      .select(
        `
          *,
          categorias(nombre),
          subcategorias(nombre),
          marcas(nombre),
          producto_almacen(almacen_id,stock_actual,almacenes(id,nombre)),
          producto_presentaciones_compra(proveedor_id,proveedores(id,nombre,telefono))
        `,
      )
      .eq("activo", true)
      .order("nombre_producto");

    if (categoriaId) {
      query = query.eq("categoria_id", categoriaId);
    }
    if (subcategoriaId) {
      query = query.eq("subcategoria_id", subcategoriaId);
    }

    const { data, error } = await fetchAllRows<ProductoStockRow>(query);

    if (error) {
      setIsLoading(false);
      setMessage({ type: "error", text: `No se pudo cargar stock: ${error.message}` });
      setProductos([]);
      return;
    }

    // Prefetch del stock del producto base para presentaciones (resolver via base).
    const baseIds = Array.from(
      new Set(
        data
          .map((p) => p.producto_base_id)
          .filter((v): v is string => Boolean(v)),
      ),
    );

    const baseMap = new Map<string, NonNullable<ProductoStockRow["producto_base"]>>();
    if (baseIds.length > 0) {
      const { data: baseRows, error: baseError } = await supabase
        .from("productos")
        .select("id,nombre_producto,producto_almacen(almacen_id,stock_actual,almacenes(id,nombre))")
        .in("id", baseIds);
      if (baseError) {
        setIsLoading(false);
        setMessage({ type: "error", text: `No se pudo cargar producto base: ${baseError.message}` });
        setProductos([]);
        return;
      }
      for (const row of baseRows ?? []) {
        const baseRow = row as unknown as NonNullable<ProductoStockRow["producto_base"]>;
        baseMap.set(baseRow.id, baseRow);
      }
    }

    const merged = data.map((producto) => {
      if (!producto.producto_base_id) return producto;
      const base = baseMap.get(producto.producto_base_id);
      return base ? { ...producto, producto_base: base } : producto;
    });

    setIsLoading(false);
    setProductos(
      merged.filter((producto) =>
        matchesSearch(search, [
          producto.codigo_interno,
          producto.nombre_producto,
          producto.presentacion,
          producto.marcas?.nombre,
          producto.categorias?.nombre,
          producto.subcategorias?.nombre,
        ]),
      ),
    );
  }

  async function loadSolicitudes() {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("almacen_transferencias_solicitudes")
      .select(
        `
          *,
          almacen_transferencias_items(
            id,
            cantidad_solicitada,
            cantidad_recibida,
            almacen_origen_id,
            almacen_destino_id,
            productos(id,nombre_producto,presentacion,producto_base_id),
            almacen_origen:almacenes!almacen_transferencias_items_almacen_origen_id_fkey(id,nombre),
            almacen_destino:almacenes!almacen_transferencias_items_almacen_destino_id_fkey(id,nombre)
          )
        `,
      )
      .order("created_at", { ascending: false })
      .limit(5);

    if (!error) {
      setSolicitudes((data ?? []) as TransferenciaGuardada[]);
    }
  }

  useEffect(() => {
    void loadCatalogos();
    void loadProductos();
    void loadSolicitudes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProductos();
    }, 350);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoriaId, subcategoriaId]);

  function addToCart(
    type: "transfer" | "pedido",
    producto: ProductoStockRow,
    direccion?: TransferDireccion,
  ) {
    const setter = type === "transfer" ? setTransferCart : setPedidoCart;
    setter((current) => {
      const exists = current.find((item) => item.producto.id === producto.id);
      if (exists) {
        if (type === "transfer" && direccion && exists.direccion !== direccion) {
          return current.map((item) =>
            item.producto.id === producto.id ? { ...item, direccion } : item,
          );
        }
        return current;
      }
      return [...current, { producto, cantidad: "1", direccion: type === "transfer" ? direccion ?? "casa_a_negocio" : undefined }];
    });
  }

  function updateCart(type: "transfer" | "pedido", productoId: string, cantidad: string) {
    const setter = type === "transfer" ? setTransferCart : setPedidoCart;
    setter((current) =>
      current.map((item) => (item.producto.id === productoId ? { ...item, cantidad } : item)),
    );
  }

  function setCartDireccion(productoId: string, direccion: TransferDireccion) {
    setTransferCart((current) =>
      current.map((item) => (item.producto.id === productoId ? { ...item, direccion } : item)),
    );
  }

  function removeCart(type: "transfer" | "pedido", productoId: string) {
    const setter = type === "transfer" ? setTransferCart : setPedidoCart;
    setter((current) => current.filter((item) => item.producto.id !== productoId));
  }

  async function saveTransferRequest() {
    if (!supabase || transferCart.length === 0) {
      return;
    }

    const invalid = transferCart.some((item) => Number(item.cantidad) <= 0 || !Number.isFinite(Number(item.cantidad)));
    if (invalid) {
      setMessage({ type: "error", text: "Revisa cantidades de transferencia." });
      return;
    }

    const { casaId, tiendaId } = resolveCasaTiendaIds(almacenes);

    if (!casaId || !tiendaId) {
      setMessage({ type: "error", text: "No se encontraron almacenes Casa y Tienda." });
      return;
    }

    setIsSaving(true);
    const solicitud = await supabase
      .from("almacen_transferencias_solicitudes")
      .insert({ estado: "enviado", observacion: "Solicitud enviada por WhatsApp" })
      .select("id")
      .single();

    if (solicitud.error || !solicitud.data) {
      setIsSaving(false);
      setMessage({ type: "error", text: `No se guardo transferencia: ${solicitud.error?.message}` });
      return;
    }

    const solicitudId = solicitud.data.id as string;
    const items = transferCart.map((item) => {
      const direccion = item.direccion ?? "casa_a_negocio";
      const origenId = direccion === "casa_a_negocio" ? casaId : tiendaId;
      const destinoId = direccion === "casa_a_negocio" ? tiendaId : casaId;
      return {
        solicitud_id: solicitudId,
        producto_id: item.producto.id,
        cantidad_solicitada: Number(item.cantidad),
        almacen_origen_id: origenId,
        almacen_destino_id: destinoId,
      };
    });
    const result = await supabase.from("almacen_transferencias_items").insert(items);
    setIsSaving(false);

    if (result.error) {
      setMessage({ type: "error", text: `No se guardaron items: ${result.error.message}` });
      return;
    }

    const grupos = new Map<TransferDireccion, CartItem[]>();
    for (const item of transferCart) {
      const direccion = item.direccion ?? "casa_a_negocio";
      const lista = grupos.get(direccion) ?? [];
      lista.push(item);
      grupos.set(direccion, lista);
    }

    const partes: string[] = ["Solicitud de transferencia entre almacenes", ""];
    for (const [direccion, lista] of grupos) {
      partes.push(directionLabel(direccion));
      for (const item of lista) {
        partes.push(`- ${item.cantidad} ${item.producto.presentacion ?? ""} ${item.producto.nombre_producto}`);
      }
      partes.push("");
    }

    window.open(buildWhatsAppUrl(almacenWhatsapp, partes.join("\n")), "_blank", "noopener,noreferrer");
    setTransferCart([]);
    setMessage({ type: "success", text: "Solicitud de transferencia guardada y WhatsApp generado." });
    await loadSolicitudes();
  }

  async function saveAbastecimiento() {
    if (!supabase || pedidoCart.length === 0) {
      return;
    }

    const invalid = pedidoCart.some((item) => Number(item.cantidad) <= 0 || !Number.isFinite(Number(item.cantidad)));
    if (invalid) {
      setMessage({ type: "error", text: "Revisa cantidades del pedido." });
      return;
    }

    setIsSaving(true);
    const pedido = await supabase
      .from("abastecimiento_pedidos")
      .insert({
        proveedor_id: pedidoProveedorId || null,
        urgencia: pedidoUrgencia,
        estado: "enviado",
        observacion: "Pedido generado desde transferencias",
      })
      .select("id")
      .single();

    if (pedido.error || !pedido.data) {
      setIsSaving(false);
      setMessage({ type: "error", text: `No se guardo pedido: ${pedido.error?.message}` });
      return;
    }

    const pedidoId = pedido.data.id as string;
    const items = pedidoCart.map((item) => ({
      pedido_id: pedidoId,
      producto_id: item.producto.id,
      cantidad: Number(item.cantidad),
    }));
    const result = await supabase.from("abastecimiento_items").insert(items);
    setIsSaving(false);

    if (result.error) {
      setMessage({ type: "error", text: `No se guardaron items: ${result.error.message}` });
      return;
    }

    const proveedor = proveedores.find((item) => item.id === pedidoProveedorId);
    const mensaje = [
      "Lista de productos para abastecimiento",
      proveedor ? `Proveedor: ${proveedor.nombre}` : "Proveedor: por definir",
      `Urgencia: ${pedidoUrgencia}`,
      "",
      ...pedidoCart.map((item) => `- ${item.cantidad} ${item.producto.presentacion ?? ""} ${item.producto.nombre_producto}`),
      "",
      `Revisar: ${abastecimientoUrl}`,
    ].join("\n");

    window.open(buildWhatsAppUrl(abastecimientoWhatsapp, mensaje), "_blank", "noopener,noreferrer");
    setPedidoCart([]);
    setMessage({ type: "success", text: "Pedido de abastecimiento guardado y WhatsApp generado." });
  }

  async function confirmarTransferencia(solicitud: TransferenciaGuardada) {
    if (!supabase) {
      return;
    }

    const { casaId, tiendaId } = resolveCasaTiendaIds(almacenes);

    setIsSaving(true);
    for (const item of solicitud.almacen_transferencias_items) {
      const cantidad = Number(item.cantidad_recibida ?? item.cantidad_solicitada);
      if (!item.productos?.id || cantidad <= 0) {
        continue;
      }
      const origenId = item.almacen_origen_id ?? casaId;
      const destinoId = item.almacen_destino_id ?? tiendaId;
      if (!origenId || !destinoId) {
        setIsSaving(false);
        setMessage({ type: "error", text: "Faltan almacenes Casa y Tienda para confirmar." });
        return;
      }
      // Resolver al producto base: el stock real vive ahi, no en la presentacion.
      const productoStockId = getStockProductId({
        id: item.productos.id,
        producto_base_id: item.productos.producto_base_id ?? null,
      });
      const result = await supabase.rpc("transferir_stock", {
        p_producto_id: productoStockId,
        p_almacen_origen_id: origenId,
        p_almacen_destino_id: destinoId,
        p_cantidad: cantidad,
        p_observacion: `Confirmacion solicitud ${solicitud.id.slice(0, 8)}`,
        p_usuario_id: null,
      });
      if (result.error) {
        setIsSaving(false);
        setMessage({ type: "error", text: `No se pudo confirmar: ${result.error.message}` });
        return;
      }
    }
    await supabase.from("almacen_transferencias_solicitudes").update({ estado: "recibido" }).eq("id", solicitud.id);
    setIsSaving(false);
    setMessage({ type: "success", text: "Transferencia confirmada y stock actualizado." });
    await loadProductos();
    await loadSolicitudes();
  }

  async function updateReceived(itemId: string, value: string) {
    if (!supabase) {
      return;
    }
    const cantidad = Number(value);
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      return;
    }
    await supabase.from("almacen_transferencias_items").update({ cantidad_recibida: cantidad }).eq("id", itemId);
    await loadSolicitudes();
  }

  return (
    <div className="space-y-5">
      {message ? (
        <div className={`rounded-lg border p-4 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en negocio" className={inputClassName} />
          <select value={categoriaId} onChange={(event) => setCategoriaId(event.target.value)} className={inputClassName}>
            <option value="">Categoria</option>
            {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
          </select>
          <select value={subcategoriaId} onChange={(event) => setSubcategoriaId(event.target.value)} className={inputClassName}>
            <option value="">Subcategoria</option>
            {subcategorias
              .filter((subcategoria) => !categoriaId || subcategoria.categoria_id === categoriaId)
              .map((subcategoria) => <option key={subcategoria.id} value={subcategoria.id}>{subcategoria.nombre}</option>)}
          </select>
          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)} className={inputClassName}>
            <option value="bajo">Stock bajo</option>
            <option value="sin">Sin stock negocio</option>
            <option value="normal">Stock normal</option>
            <option value="alto">Stock alto</option>
            <option value="todos">Todos</option>
          </select>
          <Link href="/almacen/abastecimiento" className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">
            Ver abastecimiento
          </Link>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <Header title="Negocio" description="Stock en tienda. Transferir manda a Casa." />
          <ProductRows productos={filteredProductos} side="negocio" onTransfer={addToCart} onPedido={addToCart} isLoading={isLoading} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <Header title="Casa" description="Stock en deposito. Transferir manda al Negocio." />
          <ProductRows productos={filteredProductos} side="casa" onTransfer={addToCart} onPedido={addToCart} isLoading={isLoading} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <CartPanel title="Lista para transferir" items={transferCart} type="transfer" onChange={updateCart} onRemove={removeCart} onSave={saveTransferRequest} isSaving={isSaving} button="Enviar WhatsApp a almacen" onChangeDireccion={setCartDireccion} />
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <select value={pedidoProveedorId} onChange={(event) => setPedidoProveedorId(event.target.value)} className={inputClassName}>
              <option value="">Proveedor por definir</option>
              {proveedores.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
            </select>
            <select value={pedidoUrgencia} onChange={(event) => setPedidoUrgencia(event.target.value as typeof pedidoUrgencia)} className={inputClassName}>
              <option value="baja">Urgencia baja</option>
              <option value="normal">Urgencia normal</option>
              <option value="alta">Urgencia alta</option>
            </select>
          </div>
          <CartPanel embedded title="Lista para pedir" items={pedidoCart} type="pedido" onChange={updateCart} onRemove={removeCart} onSave={saveAbastecimiento} isSaving={isSaving} button="Enviar WhatsApp al duenio" />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <Header title="Transferencias guardadas" description="Se guardan para validar fisicamente y actualizar stock cuando llegue." />
        <div className="divide-y divide-slate-100">
          {solicitudes.map((solicitud) => (
            <article key={solicitud.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-950">Solicitud #{solicitud.id.slice(0, 8)}</p>
                  <p className="text-xs text-slate-500">{new Date(solicitud.created_at).toLocaleString("es-PE")} - {solicitud.estado}</p>
                </div>
                {solicitud.estado !== "recibido" ? (
                  <button type="button" disabled={isSaving} onClick={() => void confirmarTransferencia(solicitud)} className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
                    Confirmar envio recibido
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {solicitud.almacen_transferencias_items.map((item) => {
                  const origen = item.almacen_origen?.nombre ?? "?";
                  const destino = item.almacen_destino?.nombre ?? "?";
                  return (
                    <div key={item.id} className="rounded-md border border-slate-200 p-3 text-sm">
                      <p className="font-medium text-slate-950">{item.productos?.nombre_producto}</p>
                      <p className="text-xs text-slate-500">{origen} -&gt; {destino}</p>
                      <p className="text-xs text-slate-500">Solicitado: {formatStock(item.cantidad_solicitada)}</p>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={item.cantidad_recibida ?? item.cantidad_solicitada}
                        onBlur={(event) => void updateReceived(item.id, event.target.value)}
                        className="mt-2 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                      />
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Header({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function ProductRows({ productos, side, onTransfer, onPedido, isLoading }: { productos: ProductoStockRow[]; side: "negocio" | "casa"; onTransfer: (type: "transfer" | "pedido", producto: ProductoStockRow, direccion?: TransferDireccion) => void; onPedido: (type: "transfer" | "pedido", producto: ProductoStockRow) => void; isLoading: boolean }) {
  if (isLoading) {
    return <p className="p-4 text-sm text-slate-500">Cargando productos...</p>;
  }
  const direccionDefault = defaultDireccionForSide(side);
  return (
    <div className="divide-y divide-slate-100">
      {productos.map((producto) => {
        const negocio = getBaseStockByName(producto, "Tienda");
        const casa = getBaseStockByName(producto, "Casa");
        const principal = proveedorPrincipal(producto);
        return (
          <article key={`${side}-${producto.id}`} className="grid gap-3 p-4 md:grid-cols-[1fr_110px_180px] md:items-center">
            <div>
              <p className="font-medium text-slate-950">{producto.nombre_producto}</p>
              <p className="mt-1 text-xs text-slate-500">{producto.presentacion ?? "Sin presentacion"} - {producto.marcas?.nombre ?? "Sin marca"}</p>
              {principal ? <p className="mt-1 text-xs text-slate-500">Prov. {principal.nombre}</p> : null}
            </div>
            <div className="rounded-md bg-slate-50 p-2 text-sm">
              <p className="text-xs text-slate-500">{side === "negocio" ? "Negocio" : "Casa"}</p>
              <p className="font-semibold text-slate-950">{formatStock(side === "negocio" ? negocio : casa)}</p>
              {side === "negocio" ? <p className="text-xs text-slate-500">Min {formatStock(producto.stock_minimo)}</p> : null}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onTransfer("transfer", producto, direccionDefault)} className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700" title={`Enviar ${directionLabel(direccionDefault)}`}>Transferir</button>
              <button type="button" onClick={() => onPedido("pedido", producto)} className="h-9 rounded-md bg-slate-900 px-3 text-xs font-medium text-white">Hacer pedido</button>
            </div>
          </article>
        );
      })}
      {productos.length === 0 ? <p className="p-4 text-sm text-slate-500">No hay productos con estos filtros.</p> : null}
    </div>
  );
}

function CartPanel({ title, items, type, onChange, onRemove, onSave, isSaving, button, embedded, onChangeDireccion }: { title: string; items: CartItem[]; type: "transfer" | "pedido"; onChange: (type: "transfer" | "pedido", productoId: string, cantidad: string) => void; onRemove: (type: "transfer" | "pedido", productoId: string) => void; onSave: () => void; isSaving: boolean; button: string; embedded?: boolean; onChangeDireccion?: (productoId: string, direccion: TransferDireccion) => void }) {
  const isTransfer = type === "transfer";
  return (
    <section className={embedded ? "mt-4" : "rounded-lg border border-slate-200 bg-white p-4 shadow-sm"}>
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.producto.id} className={`grid gap-2 rounded-md border border-slate-200 p-3 text-sm md:items-center ${isTransfer ? "md:grid-cols-[1fr_180px_110px_80px]" : "md:grid-cols-[1fr_110px_80px]"}`}>
            <span className="font-medium text-slate-950">{item.producto.nombre_producto}</span>
            {isTransfer ? (
              <select
                value={item.direccion ?? "casa_a_negocio"}
                onChange={(event) => onChangeDireccion?.(item.producto.id, event.target.value as TransferDireccion)}
                className="h-9 rounded-md border border-slate-300 px-2 text-xs"
                title="Direccion de la transferencia"
              >
                <option value="casa_a_negocio">Casa -&gt; Negocio</option>
                <option value="negocio_a_casa">Negocio -&gt; Casa</option>
              </select>
            ) : null}
            <input type="number" min="0.01" step="0.01" value={item.cantidad} onChange={(event) => onChange(type, item.producto.id, event.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-sm" />
            <button type="button" onClick={() => onRemove(type, item.producto.id)} className="h-9 rounded-md border border-red-200 px-2 text-xs font-medium text-red-700">Quitar</button>
          </div>
        ))}
        {items.length === 0 ? <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">Agrega productos desde las columnas superiores.</p> : null}
      </div>
      <button type="button" disabled={isSaving || items.length === 0} onClick={onSave} className="mt-4 h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
        {button}
      </button>
    </section>
  );
}
