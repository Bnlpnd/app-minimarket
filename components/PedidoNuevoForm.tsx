"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredAppUser } from "@/lib/authRoles";
import {
  getBaseStockByAlmacen,
  getBaseStockByName,
  getStockProductId,
  toBaseQuantity,
  toPresentationStock,
} from "@/lib/inventoryUtils";
import { calcularPrecioPorCantidad } from "@/lib/pricing";
import { matchesSearch } from "@/lib/searchUtils";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import { fetchAllRows } from "@/lib/supabaseQueryUtils";
import { generarLinkWhatsApp, generarMensajePedido } from "@/lib/whatsapp";
import type {
  Almacen,
  Categoria,
  Cliente,
  DetallePedido,
  Marca,
  PagoMetodo,
  Pedido,
  PedidoEstado,
  Producto,
  ProductoAlmacen,
  ProductoPrecioMayor,
  Subcategoria,
  TipoEntrega,
} from "@/types/database";

type ProductoSearchRow = Producto & {
  marcas: Pick<Marca, "nombre"> | null;
  categorias: Pick<Categoria, "nombre"> | null;
  subcategorias: Pick<Subcategoria, "nombre"> | null;
  producto_almacen: Array<
    Pick<ProductoAlmacen, "almacen_id" | "stock_actual"> & {
      almacenes: Pick<Almacen, "id" | "nombre"> | null;
    }
  >;
  producto_base?: {
    id: string;
    producto_almacen: Array<
      Pick<ProductoAlmacen, "almacen_id" | "stock_actual"> & {
        almacenes: Pick<Almacen, "id" | "nombre"> | null;
      }
    >;
  } | null;
  producto_precios_mayor?: ProductoPrecioMayor[];
};

type StockWithAlmacen = Pick<ProductoAlmacen, "almacen_id" | "stock_actual"> & {
  producto_id?: string;
  almacenes: Pick<Almacen, "id" | "nombre"> | null;
};

type PedidoItem = {
  producto: ProductoSearchRow;
  cantidad: number;
  almacen_id: string;
};

type DuplicatedPedidoRow = Pedido & {
  clientes: Cliente | null;
  detalle_pedido: Array<
    Pick<DetallePedido, "cantidad" | "almacen_id"> & {
      productos: ProductoSearchRow | null;
    }
  >;
};

type ClienteForm = {
  nombres: string;
  whatsapp: string;
  direccion_entrega: string;
  referencia: string;
};

type Message = {
  type: "success" | "error";
  text: string;
};

const emptyClienteForm: ClienteForm = {
  nombres: "",
  whatsapp: "",
  direccion_entrega: "",
  referencia: "",
};

