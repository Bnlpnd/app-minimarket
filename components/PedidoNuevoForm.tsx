"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { getStoredAppUser } from "@/lib/authRoles";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
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

function getPrecio(producto: ProductoSearchRow) {
  return Number(producto.precio_venta ?? 1);
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function stockIn(producto: ProductoSearchRow, almacenId: string) {
  return Number(
    producto.producto_almacen.find((stock) => stock.almacen_id === almacenId)
      ?.stock_actual ?? 0,
  );
}

function stockByName(producto: ProductoSearchRow, name: string) {
  return Number(
    producto.producto_almacen.find(
      (stock) => stock.almacenes?.nombre.toLowerCase() === name.toLowerCase(),
    )?.stock_actual ?? 0,
  );
}

export function PedidoNuevoForm() {
  const [step, setStep] = useState(1);
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
    return items.reduce(
      (sum, item) => sum + item.cantidad * getPrecio(item.producto),
      0,
    );
  }, [items]);
  const stockWarnings = useMemo(() => {
    return items.flatMap((item) => {
      const selectedStock = stockIn(item.producto, item.almacen_id);
      const casaStock = casa ? stockIn(item.producto, casa.id) : 0;

      if (item.cantidad <= selectedStock) {
        return [];
      }

      if (item.almacen_id === tienda?.id && casaStock >= item.cantidad) {
        return [
          `${item.producto.nombre_producto}: No hay stock suficiente en Tienda. Hay stock disponible en Casa.`,
        ];
      }

      return [
        `${item.producto.nombre_producto}: stock insuficiente en el almacen seleccionado (${selectedStock}).`,
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

    const term = normalizeSpaces(productoSearch);
    if (!term && !categoriaId && !subcategoriaId) {
      setProductos([]);
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
          producto_almacen(almacen_id,stock_actual,almacenes(id,nombre))
        `,
      )
      .eq("activo", true)
      .order("nombre_producto")
      .limit(40);

    if (term) {
      query = query.or(`codigo_interno.ilike.%${term}%,nombre_producto.ilike.%${term}%`);
    }
    if (categoriaId) {
      query = query.eq("categoria_id", categoriaId);
    }
    if (subcategoriaId) {
      query = query.eq("subcategoria_id", subcategoriaId);
    }

    const { data, error } = await query;

    if (error) {
      setIsSearchingProducts(false);
      setMessage({ type: "error", text: `No se buscaron productos: ${error.message}` });
      return;
    }

    ((data ?? []) as ProductoSearchRow[]).forEach((producto) => {
      productMap.set(producto.id, producto);
    });

    if (term) {
      const marcasResult = await supabase
        .from("marcas")
        .select("id")
        .ilike("nombre", `%${term}%`)
        .limit(10);

      const marcaIds = (marcasResult.data ?? []).map((marca) => marca.id as string);
      if (marcaIds.length > 0) {
        let marcaQuery = supabase
          .from("productos")
          .select(
            `
              *,
              marcas(nombre),
              categorias(nombre),
              subcategorias(nombre),
              producto_almacen(almacen_id,stock_actual,almacenes(id,nombre))
            `,
          )
          .eq("activo", true)
          .in("marca_id", marcaIds)
          .order("nombre_producto")
          .limit(40);

        if (categoriaId) {
          marcaQuery = marcaQuery.eq("categoria_id", categoriaId);
        }
        if (subcategoriaId) {
          marcaQuery = marcaQuery.eq("subcategoria_id", subcategoriaId);
        }

        const marcaProducts = await marcaQuery;
        if (!marcaProducts.error) {
          ((marcaProducts.data ?? []) as ProductoSearchRow[]).forEach((producto) => {
            productMap.set(producto.id, producto);
          });
        }
      }
    }

    setProductos([...productMap.values()].slice(0, 40));
    setIsSearchingProducts(false);
  }

  async function searchClientes() {
    if (!supabase) {
      return;
    }

    const term = normalizeSpaces(clienteSearch);
    if (!term) {
      setClientes([]);
      return;
    }

    setIsSearchingClientes(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .eq("activo", true)
      .or(`nombres.ilike.%${term}%,telefono.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(10);
    setIsSearchingClientes(false);

    if (error) {
      setMessage({ type: "error", text: `No se buscaron clientes: ${error.message}` });
      return;
    }

    setClientes((data ?? []) as Cliente[]);
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
              producto_almacen(almacen_id,stock_actual,almacenes(id,nombre))
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
    const duplicatedItems = (pedido.detalle_pedido ?? [])
      .filter((detalle) => detalle.productos)
      .map((detalle) => ({
        producto: detalle.productos as ProductoSearchRow,
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
      tipoEntrega === "recoger_despues" && fechaRecojo
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
        hora_recojo: tipoEntrega === "recoger_despues" ? horaRecojo || null : null,
        estado: pedidoEstado,
        subtotal: total,
        total,
        metodo_pago: metodoPago,
        tipo_entrega: tipoEntrega,
        direccion_entrega: tipoEntrega === "enviar" ? direccionFinal : null,
        referencia_entrega: tipoEntrega === "enviar" ? referenciaFinal || null : null,
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
      almacen_id: item.almacen_id,
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

    const pedidoWhatsapp = {
      id: pedidoId,
      fecha_recojo: fechaRecojoValue,
      hora_recojo: tipoEntrega === "recoger_despues" ? horaRecojo || null : null,
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
      precio_unitario: getPrecio(item.producto),
      subtotal: item.cantidad * getPrecio(item.producto),
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

    setStep(1);
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
    clearCapture();
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
          {[1, 2, 3, 4, 5].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStep(item)}
              className={`h-10 rounded-md px-2 text-xs font-semibold sm:text-sm ${
                step === item
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 text-slate-600"
              }`}
            >
              {item}. {["Productos", "Cliente", "Entrega", "Pago", "Confirmar"][item - 1]}
            </button>
          ))}
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

          {!productoSearch.trim() && !categoriaId && !subcategoriaId ? (
            <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              Busca un producto o selecciona una categoria para empezar.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {isSearchingProducts ? (
                <p className="text-sm text-slate-500">Buscando productos...</p>
              ) : productos.length > 0 ? (
                productos.map((producto) => (
                  <button
                    key={producto.id}
                    type="button"
                    onClick={() => addProducto(producto)}
                    className="rounded-md border border-slate-200 p-3 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="block font-semibold text-slate-950">
                      {producto.nombre_producto}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {producto.codigo_interno} · {producto.marcas?.nombre ?? "Sin marca"}
                    </span>
                    <span className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
                      <span>Tienda {stockByName(producto, "Tienda")}</span>
                      <span>Casa {stockByName(producto, "Casa")}</span>
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
          )}

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
            onNext={() => setStep(Math.min(5, step + 1))}
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
          <StepActions step={step} canNext={Boolean(canGoNext)} onBack={() => setStep(1)} onNext={() => setStep(3)} />
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
                onClick={() => setTipoEntrega(value as TipoEntrega)}
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

          {tipoEntrega === "recoger_despues" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fecha de recojo" required>
                <input type="date" value={fechaRecojo} onChange={(event) => setFechaRecojo(event.target.value)} className={inputClassName} />
              </Field>
              <Field label="Hora de recojo" required>
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
          <StepActions step={step} canNext onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </Panel>
      ) : null}

      {step === 4 ? (
        <Panel title="Paso 4: pago">
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
          <StepActions step={step} canNext onBack={() => setStep(3)} onNext={() => setStep(5)} />
        </Panel>
      ) : null}

      {step === 5 ? (
        <Panel title="Paso 5: confirmacion">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryItem label="Cliente" value={selectedCliente?.nombres ?? clienteForm.nombres} />
            <SummaryItem label="WhatsApp" value={selectedCliente?.telefono ?? clienteForm.whatsapp} />
            <SummaryItem label="Entrega" value={tipoEntrega.replaceAll("_", " ")} />
            <SummaryItem label="Total" value={formatMoney(total)} strong />
          </div>
          <Cart items={items} almacenes={almacenes} readonly onUpdate={updateItem} onRemove={removeProducto} />
          {stockWarnings.length > 0 ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {stockWarnings.join(" ")}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setStep(4)} className="h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700">
              Volver
            </button>
            <button type="button" onClick={() => void savePedido(false)} disabled={isSavingPedido} className="h-11 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white disabled:bg-slate-300">
              {isSavingPedido ? "Guardando..." : "Guardar pedido"}
            </button>
            <button type="button" onClick={() => void savePedido(true)} disabled={isSavingPedido} className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white disabled:bg-slate-300">
              Guardar y enviar WhatsApp
            </button>
          </div>
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
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
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
                const precio = getPrecio(item.producto);
                const hasStockIssue = item.cantidad > stock;
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
                    <td className="px-3 py-3 text-slate-600">{formatMoney(precio)}</td>
                    <td className="px-3 py-3 font-semibold text-slate-950">{formatMoney(item.cantidad * precio)}</td>
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
        </table>
      </div>
      <div className="space-y-3 p-3 lg:hidden">
        {items.map((item) => {
          const precio = getPrecio(item.producto);
          const stock = stockIn(item.producto, item.almacen_id);
          const hasStockIssue = item.cantidad > stock;
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
                  <span>{formatMoney(precio)}</span>
                  <strong>{formatMoney(item.cantidad * precio)}</strong>
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
