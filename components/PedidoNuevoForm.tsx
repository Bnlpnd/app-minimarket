"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type {
  Cliente,
  Marca,
  PagoMetodo,
  PedidoEstado,
  Producto,
} from "@/types/database";

type ProductoPedido = Producto & {
  marcas: Pick<Marca, "nombre"> | null;
};

type PedidoItem = {
  producto: ProductoPedido;
  cantidad: number;
};

type ClienteForm = {
  nombres: string;
  whatsapp: string;
};

type Message = {
  type: "success" | "error";
  text: string;
};

const emptyClienteForm: ClienteForm = {
  nombres: "",
  whatsapp: "",
};

const allowedCaptureTypes = ["image/jpeg", "image/png", "image/webp"];
const maxCaptureSize = 1024 * 1024;
const inputClassName =
  "h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeWhatsapp(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function normalizeSearch(value: string) {
  return normalizeSpaces(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatMoney(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

function getStock(producto: ProductoPedido) {
  return Number(producto.stock_actual ?? 0);
}

function getPrecio(producto: ProductoPedido) {
  return Number(producto.precio_venta ?? 0);
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function PedidoNuevoForm() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<ProductoPedido[]>([]);
  const [clienteSearch, setClienteSearch] = useState("");
  const [productoSearch, setProductoSearch] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [clienteForm, setClienteForm] = useState<ClienteForm>(emptyClienteForm);
  const [items, setItems] = useState<PedidoItem[]>([]);
  const [fechaRecojo, setFechaRecojo] = useState(getTodayDate());
  const [horaRecojo, setHoraRecojo] = useState("");
  const [notaCliente, setNotaCliente] = useState("");
  const [metodoPago, setMetodoPago] = useState<PagoMetodo>("yape");
  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const [capturePreview, setCapturePreview] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCliente, setIsSavingCliente] = useState(false);
  const [isSavingPedido, setIsSavingPedido] = useState(false);

  async function loadInitialData() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const [clientesResult, productosResult] = await Promise.all([
      supabase
        .from("clientes")
        .select("*")
        .eq("activo", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("productos")
        .select("*, marcas(nombre)")
        .eq("activo", true)
        .order("nombre_producto", { ascending: true })
        .range(0, 2499),
    ]);

    if (clientesResult.error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar clientes: ${clientesResult.error.message}`,
      });
      setIsLoading(false);
      return;
    }

    if (productosResult.error) {
      setMessage({
        type: "error",
        text: `No se pudieron cargar productos: ${productosResult.error.message}`,
      });
      setIsLoading(false);
      return;
    }

    setClientes((clientesResult.data ?? []) as Cliente[]);
    setProductos((productosResult.data ?? []) as ProductoPedido[]);
    setIsLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadInitialData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    return () => {
      if (capturePreview) {
        URL.revokeObjectURL(capturePreview);
      }
    };
  }, [capturePreview]);

  const filteredClientes = useMemo(() => {
    const term = normalizeSearch(clienteSearch);

    if (!term) {
      return clientes.slice(0, 8);
    }

    return clientes
      .filter((cliente) =>
        normalizeSearch(`${cliente.nombres} ${cliente.telefono ?? ""}`).includes(
          term,
        ),
      )
      .slice(0, 8);
  }, [clientes, clienteSearch]);

  const filteredProductos = useMemo(() => {
    const term = normalizeSearch(productoSearch);

    if (!term) {
      return productos.slice(0, 12);
    }

    return productos
      .filter((producto) =>
        normalizeSearch(
          `${producto.codigo_interno} ${producto.nombre_producto} ${
            producto.marcas?.nombre ?? ""
          }`,
        ).includes(term),
      )
      .slice(0, 20);
  }, [productos, productoSearch]);

  const total = useMemo(() => {
    return items.reduce(
      (sum, item) => sum + item.cantidad * getPrecio(item.producto),
      0,
    );
  }, [items]);

  const stockErrors = useMemo(() => {
    return items
      .filter((item) => item.cantidad > getStock(item.producto))
      .map(
        (item) =>
          `${item.producto.nombre_producto}: stock ${getStock(item.producto)}`,
      );
  }, [items]);

  function clearCapture() {
    if (capturePreview) {
      URL.revokeObjectURL(capturePreview);
    }

    setCaptureFile(null);
    setCapturePreview("");
    setCaptureError("");
  }

  function handleCaptureChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    clearCapture();

    if (!file) {
      return;
    }

    if (!allowedCaptureTypes.includes(file.type)) {
      setCaptureError("La captura debe ser jpg, jpeg, png o webp.");
      event.target.value = "";
      return;
    }

    if (file.size > maxCaptureSize) {
      setCaptureError("La captura no debe superar 1 MB.");
      event.target.value = "";
      return;
    }

    setCaptureFile(file);
    setCapturePreview(URL.createObjectURL(file));
  }

  function addProducto(producto: ProductoPedido) {
    setItems((current) => {
      const existingItem = current.find(
        (item) => item.producto.id === producto.id,
      );

      if (existingItem) {
        return current.map((item) =>
          item.producto.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item,
        );
      }

      return [...current, { producto, cantidad: 1 }];
    });
  }

  function updateCantidad(productoId: string, value: string) {
    const parsed = Number(value);
    const cantidad = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;

    setItems((current) =>
      current.map((item) =>
        item.producto.id === productoId ? { ...item, cantidad } : item,
      ),
    );
  }

  function removeProducto(productoId: string) {
    setItems((current) =>
      current.filter((item) => item.producto.id !== productoId),
    );
  }

  async function createQuickCliente(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return;
    }

    const nombres = normalizeSpaces(clienteForm.nombres);
    const whatsapp = normalizeWhatsapp(clienteForm.whatsapp);

    if (!nombres || !whatsapp) {
      setMessage({
        type: "error",
        text: "Nombre y WhatsApp son obligatorios para crear cliente.",
      });
      return;
    }

    const duplicated = clientes.find(
      (cliente) => normalizeWhatsapp(cliente.telefono ?? "") === whatsapp,
    );

    if (duplicated) {
      setSelectedCliente(duplicated);
      setMessage({
        type: "success",
        text: "El cliente ya existia y fue seleccionado.",
      });
      return;
    }

    setIsSavingCliente(true);
    const { data, error } = await supabase
      .from("clientes")
      .insert({ nombres, telefono: whatsapp })
      .select("*")
      .single();
    setIsSavingCliente(false);

    if (error) {
      setMessage({
        type: "error",
        text:
          error.code === "23505"
            ? "Ya existe un cliente con ese WhatsApp."
            : `No se pudo crear el cliente: ${error.message}`,
      });
      return;
    }

    const cliente = data as Cliente;
    setClientes((current) => [cliente, ...current]);
    setSelectedCliente(cliente);
    setClienteForm(emptyClienteForm);
    setMessage({ type: "success", text: "Cliente creado y seleccionado." });
  }

  async function getRegistradoPorId() {
    if (!supabase) {
      return null;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      return null;
    }

    const { data } = await supabase
      .from("usuarios_perfil")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    return data?.id ?? null;
  }

  function buildCapturePath(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const clientePart = selectedCliente?.id ?? "sin-cliente";

    return `capturas/${clientePart}-${Date.now()}.${extension}`;
  }

  async function uploadCapture() {
    if (!captureFile) {
      return null;
    }

    if (!supabase) {
      setCaptureError(
        supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      );
      return null;
    }

    const capturePath = buildCapturePath(captureFile);
    const { error } = await supabase.storage
      .from("pagos")
      .upload(capturePath, captureFile, {
        cacheControl: "3600",
        contentType: captureFile.type,
        upsert: false,
      });

    if (error) {
      setCaptureError(`No se pudo subir la captura: ${error.message}`);
      return null;
    }

    const { data } = supabase.storage.from("pagos").getPublicUrl(capturePath);

    // Si el bucket pagos fuera privado, aqui se generaria un signedUrl
    // desde una ruta de servidor para no exponer permisos sensibles.
    return data.publicUrl;
  }

  function validatePedido() {
    if (!selectedCliente) {
      return "Selecciona o crea un cliente.";
    }

    if (items.length === 0) {
      return "Agrega al menos un producto.";
    }

    if (items.some((item) => item.cantidad <= 0)) {
      return "Todas las cantidades deben ser mayores a cero.";
    }

    if (stockErrors.length > 0) {
      return `Hay productos sin stock suficiente: ${stockErrors.join(", ")}.`;
    }

    if (!fechaRecojo) {
      return "Selecciona la fecha de recojo.";
    }

    if (!horaRecojo) {
      return "Selecciona la hora de recojo.";
    }

    return null;
  }

  async function savePedido() {
    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return;
    }

    const validationError = validatePedido();

    if (validationError || !selectedCliente) {
      setMessage({ type: "error", text: validationError ?? "Datos invalidos." });
      return;
    }

    setIsSavingPedido(true);
    setMessage(null);
    setCaptureError("");

    const capturaYapeUrl = metodoPago === "yape" ? await uploadCapture() : null;

    if (metodoPago === "yape" && captureFile && !capturaYapeUrl) {
      setIsSavingPedido(false);
      return;
    }

    const pedidoEstado: PedidoEstado =
      metodoPago === "yape" && capturaYapeUrl ? "pago_enviado" : "pendiente";
    const pagoEstado = metodoPago === "yape" && capturaYapeUrl ? "enviado" : "pendiente";
    const registradoPorId = await getRegistradoPorId();
    const fechaRecojoIso = new Date(`${fechaRecojo}T${horaRecojo}:00`).toISOString();
    const nota = normalizeSpaces(notaCliente);

    const { data: pedidoData, error: pedidoError } = await supabase
      .from("pedidos")
      .insert({
        cliente_id: selectedCliente.id,
        registrado_por_id: registradoPorId,
        fecha_recojo: fechaRecojoIso,
        hora_recojo: horaRecojo,
        estado: pedidoEstado,
        subtotal: total,
        total,
        metodo_pago: metodoPago,
        nota_cliente: nota || null,
        observaciones: nota || null,
        detalle_manual: items
          .map((item) => `${item.cantidad} x ${item.producto.nombre_producto}`)
          .join("; "),
      })
      .select("id")
      .single();

    if (pedidoError || !pedidoData) {
      setIsSavingPedido(false);
      setMessage({
        type: "error",
        text: `No se pudo guardar el pedido: ${pedidoError?.message ?? "sin respuesta"}`,
      });
      return;
    }

    const pedidoId = pedidoData.id as string;
    const detallePayload = items.map((item) => ({
      pedido_id: pedidoId,
      producto_id: item.producto.id,
      cantidad: item.cantidad,
      precio_unitario: getPrecio(item.producto),
      preparado: false,
    }));
    const { error: detalleError } = await supabase
      .from("detalle_pedido")
      .insert(detallePayload);

    if (detalleError) {
      setIsSavingPedido(false);
      setMessage({
        type: "error",
        text: `El pedido se creo, pero fallo el detalle: ${detalleError.message}`,
      });
      return;
    }

    const { error: pagoError } = await supabase.from("pagos").insert({
      pedido_id: pedidoId,
      metodo: metodoPago,
      estado: pagoEstado,
      monto: total,
      captura_yape_url: capturaYapeUrl,
    });

    setIsSavingPedido(false);

    if (pagoError) {
      setMessage({
        type: "error",
        text: `El pedido se creo, pero fallo el pago: ${pagoError.message}`,
      });
      return;
    }

    setMessage({
      type: "success",
      text: `Pedido guardado correctamente. Codigo interno: ${pedidoId}`,
    });
    setSelectedCliente(null);
    setClienteSearch("");
    setItems([]);
    setFechaRecojo(getTodayDate());
    setHoraRecojo("");
    setNotaCliente("");
    setMetodoPago("yape");
    clearCapture();
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

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel title="Cliente">
            <Field label="Buscar por nombre o WhatsApp">
              <input
                type="search"
                value={clienteSearch}
                onChange={(event) => setClienteSearch(event.target.value)}
                placeholder="Ej. Ana o 999888777"
                className={inputClassName}
              />
            </Field>

            <div className="mt-3 max-h-64 space-y-2 overflow-auto">
              {isLoading ? (
                <p className="text-sm text-slate-500">Cargando clientes...</p>
              ) : filteredClientes.length > 0 ? (
                filteredClientes.map((cliente) => (
                  <button
                    key={cliente.id}
                    type="button"
                    onClick={() => setSelectedCliente(cliente)}
                    className={`w-full rounded-md border p-3 text-left text-sm hover:bg-slate-50 ${
                      selectedCliente?.id === cliente.id
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200"
                    }`}
                  >
                    <span className="block font-medium text-slate-950">
                      {cliente.nombres}
                    </span>
                    <span className="text-slate-500">
                      {cliente.telefono ?? "Sin WhatsApp"}
                    </span>
                  </button>
                ))
              ) : (
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                  No hay coincidencias.
                </p>
              )}
            </div>

            <form onSubmit={createQuickCliente} className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Crear cliente rapido
              </h3>
              <input
                value={clienteForm.nombres}
                onChange={(event) =>
                  setClienteForm((current) => ({
                    ...current,
                    nombres: event.target.value,
                  }))
                }
                placeholder="Nombre"
                className={inputClassName}
              />
              <input
                value={clienteForm.whatsapp}
                onChange={(event) =>
                  setClienteForm((current) => ({
                    ...current,
                    whatsapp: event.target.value,
                  }))
                }
                placeholder="WhatsApp"
                className={inputClassName}
              />
              <button
                type="submit"
                disabled={isSavingCliente}
                className="h-10 w-full rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-300"
              >
                {isSavingCliente ? "Creando..." : "Crear y seleccionar"}
              </button>
            </form>
          </Panel>

          <Panel title="Recojo y pago">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Field label="Fecha de recojo" required>
                <input
                  type="date"
                  value={fechaRecojo}
                  onChange={(event) => setFechaRecojo(event.target.value)}
                  className={inputClassName}
                />
              </Field>
              <Field label="Hora de recojo" required>
                <input
                  type="time"
                  value={horaRecojo}
                  onChange={(event) => setHoraRecojo(event.target.value)}
                  className={inputClassName}
                />
              </Field>
            </div>

            <Field label="Nota del cliente">
              <textarea
                value={notaCliente}
                onChange={(event) => setNotaCliente(event.target.value)}
                rows={3}
                placeholder="Indicaciones del cliente"
                className={`${inputClassName} min-h-24 py-2`}
              />
            </Field>

            <Field label="Metodo de pago" required>
              <select
                value={metodoPago}
                onChange={(event) => {
                  setMetodoPago(event.target.value as PagoMetodo);
                  if (event.target.value !== "yape") {
                    clearCapture();
                  }
                }}
                className={`${inputClassName} bg-white`}
              >
                <option value="yape">Yape</option>
                <option value="efectivo">Efectivo</option>
                <option value="otro">Otro</option>
              </select>
            </Field>

            {metodoPago === "yape" ? (
              <Field label="Captura Yape">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCaptureChange}
                  className="block w-full text-sm text-slate-700 file:mr-3 file:h-10 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
                />
                <p className="mt-1 text-xs text-slate-500">
                  JPG, PNG o WebP. Tamano maximo 1 MB.
                </p>
                {captureError ? (
                  <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {captureError}
                  </p>
                ) : null}
                {capturePreview ? (
                  <div className="mt-3 flex items-center gap-3 rounded-md bg-slate-50 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capturePreview}
                      alt="Preview captura Yape"
                      className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearCapture}
                      className="text-xs font-medium text-red-700 hover:text-red-800"
                    >
                      Quitar captura
                    </button>
                  </div>
                ) : null}
              </Field>
            ) : null}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Productos">
            <Field label="Buscar por codigo, producto o marca">
              <input
                type="search"
                value={productoSearch}
                onChange={(event) => setProductoSearch(event.target.value)}
                placeholder="Ej. arroz, leche, marca"
                className={inputClassName}
              />
            </Field>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {isLoading ? (
                <p className="text-sm text-slate-500">Cargando productos...</p>
              ) : filteredProductos.length > 0 ? (
                filteredProductos.map((producto) => (
                  <button
                    key={producto.id}
                    type="button"
                    onClick={() => addProducto(producto)}
                    className="rounded-md border border-slate-200 p-3 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="block font-medium text-slate-950">
                      {producto.nombre_producto}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {producto.codigo_interno} - {producto.marcas?.nombre ?? "Sin marca"}
                    </span>
                    <span className="mt-2 flex justify-between text-xs text-slate-600">
                      <span>Stock {getStock(producto)}</span>
                      <span>{formatMoney(getPrecio(producto))}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                  No hay productos con ese criterio.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Detalle del pedido">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">Producto</th>
                    <th className="px-3 py-3 font-medium">Stock</th>
                    <th className="px-3 py-3 font-medium">Cantidad</th>
                    <th className="px-3 py-3 font-medium">Precio</th>
                    <th className="px-3 py-3 font-medium">Subtotal</th>
                    <th className="px-3 py-3 font-medium">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length > 0 ? (
                    items.map((item) => {
                      const stock = getStock(item.producto);
                      const precio = getPrecio(item.producto);
                      const hasStockError = item.cantidad > stock;

                      return (
                        <tr key={item.producto.id}>
                          <td className="px-3 py-3">
                            <p className="font-medium text-slate-950">
                              {item.producto.nombre_producto}
                            </p>
                            <p className="text-xs text-slate-500">
                              {item.producto.codigo_interno}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-slate-600">{stock}</td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={item.cantidad}
                              onChange={(event) =>
                                updateCantidad(item.producto.id, event.target.value)
                              }
                              className={`h-9 w-24 rounded-md border px-2 text-sm outline-none focus:ring-2 ${
                                hasStockError
                                  ? "border-red-300 focus:border-red-600 focus:ring-red-100"
                                  : "border-slate-300 focus:border-emerald-600 focus:ring-emerald-100"
                              }`}
                            />
                            {hasStockError ? (
                              <p className="mt-1 text-xs text-red-600">
                                Sin stock suficiente
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {formatMoney(precio)}
                          </td>
                          <td className="px-3 py-3 font-medium text-slate-950">
                            {formatMoney(item.cantidad * precio)}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => removeProducto(item.producto.id)}
                              className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                        Agrega productos para armar el pedido.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Resumen antes de guardar">
            <div className="grid gap-3 md:grid-cols-4">
              <SummaryItem label="Cliente" value={selectedCliente?.nombres ?? "Sin cliente"} />
              <SummaryItem label="Productos" value={String(items.length)} />
              <SummaryItem label="Recojo" value={fechaRecojo && horaRecojo ? `${fechaRecojo} ${horaRecojo}` : "Pendiente"} />
              <SummaryItem label="Total" value={formatMoney(total)} strong />
            </div>
            {stockErrors.length > 0 ? (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Corrige el stock antes de guardar: {stockErrors.join(", ")}.
              </p>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void savePedido()}
                disabled={isSavingPedido}
                className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-medium text-white hover:bg-emerald-800 disabled:bg-slate-300"
              >
                {isSavingPedido ? "Guardando..." : "Guardar pedido"}
              </button>
            </div>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
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

function SummaryItem({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-1 truncate text-sm ${
          strong ? "font-semibold text-slate-950" : "text-slate-700"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