const allowedCaptureTypes = ["image/jpeg", "image/png", "image/webp"];
const maxCaptureSize = 1024 * 1024;
const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const whatsappNegocio =
  process.env.NEXT_PUBLIC_WHATSAPP_NEGOCIO ?? "942025999";

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeWhatsapp(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function formatMoney(value: number) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

function getPrecioBase(producto: ProductoSearchRow) {
  return Number(producto.precio_venta ?? 1);
}

function getItemPricing(item: PedidoItem) {
  return calcularPrecioPorCantidad(
    item.cantidad,
    getPrecioBase(item.producto),
    item.producto.producto_precios_mayor ?? [],
  );
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentTime() {
  return new Date().toTimeString().slice(0, 5);
}

function stockIn(producto: ProductoSearchRow, almacenId: string) {
  return toPresentationStock(producto, getBaseStockByAlmacen(producto, almacenId));
}

function stockByName(producto: ProductoSearchRow, name: string) {
  return toPresentationStock(producto, getBaseStockByName(producto, name));
}

export function PedidoNuevoForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [maxStepVisited, setMaxStepVisited] = useState(1);
  const [createdPedidoId, setCreatedPedidoId] = useState<string | null>(null);
  const [createdPedidoEstadoPago, setCreatedPedidoEstadoPago] = useState<"pagado" | "debe">("pagado");
  const [createdPedidoEstado, setCreatedPedidoEstado] = useState<PedidoEstado | null>(null);
  const [montoACuenta, setMontoACuenta] = useState("");
  const [pagoTipo, setPagoTipo] = useState<"total" | "debe">("total");
  const [observacionPago, setObservacionPago] = useState("");
  const [isUpdatingPedido, setIsUpdatingPedido] = useState(false);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [productos, setProductos] = useState<ProductoSearchRow[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productoSearch, setProductoSearch] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [subcategoriaId, setSubcategoriaId] = useState("");
  const [clienteSearch, setClienteSearch] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [clienteForm, setClienteForm] = useState<ClienteForm>(emptyClienteForm);
  const [items, setItems] = useState<PedidoItem[]>([]);
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>("llevar_ahora");
  const [fechaRecojo, setFechaRecojo] = useState(getTodayDate());
  const [horaRecojo, setHoraRecojo] = useState("");
  const [direccionEntrega, setDireccionEntrega] = useState("");
  const [referenciaEntrega, setReferenciaEntrega] = useState("");
  const [notaCliente, setNotaCliente] = useState("");
  const [metodoPago, setMetodoPago] = useState<PagoMetodo>("efectivo");
  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const [capturePreview, setCapturePreview] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [isSearchingClientes, setIsSearchingClientes] = useState(false);
  const [isSavingCliente, setIsSavingCliente] = useState(false);
  const [isSavingPedido, setIsSavingPedido] = useState(false);
  const [queryLoaded, setQueryLoaded] = useState(false);

  const tienda = useMemo(
    () => almacenes.find((almacen) => almacen.nombre.toLowerCase() === "tienda"),
    [almacenes],
  );
  const casa = useMemo(
    () => almacenes.find((almacen) => almacen.nombre.toLowerCase() === "casa"),
    [almacenes],
  );
  const filteredSubcategorias = useMemo(
    () =>
      categoriaId
        ? subcategorias.filter((subcategoria) => subcategoria.categoria_id === categoriaId)
        : subcategorias,
    [categoriaId, subcategorias],
  );
  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + getItemPricing(item).subtotal, 0);
  }, [items]);
  const stockWarnings = useMemo(() => {
    return items.flatMap((item) => {
      const selectedStockBase = getBaseStockByAlmacen(
        item.producto,
        item.almacen_id,
      );
      const casaStockBase = casa ? getBaseStockByAlmacen(item.producto, casa.id) : 0;
      const requiredBase = toBaseQuantity(item.producto, item.cantidad);

      if (requiredBase <= selectedStockBase) {
        return [];
      }

      if (item.almacen_id === tienda?.id && casaStockBase >= requiredBase) {
        return [
          `${item.producto.nombre_producto}: No hay stock suficiente en Tienda. Hay stock disponible en Casa.`,
        ];
      }

      return [
        `${item.producto.nombre_producto}: stock insuficiente en el almacen seleccionado (${stockIn(item.producto, item.almacen_id)}).`,
      ];
    });
  }, [casa, items, tienda]);

  async function loadCatalogos() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      return;
    }

    const [almacenesResult, categoriasResult, subcategoriasResult] =
      await Promise.all([
        supabase.from("almacenes").select("*").eq("activo", true).order("nombre"),
        supabase.from("categorias").select("*").eq("activo", true).order("nombre"),
        supabase
          .from("subcategorias")
          .select("*")
          .eq("activo", true)
          .order("nombre"),
      ]);

    if (almacenesResult.error || categoriasResult.error || subcategoriasResult.error) {
      setMessage({ type: "error", text: "No se pudieron cargar catalogos." });
      return;
    }

    setAlmacenes((almacenesResult.data ?? []) as Almacen[]);
    setCategorias((categoriasResult.data ?? []) as Categoria[]);
    setSubcategorias((subcategoriasResult.data ?? []) as Subcategoria[]);
  }

  async function searchProductos() {
    if (!supabase) {
      return;
    }

    setIsSearchingProducts(true);
    const productMap = new Map<string, ProductoSearchRow>();

    let query = supabase
      .from("productos")
      .select(
        `
          *,
          marcas(nombre),
          categorias(nombre),
          subcategorias(nombre),
          producto_almacen(almacen_id,stock_actual,almacenes(id,nombre)),
          producto_precios_mayor(*)
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

    const { data, error } = await fetchAllRows<ProductoSearchRow>(query);

    if (error) {
      setIsSearchingProducts(false);
      setMessage({ type: "error", text: `No se buscaron productos: ${error.message}` });
      return;
    }

    const rows = await attachBaseStocks(data);

    rows
      .filter((producto) =>
        matchesSearch(productoSearch, [
          producto.codigo_interno,
          producto.nombre_producto,
          producto.presentacion,
          producto.marcas?.nombre,
          producto.categorias?.nombre,
          producto.subcategorias?.nombre,
        ]),
      )
      .forEach((producto) => {
        productMap.set(producto.id, producto);
      });

    setProductos([...productMap.values()].slice(0, 40));
    setIsSearchingProducts(false);
  }

  async function searchClientes() {
    if (!supabase) {
      return;
    }

    if (!normalizeSpaces(clienteSearch)) {
      setClientes([]);
      return;
    }

    setIsSearchingClientes(true);
    const { data, error } = await fetchAllRows<Cliente>(
      supabase
      .from("clientes")
      .select("*")
      .eq("activo", true)
      .order("created_at", { ascending: false })
    );
    setIsSearchingClientes(false);

    if (error) {
      setMessage({ type: "error", text: `No se buscaron clientes: ${error.message}` });
      return;
    }

    setClientes(
      data
        .filter((cliente) =>
          matchesSearch(clienteSearch, [
            cliente.nombres,
            cliente.telefono,
            cliente.direccion_entrega,
            cliente.referencia,
          ]),
        )
        .slice(0, 10),
    );
  }

  async function attachBaseStocks(rows: ProductoSearchRow[]) {
    if (!supabase) {
      return rows;
    }

    const baseIds = [
      ...new Set(
        rows
          .map((producto) => producto.producto_base_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (baseIds.length === 0) {
      return rows;
    }

    const { data, error } = await supabase
      .from("producto_almacen")
      .select("producto_id,almacen_id,stock_actual,almacenes(id,nombre)")
      .in("producto_id", baseIds);

    if (error) {
      return rows;
    }

    const stockByProduct = new Map<string, StockWithAlmacen[]>();
    ((data ?? []) as unknown as StockWithAlmacen[]).forEach((stock) => {
      if (!stock.producto_id) {
        return;
      }
      const current = stockByProduct.get(stock.producto_id) ?? [];
      current.push(stock);
      stockByProduct.set(stock.producto_id, current);
    });

    return rows.map((producto) => {
      if (!producto.producto_base_id) {
        return producto;
      }

      return {
        ...producto,
        producto_base: {
          id: producto.producto_base_id,
          producto_almacen: stockByProduct.get(producto.producto_base_id) ?? [],
        },
      };
    });
  }

  async function loadClienteFromQuery(clienteId: string) {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", clienteId)
      .maybeSingle();

    if (error || !data) {
      setMessage({
        type: "error",
        text: `No se pudo cargar el cliente seleccionado: ${error?.message ?? "no encontrado"}`,
      });
      return;
    }

    const cliente = data as Cliente;
    setSelectedCliente(cliente);
    setClienteForm({
      nombres: cliente.nombres,
      whatsapp: cliente.telefono ?? "",
      direccion_entrega: cliente.direccion_entrega ?? cliente.direccion ?? "",
      referencia: cliente.referencia ?? "",
    });
    setDireccionEntrega(cliente.direccion_entrega ?? cliente.direccion ?? "");
    setReferenciaEntrega(cliente.referencia ?? "");
    setMessage({ type: "success", text: "Cliente cargado para la nueva venta." });
  }

  async function loadDuplicatedPedido(pedidoId: string) {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("pedidos")
      .select(
        `
          *,
          clientes(*),
          detalle_pedido(
            cantidad,
            almacen_id,
            productos(
              *,
              marcas(nombre),
              categorias(nombre),
              subcategorias(nombre),
              producto_almacen(almacen_id,stock_actual,almacenes(id,nombre)),
              producto_precios_mayor(*)
            )
          )
        `,
      )
      .eq("id", pedidoId)
      .maybeSingle();

    if (error || !data) {
      setMessage({
        type: "error",
        text: `No se pudo duplicar pedido: ${error?.message ?? "pedido no encontrado"}`,
      });
      return;
    }

    const pedido = data as DuplicatedPedidoRow;
    const cliente = pedido.clientes;
    if (cliente) {
      setSelectedCliente(cliente);
      setClienteForm({
        nombres: cliente.nombres,
        whatsapp: cliente.telefono ?? "",
        direccion_entrega: cliente.direccion_entrega ?? cliente.direccion ?? "",
        referencia: cliente.referencia ?? "",
      });
      setDireccionEntrega(cliente.direccion_entrega ?? cliente.direccion ?? "");
      setReferenciaEntrega(cliente.referencia ?? "");
    }

    const defaultAlmacenId = tienda?.id ?? almacenes[0]?.id ?? "";
    const duplicatedProducts = await attachBaseStocks(
      (pedido.detalle_pedido ?? [])
        .filter((detalle) => detalle.productos)
        .map((detalle) => detalle.productos as ProductoSearchRow),
    );
    const productosById = new Map(
      duplicatedProducts.map((producto) => [producto.id, producto]),
    );
    const duplicatedItems = (pedido.detalle_pedido ?? [])
      .filter((detalle) => detalle.productos)
      .map((detalle) => ({
        producto:
          productosById.get((detalle.productos as ProductoSearchRow).id) ??
          (detalle.productos as ProductoSearchRow),
        cantidad: Number(detalle.cantidad ?? 1),
        almacen_id: detalle.almacen_id ?? defaultAlmacenId,
      }));

    setItems(duplicatedItems);
    setTipoEntrega(pedido.tipo_entrega ?? "llevar_ahora");
    setFechaRecojo(getTodayDate());
    setHoraRecojo("");
    setMetodoPago("efectivo");
    setNotaCliente("");
    setStep(1);
    setMessage({
      type: "success",
      text:
        duplicatedItems.length > 0
          ? "Pedido duplicado. Revisa stock antes de guardar la nueva venta."
          : "El pedido anterior no tenia productos para duplicar.",
    });
  }

  useEffect(() => {
    void loadCatalogos();
  }, []);

  useEffect(() => {
    if (queryLoaded || almacenes.length === 0) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const duplicateId = params.get("duplicar");
    const clienteId = params.get("cliente");
    setQueryLoaded(true);

    if (duplicateId) {
      void loadDuplicatedPedido(duplicateId);
      return;
    }

    if (clienteId) {
      void loadClienteFromQuery(clienteId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacenes.length, queryLoaded]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void searchProductos();
    }, 350);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoSearch, categoriaId, subcategoriaId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void searchClientes();
    }, 350);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteSearch]);

  useEffect(() => {
    return () => {
      if (capturePreview) {
        URL.revokeObjectURL(capturePreview);
      }
    };
  }, [capturePreview]);

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

  function addProducto(producto: ProductoSearchRow) {
    const defaultAlmacenId = tienda?.id ?? almacenes[0]?.id ?? "";

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

      return [...current, { producto, cantidad: 1, almacen_id: defaultAlmacenId }];
    });
  }

  function updateItem(productoId: string, patch: Partial<PedidoItem>) {
    setItems((current) =>
      current.map((item) =>
        item.producto.id === productoId ? { ...item, ...patch } : item,
      ),
    );
  }

  function removeProducto(productoId: string) {
    setItems((current) =>
      current.filter((item) => item.producto.id !== productoId),
    );
  }

  async function createQuickCliente(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return null;
    }

    const nombres = normalizeSpaces(clienteForm.nombres);
    const whatsapp = normalizeWhatsapp(clienteForm.whatsapp);
    const direccion = normalizeSpaces(clienteForm.direccion_entrega);
    const referencia = normalizeSpaces(clienteForm.referencia);

    if (!nombres || !whatsapp) {
      setMessage({
        type: "error",
        text: "Nombre y WhatsApp son obligatorios para crear cliente.",
      });
      return null;
    }

    const { data: existing } = await supabase
      .from("clientes")
      .select("*")
      .eq("telefono", whatsapp)
      .maybeSingle();

    if (existing) {
      const cliente = existing as Cliente;
      setSelectedCliente(cliente);
      setClienteForm({
        nombres: cliente.nombres,
        whatsapp: cliente.telefono ?? "",
        direccion_entrega: cliente.direccion_entrega ?? cliente.direccion ?? "",
        referencia: cliente.referencia ?? "",
      });
      setMessage({ type: "success", text: "Cliente existente seleccionado." });
      return cliente;
    }

    setIsSavingCliente(true);
    const { data, error } = await supabase
      .from("clientes")
      .insert({
        nombres,
        telefono: whatsapp,
        direccion: direccion || null,
        direccion_entrega: direccion || null,
        referencia: referencia || null,
        activo: true,
      })
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
      return null;
    }

    const cliente = data as Cliente;
    setSelectedCliente(cliente);
    setClientes((current) => [cliente, ...current]);
    setMessage({ type: "success", text: "Cliente creado y seleccionado." });
    return cliente;
  }

  function buildCapturePath(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const clientePart =
      selectedCliente?.id ?? (normalizeWhatsapp(clienteForm.whatsapp) || "sin-cliente");

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
    if (items.length === 0) {
      return "Agrega al menos un producto.";
    }

    if (items.some((item) => item.cantidad <= 0)) {
      return "Todas las cantidades deben ser mayores a cero.";
    }

    if (items.some((item) => !item.almacen_id)) {
      return "Selecciona almacen de salida para todos los productos.";
    }

    if (stockWarnings.length > 0) {
      return `Corrige el stock antes de guardar: ${stockWarnings.join(" ")}`;
    }

    if (!selectedCliente && (!normalizeSpaces(clienteForm.nombres) || !normalizeWhatsapp(clienteForm.whatsapp))) {
      return "Selecciona un cliente o ingresa nombre y WhatsApp.";
    }

    if (tipoEntrega === "recoger_despues" && (!fechaRecojo || !horaRecojo)) {
      return "Para recoger despues debes indicar fecha y hora.";
    }

    if (tipoEntrega === "enviar" && (!fechaRecojo || !horaRecojo)) {
      return "Para envio debes indicar fecha y hora de entrega.";
    }

    if (tipoEntrega === "enviar" && !normalizeSpaces(direccionEntrega)) {
      return "Para envio debes indicar direccion de entrega.";
    }

    return null;
  }

  async function savePedido(sendWhatsapp: boolean) {
    if (!supabase) {
      setMessage({
        type: "error",
        text: supabaseConfigError ?? "No hay conexion configurada a Supabase.",
      });
      return;
    }

    const validationError = validatePedido();
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }

    setIsSavingPedido(true);
    setMessage(null);
    setCaptureError("");

    let cliente = selectedCliente;
    if (!cliente) {
      cliente = await createQuickCliente();
      if (!cliente) {
        setIsSavingPedido(false);
        return;
      }
    }

    const capturaYapeUrl = metodoPago === "yape" ? await uploadCapture() : null;

    if (metodoPago === "yape" && captureFile && !capturaYapeUrl) {
      setIsSavingPedido(false);
      return;
    }

    const pedidoEstado: PedidoEstado =
      metodoPago === "yape" && capturaYapeUrl ? "pago_enviado" : "pendiente";
    const pagoEstado = metodoPago === "yape" && capturaYapeUrl ? "enviado" : "pendiente";
    const appUsuario = getStoredAppUser();
    const fechaRecojoValue =
      tipoEntrega === "llevar_ahora"
        ? new Date().toISOString()
        : (tipoEntrega === "recoger_despues" || tipoEntrega === "enviar") && fechaRecojo
          ? new Date(`${fechaRecojo}T${horaRecojo || "00:00"}:00`).toISOString()
          : null;
    const direccionFinal =
      tipoEntrega === "enviar"
        ? normalizeSpaces(direccionEntrega)
        : cliente.direccion_entrega ?? cliente.direccion ?? null;
    const referenciaFinal =
      tipoEntrega === "enviar"
        ? normalizeSpaces(referenciaEntrega)
        : cliente.referencia ?? null;
    const nota = normalizeSpaces(notaCliente);

    const { data: pedidoData, error: pedidoError } = await supabase
      .from("pedidos")
      .insert({
        cliente_id: cliente.id,
        app_registrado_por_id: appUsuario?.id ?? null,
        fecha_recojo: fechaRecojoValue,
        hora_recojo: tipoEntrega === "llevar_ahora"
          ? getCurrentTime()
          : tipoEntrega === "recoger_despues" || tipoEntrega === "enviar"
            ? horaRecojo || null
            : null,
        estado: pedidoEstado,
        subtotal: total,
        total,
        metodo_pago: metodoPago,
        tipo_entrega: tipoEntrega,
        direccion_entrega: tipoEntrega === "enviar" ? direccionFinal : null,
        referencia_entrega: tipoEntrega === "enviar" ? referenciaFinal || null : null,
        nota_cliente: nota || null,
        observaciones: (pagoTipo === "debe" && observacionPago) ? observacionPago : (nota || null),
        monto_a_cuenta: pagoTipo === "debe" ? Math.max(0, Number(montoACuenta) || 0) : total,
        estado_pago: pagoTipo === "debe" && (Number(montoACuenta) || 0) < total ? "debe" : "pagado",
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
    const detallePayload = items.map((item) => {
      const pricing = getItemPricing(item);
      return {
        pedido_id: pedidoId,
        producto_id: item.producto.id,
        producto_stock_id: getStockProductId(item.producto),
        cantidad: item.cantidad,
        cantidad_base: toBaseQuantity(item.producto, item.cantidad),
        precio_unitario: pricing.precioUnitarioPromedio,
        preparado: false,
        almacen_id: item.almacen_id,
      };
    });
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

    const pedidoWhatsapp = {
      id: pedidoId,
      fecha_recojo: fechaRecojoValue,
      hora_recojo: tipoEntrega === "llevar_ahora"
        ? getCurrentTime()
        : tipoEntrega === "recoger_despues" || tipoEntrega === "enviar"
          ? horaRecojo || null
          : null,
      metodo_pago: metodoPago,
      total,
      tipo_entrega: tipoEntrega,
      direccion_entrega: tipoEntrega === "enviar" ? direccionFinal : null,
      referencia_entrega: tipoEntrega === "enviar" ? referenciaFinal || null : null,
      nota_cliente: nota || null,
    } as Pick<
      Pedido,
      | "id"
      | "fecha_recojo"
      | "hora_recojo"
      | "metodo_pago"
      | "total"
      | "tipo_entrega"
      | "direccion_entrega"
      | "referencia_entrega"
      | "nota_cliente"
    >;
    const detallesWhatsapp = items.map((item) => ({
      cantidad: item.cantidad,
      precio_unitario: getItemPricing(item).precioUnitarioPromedio,
      subtotal: getItemPricing(item).subtotal,
      productos: { nombre_producto: item.producto.nombre_producto },
    }));

    setMessage({
      type: "success",
      text: `Pedido guardado correctamente. Codigo: ${pedidoId.slice(0, 8)}.`,
    });

    if (sendWhatsapp) {
      const mensaje = generarMensajePedido(
        pedidoWhatsapp,
        cliente,
        detallesWhatsapp,
        Boolean(capturaYapeUrl),
      );
      window.open(generarLinkWhatsApp(whatsappNegocio, mensaje), "_blank", "noopener,noreferrer");
    }

    setCreatedPedidoId(pedidoId);
    setCreatedPedidoEstado(pedidoEstado);
    setCreatedPedidoEstadoPago(pagoTipo === "debe" && (Number(montoACuenta) || 0) < total ? "debe" : "pagado");
  }

  function resetForNewSale() {
    setStep(1);
    setMaxStepVisited(1);
    setSelectedCliente(null);
    setClienteSearch("");
    setClienteForm(emptyClienteForm);
    setItems([]);
    setTipoEntrega("llevar_ahora");
    setFechaRecojo(getTodayDate());
    setHoraRecojo("");
    setDireccionEntrega("");
    setReferenciaEntrega("");
    setNotaCliente("");
    setMetodoPago("efectivo");
    setPagoTipo("total");
    setMontoACuenta("");
    setObservacionPago("");
    setCreatedPedidoId(null);
    setCreatedPedidoEstado(null);
    setCreatedPedidoEstadoPago("pagado");
    clearCapture();
    setMessage(null);
  }

  async function confirmarPagoCreado() {
    if (!supabase || !createdPedidoId) return;
    setIsUpdatingPedido(true);
    setMessage(null);
    const { error } = await supabase
      .from("pedidos")
      .update({ estado_pago: "pagado", monto_a_cuenta: total })
      .eq("id", createdPedidoId);
    setIsUpdatingPedido(false);
    if (error) {
      setMessage({ type: "error", text: "No se pudo confirmar el pago: " + error.message });
      return;
    }
    setCreatedPedidoEstadoPago("pagado");
    setMessage({ type: "success", text: "Pago confirmado." });
  }

  async function enviarAPreparacion() {
    if (!supabase || !createdPedidoId) return;
    const appUsuario = getStoredAppUser();
    setIsUpdatingPedido(true);
    setMessage(null);
    const { error } = await supabase
      .from("pedidos")
      .update({
        estado: "en_preparacion",
        app_preparado_por_id: appUsuario?.id ?? null,
        preparado_at: new Date().toISOString(),
      })
      .eq("id", createdPedidoId);
    setIsUpdatingPedido(false);
    if (error) {
      setMessage({ type: "error", text: "No se pudo enviar a preparacion: " + error.message });
      return;
    }
    setCreatedPedidoEstado("en_preparacion");
    setMessage({ type: "success", text: "Pedido enviado a preparacion. Abriendo..." });
    router.push("/preparacion?pedido=" + createdPedidoId);
  }

  const canGoNext = Boolean(
    step === 1
      ? items.length > 0 && stockWarnings.length === 0
      : step === 2
        ? Boolean(selectedCliente) ||
          (normalizeSpaces(clienteForm.nombres) && normalizeWhatsapp(clienteForm.whatsapp))
        : true,
  );

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

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="grid gap-2 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((item) => {
            const isLocked = item > maxStepVisited || Boolean(createdPedidoId);
            return (
            <button
              key={item}
              type="button"
              onClick={() => { if (isLocked || createdPedidoId) return; if (item < step) { setMaxStepVisited(item); } setStep(item); }}
              disabled={isLocked}
              className={`h-10 rounded-md px-2 text-xs font-semibold sm:text-sm ${
                step === item
                  ? "bg-slate-900 text-white"
                  : isLocked
                    ? "border border-slate-200 bg-slate-50 text-slate-300"
                    : "border border-slate-200 text-slate-600"
              }`}
            >
              {item}. {["Productos", "Cliente", "Entrega", "Confirmar", "Pago"][item - 1]}
            </button>
            );
          })}
        </div>
      </section>

      {step === 1 ? (
        <Panel title="Paso 1: elegir productos">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
            <input
              type="search"
              value={productoSearch}
              onChange={(event) => setProductoSearch(event.target.value)}
              placeholder="Codigo, producto o marca"
              className={inputClassName}
            />
            <select
              value={categoriaId}
              onChange={(event) => {
                setCategoriaId(event.target.value);
                setSubcategoriaId("");
              }}
              className={inputClassName}
            >
              <option value="">Categoria</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
            </select>
            <select
              value={subcategoriaId}
              onChange={(event) => setSubcategoriaId(event.target.value)}
              className={inputClassName}
            >
              <option value="">Subcategoria</option>
              {filteredSubcategorias.map((subcategoria) => (
                <option key={subcategoria.id} value={subcategoria.id}>
                  {subcategoria.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {isSearchingProducts ? (
                <p className="text-sm text-slate-500">Buscando productos...</p>
              ) : productos.length > 0 ? (
                productos.map((producto) => (
                  <button
                    key={producto.id}
                    type="button"
                    onClick={() => addProducto(producto)}
                    className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-left text-sm hover:bg-slate-50"
                  >
                    {producto.imagen_url ? (
                      <img src={producto.imagen_url} alt="" className="h-14 w-14 shrink-0 rounded-md border border-slate-100 object-cover" />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">IMG</span>
                    )}
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-950">
                        {producto.nombre_producto}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {producto.codigo_interno} · {producto.marcas?.nombre ?? "Sin marca"}
                      </span>
                      <span className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
                        <span>Tienda {stockByName(producto, "Tienda")}</span>
                        <span>Casa {stockByName(producto, "Casa")}</span>
                        <span>{formatMoney(getPrecioBase(producto))}</span>
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                  No hay productos con ese criterio.
                </p>
              )}
            </div>

          <Cart
            items={items}
            almacenes={almacenes}
            onUpdate={updateItem}
            onRemove={removeProducto}
          />
          <StepActions
            step={step}
            canNext={canGoNext}
            onBack={() => setStep(Math.max(1, step - 1))}
            onNext={() => { setStep(2); setMaxStepVisited((current) => Math.max(current, 2)); }}
          />
        </Panel>
      ) : null}

      {step === 2 ? (
        <Panel title="Paso 2: datos del cliente">
          <input
            type="search"
            value={clienteSearch}
            onChange={(event) => setClienteSearch(event.target.value)}
            placeholder="Buscar cliente por nombre o WhatsApp"
            className={inputClassName}
          />
          <div className="grid gap-2 md:grid-cols-2">
            {isSearchingClientes ? (
              <p className="text-sm text-slate-500">Buscando clientes...</p>
            ) : clientes.map((cliente) => (
              <button
                key={cliente.id}
                type="button"
                onClick={() => {
                  setSelectedCliente(cliente);
                  setClienteForm({
                    nombres: cliente.nombres,
                    whatsapp: cliente.telefono ?? "",
                    direccion_entrega: cliente.direccion_entrega ?? cliente.direccion ?? "",
                    referencia: cliente.referencia ?? "",
                  });
                  setDireccionEntrega(cliente.direccion_entrega ?? cliente.direccion ?? "");
                  setReferenciaEntrega(cliente.referencia ?? "");
                }}
                className={`rounded-md border p-3 text-left text-sm ${
                  selectedCliente?.id === cliente.id
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="block font-medium text-slate-950">{cliente.nombres}</span>
                <span className="text-slate-500">{cliente.telefono ?? "Sin WhatsApp"}</span>
              </button>
            ))}
          </div>

          <form onSubmit={createQuickCliente} className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre" required>
              <input value={clienteForm.nombres} onChange={(event) => setClienteForm((current) => ({ ...current, nombres: event.target.value }))} className={inputClassName} />
            </Field>
            <Field label="WhatsApp" required>
              <input value={clienteForm.whatsapp} onChange={(event) => setClienteForm((current) => ({ ...current, whatsapp: event.target.value }))} className={inputClassName} />
            </Field>
            <Field label="Direccion guardada">
              <input value={clienteForm.direccion_entrega} onChange={(event) => setClienteForm((current) => ({ ...current, direccion_entrega: event.target.value }))} className={inputClassName} />
            </Field>
            <Field label="Referencia">
              <input value={clienteForm.referencia} onChange={(event) => setClienteForm((current) => ({ ...current, referencia: event.target.value }))} className={inputClassName} />
            </Field>
            <button
              type="submit"
              disabled={isSavingCliente}
              className="h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 md:w-fit"
            >
              {isSavingCliente ? "Creando..." : "Crear/seleccionar cliente"}
            </button>
          </form>
          <StepActions step={step} canNext={Boolean(canGoNext)} onBack={() => setStep(1)} onNext={() => { setStep(3); setMaxStepVisited((current) => Math.max(current, 3)); }} />
        </Panel>
      ) : null}

      {step === 3 ? (
        <Panel title="Paso 3: tipo de entrega">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["llevar_ahora", "Llevar ahora"],
              ["recoger_despues", "Recoger despues"],
              ["enviar", "Enviar"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  const tipo = value as TipoEntrega;
                  setTipoEntrega(tipo);
                  if (tipo === "llevar_ahora") {
                    setFechaRecojo(getTodayDate());
                    setHoraRecojo(getCurrentTime());
                  }
                }}
                className={`h-11 rounded-md border px-3 text-sm font-semibold ${
                  tipoEntrega === value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tipoEntrega === "recoger_despues" || tipoEntrega === "enviar" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={tipoEntrega === "enviar" ? "Fecha de entrega" : "Fecha de recojo"} required>
                <input type="date" value={fechaRecojo} onChange={(event) => setFechaRecojo(event.target.value)} className={inputClassName} />
              </Field>
              <Field label={tipoEntrega === "enviar" ? "Hora de entrega" : "Hora de recojo"} required>
                <input type="time" value={horaRecojo} onChange={(event) => setHoraRecojo(event.target.value)} className={inputClassName} />
              </Field>
            </div>
          ) : null}

          {tipoEntrega === "enviar" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Direccion de entrega" required>
                <input value={direccionEntrega} onChange={(event) => setDireccionEntrega(event.target.value)} className={inputClassName} />
              </Field>
              <Field label="Referencia">
                <input value={referenciaEntrega} onChange={(event) => setReferenciaEntrega(event.target.value)} className={inputClassName} />
              </Field>
            </div>
          ) : null}

          <Field label="Observaciones">
            <textarea value={notaCliente} onChange={(event) => setNotaCliente(event.target.value)} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
          </Field>
          <StepActions step={step} canNext onBack={() => setStep(2)} onNext={() => { setStep(4); setMaxStepVisited((current) => Math.max(current, 4)); }} />
        </Panel>
      ) : null}

      {step === 4 ? (
        <Panel title="Paso 4: confirmar pedido">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryItem label="Cliente" value={selectedCliente?.nombres ?? clienteForm.nombres} />
            <SummaryItem label="WhatsApp" value={selectedCliente?.telefono ?? clienteForm.whatsapp} />
            <SummaryItem label="Entrega" value={tipoEntrega.replaceAll("_", " ")} />
            <SummaryItem label="Total" value={formatMoney(total)} strong />
          </div>
          <section className="rounded-lg border border-slate-200">
            <div className="hidden max-h-[70vh] overflow-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">Cant</th>
                    <th className="px-3 py-3 font-medium">Producto</th>
                    <th className="px-3 py-3 font-medium">Precio</th>
                    <th className="px-3 py-3 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const pricing = getItemPricing(item);
                    return (
                      <tr key={item.producto.id}>
                        <td className="px-3 py-3 text-slate-700">{item.cantidad}</td>
                        <td className="px-3 py-3 font-medium text-slate-950">{item.producto.nombre_producto}</td>
                        <td className="px-3 py-3 text-slate-600">{formatMoney(pricing.precioUnitarioPromedio)}</td>
                        <td className="px-3 py-3 font-semibold text-slate-950">{formatMoney(pricing.subtotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-3 py-3 text-right text-sm font-semibold text-slate-700">Total</td>
                    <td className="px-3 py-3 text-sm font-bold text-slate-950">{formatMoney(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="space-y-3 p-3 lg:hidden">
              {items.map((item) => {
                const pricing = getItemPricing(item);
                return (
                  <div key={item.producto.id} className="flex justify-between rounded-md border border-slate-200 p-3 text-sm">
                    <span className="text-slate-700">{item.cantidad}x {item.producto.nombre_producto}</span>
                    <span className="font-semibold text-slate-950">{formatMoney(pricing.subtotal)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between rounded-md bg-slate-50 px-3 py-3 text-sm font-bold text-slate-950">
                <span>Total</span>
                <span>{formatMoney(total)}</span>
              </div>
            </div>
          </section>
          {stockWarnings.length > 0 ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {stockWarnings.join(" ")}
            </p>
          ) : null}
          <StepActions step={step} canNext={stockWarnings.length === 0} onBack={() => setStep(3)} onNext={() => { setStep(5); setMaxStepVisited((current) => Math.max(current, 5)); }} />
        </Panel>
      ) : null}

      {step === 5 ? (
        <Panel title="Paso 5: pago">
          {!createdPedidoId ? (
            <>
              <Field label="Metodo de pago" required>
                <select
                  value={metodoPago}
                  onChange={(event) => {
                    setMetodoPago(event.target.value as PagoMetodo);
                    if (event.target.value !== "yape") {
                      clearCapture();
                    }
                  }}
                  className={inputClassName}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="yape">Yape</option>
                  <option value="otro">Otro</option>
                </select>
              </Field>
              {metodoPago === "yape" ? (
                <Field label="Captura Yape">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleCaptureChange}
                    className="block w-full text-sm text-slate-700 file:mr-3 file:h-11 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
                  />
                  <p className="mt-1 text-xs text-slate-500">JPG, PNG o WebP. Maximo 1 MB.</p>
                  {captureError ? <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{captureError}</p> : null}
                  {capturePreview ? (
                    <div className="mt-3 flex items-center gap-3 rounded-md bg-slate-50 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={capturePreview} alt="Preview captura Yape" className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
                      <button type="button" onClick={clearCapture} className="text-xs font-medium text-red-700">Quitar captura</button>
                    </div>
                  ) : null}
                </Field>
              ) : null}

              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-950">Estado del pago</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => { setPagoTipo("total"); setMontoACuenta(""); }} className={`h-11 rounded-md border px-3 text-sm font-semibold ${pagoTipo === "total" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 text-slate-700"}`}>
                    Pagado total
                  </button>
                  <button type="button" onClick={() => setPagoTipo("debe")} className={`h-11 rounded-md border px-3 text-sm font-semibold ${pagoTipo === "debe" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-300 text-slate-700"}`}>
                    Debe (credito)
                  </button>
                </div>
                {pagoTipo === "debe" ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Field label="Monto a cuenta (lo que ya pago)">
                      <input type="number" min="0" step="0.01" value={montoACuenta} onChange={(event) => setMontoACuenta(event.target.value)} placeholder="0.00" className={inputClassName} />
                    </Field>
                    <Field label="Observacion (ej. paga al recoger)">
                      <input value={observacionPago} onChange={(event) => setObservacionPago(event.target.value)} className={inputClassName} />
                    </Field>
                  </div>
                ) : null}
                {pagoTipo === "debe" ? (
                  <p className="mt-3 text-xs text-amber-700">
                    Saldo pendiente: {formatMoney(Math.max(0, total - (Number(montoACuenta) || 0)))}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => { setStep(4); }} className="h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700">
                  Atras
                </button>
                <button type="button" onClick={() => void savePedido(false)} disabled={isSavingPedido} className="h-11 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white disabled:bg-slate-300">
                  {isSavingPedido ? "Guardando..." : "Guardar pedido"}
                </button>
                <button type="button" onClick={() => void savePedido(true)} disabled={isSavingPedido} className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white disabled:bg-slate-300">
                  Guardar y enviar WhatsApp
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Pedido <strong>#{createdPedidoId.slice(0,8)}</strong> guardado. Estado: <strong>{createdPedidoEstado ?? "pendiente"}</strong> | Pago: <strong>{createdPedidoEstadoPago === "pagado" ? "Pagado" : "Debe"}</strong>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {createdPedidoEstadoPago === "debe" ? (
                  <button type="button" onClick={() => void confirmarPagoCreado()} disabled={isUpdatingPedido} className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
                    {isUpdatingPedido ? "..." : "Confirmar pago"}
                  </button>
                ) : null}
                <button type="button" onClick={() => void enviarAPreparacion()} disabled={isUpdatingPedido || createdPedidoEstado === "en_preparacion" || createdPedidoEstado === "listo_para_recoger" || createdPedidoEstado === "entregado"} className="h-11 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
                  {createdPedidoEstado === "en_preparacion" || createdPedidoEstado === "listo_para_recoger" ? "Ya en preparacion" : "Enviar a preparacion"}
                </button>
                <button type="button" onClick={resetForNewSale} className="h-11 rounded-md border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-700">
                  Nueva venta
                </button>
              </div>
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

function Cart({
  items,
  almacenes,
  readonly,
  onUpdate,
  onRemove,
}: {
  items: PedidoItem[];
  almacenes: Almacen[];
  readonly?: boolean;
  onUpdate: (productoId: string, patch: Partial<PedidoItem>) => void;
  onRemove: (productoId: string) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-950">Detalle</h3>
      </div>
      <div className="hidden max-h-[70vh] overflow-auto lg:block">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3 font-medium">Producto</th>
              <th className="px-3 py-3 font-medium">Almacen</th>
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
                const stock = stockIn(item.producto, item.almacen_id);
                const stockBase = getBaseStockByAlmacen(item.producto, item.almacen_id);
                const requiredBase = toBaseQuantity(item.producto, item.cantidad);
                const pricing = getItemPricing(item);
                const hasStockIssue = requiredBase > stockBase;
                return (
                  <tr
                    key={item.producto.id}
                    className={hasStockIssue ? "bg-red-50/70" : undefined}
                  >
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-950">{item.producto.nombre_producto}</p>
                      <p className="text-xs text-slate-500">{item.producto.codigo_interno}</p>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={item.almacen_id}
                        disabled={readonly}
                        onChange={(event) => onUpdate(item.producto.id, { almacen_id: event.target.value })}
                        className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                      >
                        {almacenes.map((almacen) => (
                          <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>
                        ))}
                      </select>
                    </td>
                    <td className={`px-3 py-3 ${hasStockIssue ? "font-semibold text-red-700" : "text-slate-600"}`}>
                      {stock}
                      {hasStockIssue ? (
                        <span className="ml-2 rounded bg-red-100 px-2 py-1 text-xs text-red-700">
                          Sin stock
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.cantidad}
                        disabled={readonly}
                        onChange={(event) => onUpdate(item.producto.id, { cantidad: Number(event.target.value) || 0 })}
                        className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm"
                      />
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatMoney(pricing.precioUnitarioPromedio)}</td>
                    <td className="px-3 py-3 font-semibold text-slate-950">{formatMoney(pricing.subtotal)}</td>
                    <td className="px-3 py-3">
                      {!readonly ? (
                        <button type="button" onClick={() => onRemove(item.producto.id)} className="h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700">
                          Quitar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">Agrega productos al pedido.</td>
              </tr>
            )}
          </tbody>
          {items.length > 0 ? (
            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={5} className="px-3 py-3 text-right text-sm font-semibold text-slate-700">Total</td>
                <td className="px-3 py-3 text-sm font-bold text-slate-950">
                  {formatMoney(items.reduce((sum, item) => sum + getItemPricing(item).subtotal, 0))}
                </td>
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <div className="space-y-3 p-3 lg:hidden">
        {items.map((item) => {
          const pricing = getItemPricing(item);
          const stock = stockIn(item.producto, item.almacen_id);
          const stockBase = getBaseStockByAlmacen(item.producto, item.almacen_id);
          const requiredBase = toBaseQuantity(item.producto, item.cantidad);
          const hasStockIssue = requiredBase > stockBase;
          return (
            <article
              key={item.producto.id}
              className={`rounded-md border p-3 text-sm ${
                hasStockIssue ? "border-red-200 bg-red-50" : "border-slate-200"
              }`}
            >
              <p className="font-semibold text-slate-950">{item.producto.nombre_producto}</p>
              <p className="mt-1 text-xs text-slate-500">{item.producto.codigo_interno}</p>
              {hasStockIssue ? (
                <p className="mt-2 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                  Stock insuficiente: disponible {stock}
                </p>
              ) : null}
              <div className="mt-3 grid gap-2">
                <select value={item.almacen_id} disabled={readonly} onChange={(event) => onUpdate(item.producto.id, { almacen_id: event.target.value })} className={inputClassName}>
                  {almacenes.map((almacen) => (
                    <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>
                  ))}
                </select>
                <input type="number" min="0.01" step="0.01" value={item.cantidad} disabled={readonly} onChange={(event) => onUpdate(item.producto.id, { cantidad: Number(event.target.value) || 0 })} className={inputClassName} />
                <div className="flex justify-between text-sm">
                  <span>{formatMoney(pricing.precioUnitarioPromedio)}</span>
                  <strong>{formatMoney(pricing.subtotal)}</strong>
                </div>
              </div>
              {!readonly ? (
                <button type="button" onClick={() => onRemove(item.producto.id)} className="mt-3 h-9 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700">
                  Quitar
                </button>
              ) : null}
            </article>
          );
        })}
        {items.length > 0 ? (
          <div className="flex justify-between rounded-md bg-slate-50 px-3 py-3 text-sm font-bold text-slate-950">
            <span>Total</span>
            <span>{formatMoney(items.reduce((sum, item) => sum + getItemPricing(item).subtotal, 0))}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
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

function StepActions({
  step,
  canNext,
  onBack,
  onNext,
}: {
  step: number;
  canNext: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onBack}
        disabled={step === 1}
        className="h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-40"
      >
        Atras
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="h-11 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white disabled:bg-slate-300"
      >
        Continuar
      </button>
    </div>
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
      <p className={`mt-1 break-words text-sm ${strong ? "font-semibold text-slate-950" : "text-slate-700"}`}>
        {value}
      </p>
    </div>
  );
}
