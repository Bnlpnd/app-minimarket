"use client";

import { useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type { Almacen, Categoria, Marca, Producto, Subcategoria } from "@/types/database";

const REQUIRED_HEADERS = [
  "categoria",
  "subcategoria",
  "nombre_producto",
  "marca",
  "presentacion",
  "unidad_base",
  "stock_actual",
  "stock_minimo",
  "precio_compra_referencial",
  "precio_venta",
  "imagen_url",
  "activo",
];

type CsvRow = Record<string, string>;

type ImportRow = {
  rowNumber: number;
  codigo_interno: string;
  categoria: string;
  subcategoria: string;
  nombre_producto: string;
  marca: string;
  presentacion: string | null;
  unidad_base: string | null;
  stock_actual: number;
  stock_actual_explicit: boolean;
  stock_minimo: number;
  stock_minimo_explicit: boolean;
  precio_compra_referencial: number | null;
  precio_compra_explicit: boolean;
  precio_venta: number;
  precio_venta_explicit: boolean;
  imagen_url: string | null;
  activo: boolean;
  errors: string[];
  observations: string[];
};

type ImportReportItem = {
  fila: number;
  codigo_interno: string;
  estado: "creado" | "actualizado" | "omitido" | "error";
  observacion: string;
};

type ImportSummary = {
  creados: number;
  actualizados: number;
  errores: number;
  omitidos: number;
};

type CatalogState = {
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  marcas: Marca[];
};

type ProductoImportCsvProps = {
  initialCategorias: Categoria[];
  initialSubcategorias: Subcategoria[];
  initialMarcas: Marca[];
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
  const normalized = normalizeSpaces(value);
  return normalized ? normalized : null;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current !== "" || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows.filter((csvRow) =>
    csvRow.some((cell) => normalizeSpaces(cell) !== ""),
  );
}

function parseNumber(value: string, fallback: number | null) {
  const normalized = normalizeSpaces(value);

  if (!normalized) {
    return fallback;
  }

  const decimal = normalized.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(decimal);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parsePrice(value: string) {
  return parseNumber(value, null);
}

function parseActivo(value: string) {
  const normalized = normalizeKey(value);

  if (!normalized) {
    return true;
  }

  if (["si", "sí", "true", "1", "activo"].includes(normalized)) {
    return true;
  }

  if (["no", "false", "0", "inactivo"].includes(normalized)) {
    return false;
  }

  return true;
}

function decodeCsv(buffer: ArrayBuffer) {
  const utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const windowsText = new TextDecoder("windows-1252", { fatal: false }).decode(
    buffer,
  );
  const utf8Score = (utf8Text.match(/�|Ã|Â/g) ?? []).length;
  const windowsScore = (windowsText.match(/�|Ã|Â/g) ?? []).length;

  return windowsScore < utf8Score ? windowsText : utf8Text;
}

function csvRowsToObjects(rows: string[][]) {
  if (rows.length === 0) {
    return { headers: [], rows: [] as CsvRow[] };
  }

  const headers = rows[0].map((header) => normalizeSpaces(header));
  const objects = rows.slice(1).map((row) => {
    return headers.reduce<CsvRow>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {});
  });

  return { headers, rows: objects };
}

function buildImportRows(rows: CsvRow[]) {
  const seenCodes = new Set<string>();

  return rows.map<ImportRow>((row, index) => {
    const errors: string[] = [];
    const observations: string[] = [];
    const codigoInterno = normalizeSpaces(row.codigo_interno ?? "");
    const nombreProducto = normalizeSpaces(row.nombre_producto ?? "");
    const categoria = normalizeSpaces(row.categoria ?? "") || "Sin categoria";
    const subcategoria =
      normalizeSpaces(row.subcategoria ?? "") || "Sin subcategoria";
    const marca = normalizeSpaces(row.marca ?? "") || "Sin marca";
    const stockActualRaw = normalizeSpaces(row.stock_actual ?? "");
    const stockMinimoRaw = normalizeSpaces(row.stock_minimo ?? "");
    const precioCompraRaw = normalizeSpaces(row.precio_compra_referencial ?? "");
    const precioVentaRaw = normalizeSpaces(row.precio_venta ?? "");
    const stockActualParsed = parseNumber(stockActualRaw, 0);
    const stockActual = stockActualParsed === null ? 0 : stockActualParsed;
    const stockMinimoParsed = parseNumber(stockMinimoRaw, 10);
    const stockMinimo = stockMinimoParsed === null ? 10 : stockMinimoParsed;
    const precioCompra = parsePrice(precioCompraRaw);
    const precioVentaParsed = parseNumber(precioVentaRaw, 1);
    const precioVenta = precioVentaParsed === null ? 1 : precioVentaParsed;

    if (!nombreProducto) {
      errors.push("nombre_producto obligatorio");
    }

    if (codigoInterno && seenCodes.has(normalizeKey(codigoInterno))) {
      errors.push("codigo_interno duplicado en el CSV");
    }

    if (codigoInterno) {
      seenCodes.add(normalizeKey(codigoInterno));
    }

    if (Number.isNaN(stockActual)) {
      errors.push("stock_actual no es numerico");
    }

    if (Number.isNaN(stockMinimo)) {
      errors.push("stock_minimo no es numerico");
    }

    if (precioCompra !== null && Number.isNaN(precioCompra)) {
      errors.push("precio_compra_referencial no es numerico");
    }

    if (Number.isNaN(precioVenta)) {
      errors.push("precio_venta no es numerico");
    }

    if (!normalizeSpaces(row.categoria ?? "")) {
      observations.push("Sin categoria en CSV; se usara Sin categoria");
    }

    if (!normalizeSpaces(row.subcategoria ?? "")) {
      observations.push("Sin subcategoria en CSV; se usara Sin subcategoria");
    }

    if (!normalizeSpaces(row.marca ?? "")) {
      observations.push("Sin marca en CSV; se usara Sin marca");
    }

    return {
      rowNumber: index + 2,
      codigo_interno: codigoInterno,
      categoria,
      subcategoria,
      nombre_producto: nombreProducto,
      marca,
      presentacion: emptyToNull(row.presentacion ?? ""),
      unidad_base: emptyToNull(row.unidad_base ?? ""),
      stock_actual: Number.isNaN(stockActual) ? 0 : stockActual,
      stock_actual_explicit: stockActualRaw !== "",
      stock_minimo: Number.isNaN(stockMinimo) ? 10 : stockMinimo,
      stock_minimo_explicit: stockMinimoRaw !== "",
      precio_compra_referencial:
        precioCompra !== null && Number.isNaN(precioCompra)
          ? null
          : precioCompra,
      precio_compra_explicit: precioCompraRaw !== "",
      precio_venta: Number.isNaN(precioVenta) ? 1 : precioVenta,
      precio_venta_explicit: precioVentaRaw !== "",
      imagen_url: emptyToNull(row.imagen_url ?? ""),
      activo: parseActivo(row.activo ?? ""),
      errors,
      observations,
    };
  });
}

function buildReportText(report: ImportReportItem[], summary: ImportSummary) {
  const lines = [
    "Reporte de importacion de productos",
    `Productos creados: ${summary.creados}`,
    `Productos actualizados: ${summary.actualizados}`,
    `Productos omitidos: ${summary.omitidos}`,
    `Errores: ${summary.errores}`,
    "",
    "fila,codigo_interno,estado,observacion",
    ...report.map((item) =>
      [
        item.fila,
        item.codigo_interno,
        item.estado,
        item.observacion.replace(/\r?\n/g, " "),
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];

  return lines.join("\n");
}

type ExistingProductLite = Pick<
  Producto,
  | "id"
  | "codigo_interno"
  | "categoria_id"
  | "subcategoria_id"
  | "nombre_producto"
  | "marca_id"
  | "presentacion"
  | "precio_venta"
  | "precio_compra_referencial"
  | "stock_minimo"
>;

async function fetchExistingProducts() {
  const pageSize = 1000;
  const productsByCode = new Map<string, ExistingProductLite>();
  const productsByNaturalKey = new Map<string, ExistingProductLite>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase!
      .from("productos")
      .select("id,codigo_interno,categoria_id,subcategoria_id,nombre_producto,marca_id,presentacion,precio_venta,precio_compra_referencial,stock_minimo")
      .range(from, from + pageSize - 1);

    if (error) {
      return { productsByCode, productsByNaturalKey, error };
    }

    const rows = (data ?? []) as ExistingProductLite[];

    rows.forEach((product) => {
      productsByCode.set(normalizeKey(product.codigo_interno), product);
      productsByNaturalKey.set(
        buildNaturalProductKey({
          categoriaId: product.categoria_id,
          subcategoriaId: product.subcategoria_id,
          marcaId: product.marca_id,
          nombreProducto: product.nombre_producto,
          presentacion: product.presentacion,
        }),
        product,
      );
    });

    if (rows.length < pageSize) {
      return { productsByCode, productsByNaturalKey, error: null };
    }

    from += pageSize;
  }
}

function buildNaturalProductKey({
  categoriaId,
  subcategoriaId,
  marcaId,
  nombreProducto,
  presentacion,
}: {
  categoriaId: string;
  subcategoriaId: string;
  marcaId: string;
  nombreProducto: string;
  presentacion: string | null;
}) {
  return [
    categoriaId,
    subcategoriaId,
    marcaId,
    normalizeKey(nombreProducto),
    normalizeKey(presentacion ?? ""),
  ].join("|");
}

async function getTiendaAlmacen() {
  const { data, error } = await supabase!
    .from("almacenes")
    .select("*")
    .ilike("nombre", "tienda")
    .limit(1)
    .maybeSingle();

  if (error) {
    return { almacen: null as Almacen | null, error };
  }

  return { almacen: data as Almacen | null, error: null };
}

async function upsertStockTienda(
  productoId: string,
  almacenId: string,
  stockActual: number,
) {
  return supabase!.from("producto_almacen").upsert(
    {
      producto_id: productoId,
      almacen_id: almacenId,
      stock_actual: stockActual,
    },
    { onConflict: "producto_id,almacen_id" },
  );
}

async function ensureCategoria(
  name: string,
  catalog: CatalogState,
  report: ImportReportItem[],
  row: ImportRow,
) {
  const existing = catalog.categorias.find(
    (categoria) => normalizeKey(categoria.nombre) === normalizeKey(name),
  );

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase!
    .from("categorias")
    .insert({ nombre: name })
    .select("*")
    .single();

  if (error) {
    const retry = await supabase!
      .from("categorias")
      .select("*")
      .eq("nombre", name)
      .maybeSingle();

    if (retry.data) {
      const categoria = retry.data as Categoria;
      catalog.categorias.push(categoria);
      return categoria;
    }

    report.push({
      fila: row.rowNumber,
      codigo_interno: row.codigo_interno,
      estado: "error",
      observacion: `No se pudo crear categoria ${name}: ${error.message}`,
    });
    return null;
  }

  const categoria = data as Categoria;
  catalog.categorias.push(categoria);
  return categoria;
}

async function ensureSubcategoria(
  name: string,
  categoriaId: string,
  catalog: CatalogState,
  report: ImportReportItem[],
  row: ImportRow,
) {
  const existing = catalog.subcategorias.find(
    (subcategoria) =>
      subcategoria.categoria_id === categoriaId &&
      normalizeKey(subcategoria.nombre) === normalizeKey(name),
  );

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase!
    .from("subcategorias")
    .insert({ categoria_id: categoriaId, nombre: name })
    .select("*")
    .single();

  if (error) {
    report.push({
      fila: row.rowNumber,
      codigo_interno: row.codigo_interno,
      estado: "error",
      observacion: `No se pudo crear subcategoria ${name}: ${error.message}`,
    });
    return null;
  }

  const subcategoria = data as Subcategoria;
  catalog.subcategorias.push(subcategoria);
  return subcategoria;
}

async function ensureMarca(
  name: string,
  catalog: CatalogState,
  report: ImportReportItem[],
  row: ImportRow,
) {
  const existing = catalog.marcas.find(
    (marca) => normalizeKey(marca.nombre) === normalizeKey(name),
  );

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase!
    .from("marcas")
    .insert({ nombre: name })
    .select("*")
    .single();

  if (error) {
    report.push({
      fila: row.rowNumber,
      codigo_interno: row.codigo_interno,
      estado: "error",
      observacion: `No se pudo crear marca ${name}: ${error.message}`,
    });
    return null;
  }

  const marca = data as Marca;
  catalog.marcas.push(marca);
  return marca;
}

export function ProductoImportCsv({
  initialCategorias,
  initialSubcategorias,
  initialMarcas,
}: ProductoImportCsvProps) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedRows, setProcessedRows] = useState(0);
  const [report, setReport] = useState<ImportReportItem[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const previewRows = useMemo(() => rows.slice(0, 25), [rows]);
  const invalidRows = rows.filter((row) => row.errors.length > 0).length;
  const canImport = rows.length > 0 && !isProcessing;
  const reportText = summary ? buildReportText(report, summary) : "";

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setReport([]);
    setSummary(null);

    if (!file) {
      return;
    }

    const buffer = await file.arrayBuffer();
    const text = decodeCsv(buffer);
    const parsedRows = parseCsv(text);
    const { headers: parsedHeaders, rows: objectRows } =
      csvRowsToObjects(parsedRows);
    const missingHeaders = REQUIRED_HEADERS.filter(
      (header) => !parsedHeaders.includes(header),
    );

    setHeaders(parsedHeaders);

    if (missingHeaders.length > 0) {
      setRows([]);
      setMessage(`Faltan columnas requeridas: ${missingHeaders.join(", ")}`);
      return;
    }

    const importRows = buildImportRows(objectRows);
    setRows(importRows);
    setMessage(
      `Archivo cargado: ${importRows.length} filas. Filas con errores: ${importRows.filter((row) => row.errors.length > 0).length}.`,
    );
  }

  async function handleImport() {
    if (supabaseConfigError || !supabase) {
      setMessage(supabaseConfigError ?? "No hay conexion a Supabase.");
      return;
    }

    setIsProcessing(true);
    setProcessedRows(0);
    setMessage("Importando productos. No cierres esta pantalla.");
    const currentReport: ImportReportItem[] = [];
    const currentSummary: ImportSummary = {
      creados: 0,
      actualizados: 0,
      errores: 0,
      omitidos: 0,
    };
    const catalog: CatalogState = {
      categorias: [...initialCategorias],
      subcategorias: [...initialSubcategorias],
      marcas: [...initialMarcas],
    };

    const existingProducts = await fetchExistingProducts();

    if (existingProducts.error) {
      setMessage(
        `No se pudo consultar productos existentes: ${existingProducts.error.message}`,
      );
      setIsProcessing(false);
      return;
    }

    const tiendaResult = await getTiendaAlmacen();
    if (tiendaResult.error || !tiendaResult.almacen) {
      setMessage(
        `No se encontro el almacen Tienda: ${
          tiendaResult.error?.message ?? "crea el almacen Tienda antes de importar"
        }`,
      );
      setIsProcessing(false);
      return;
    }

    const existingProductsByCode = existingProducts.productsByCode;
    const existingProductsByNaturalKey = existingProducts.productsByNaturalKey;

    for (const [index, row] of rows.entries()) {
      setProcessedRows(index + 1);

      if (row.errors.length > 0) {
        currentSummary.errores += 1;
        currentReport.push({
          fila: row.rowNumber,
          codigo_interno: row.codigo_interno,
          estado: "error",
          observacion: row.errors.join("; "),
        });
        continue;
      }

      const categoria = await ensureCategoria(
        row.categoria,
        catalog,
        currentReport,
        row,
      );
      if (!categoria) {
        currentSummary.errores += 1;
        continue;
      }

      const subcategoria = await ensureSubcategoria(
        row.subcategoria,
        categoria.id,
        catalog,
        currentReport,
        row,
      );
      if (!subcategoria) {
        currentSummary.errores += 1;
        continue;
      }

      const marca = await ensureMarca(row.marca, catalog, currentReport, row);
      if (!marca) {
        currentSummary.errores += 1;
        continue;
      }

      const naturalKey = buildNaturalProductKey({
        categoriaId: categoria.id,
        subcategoriaId: subcategoria.id,
        marcaId: marca.id,
        nombreProducto: row.nombre_producto,
        presentacion: row.presentacion,
      });
      const existingProduct =
        (row.codigo_interno
          ? existingProductsByCode.get(normalizeKey(row.codigo_interno))
          : null) ?? existingProductsByNaturalKey.get(naturalKey);

      if (existingProduct) {
        const updatePayload: Partial<Producto> = {
          categoria_id: categoria.id,
          subcategoria_id: subcategoria.id,
          nombre_producto: row.nombre_producto,
          marca_id: marca.id,
          presentacion: row.presentacion,
          unidad_base: row.unidad_base,
          imagen_url: row.imagen_url,
          activo: row.activo,
          stock_minimo: row.stock_minimo_explicit
            ? row.stock_minimo
            : (existingProduct.stock_minimo ?? 10),
          precio_venta: row.precio_venta_explicit
            ? row.precio_venta
            : (existingProduct.precio_venta ?? 1),
          precio_compra_referencial: row.precio_compra_explicit
            ? row.precio_compra_referencial
            : existingProduct.precio_compra_referencial,
        };

        const { error } = await supabase
          .from("productos")
          .update(updatePayload)
          .eq("id", existingProduct.id);

        if (error) {
          currentSummary.errores += 1;
          currentReport.push({
            fila: row.rowNumber,
            codigo_interno: row.codigo_interno || existingProduct.codigo_interno,
            estado: "error",
            observacion: `No se pudo actualizar producto: ${error.message}`,
          });
          continue;
        }

        if (row.stock_actual_explicit) {
          const stockResult = await upsertStockTienda(
            existingProduct.id,
            tiendaResult.almacen.id,
            row.stock_actual,
          );

          if (stockResult.error) {
            currentSummary.errores += 1;
            currentReport.push({
              fila: row.rowNumber,
              codigo_interno: row.codigo_interno || existingProduct.codigo_interno,
              estado: "error",
              observacion: `Producto actualizado, pero fallo stock Tienda: ${stockResult.error.message}`,
            });
            continue;
          }
        }

        currentSummary.actualizados += 1;
        currentReport.push({
          fila: row.rowNumber,
          codigo_interno: row.codigo_interno || existingProduct.codigo_interno,
          estado: "actualizado",
          observacion:
            row.stock_actual_explicit
              ? "Producto actualizado; stock Tienda actualizado desde CSV."
              : "Producto actualizado; stock existente conservado porque CSV no trajo stock.",
        });
        continue;
      }

      const { data: insertedProduct, error } = await supabase.from("productos").insert({
        categoria_id: categoria.id,
        subcategoria_id: subcategoria.id,
        nombre_producto: row.nombre_producto,
        marca_id: marca.id,
        presentacion: row.presentacion,
        unidad_base: row.unidad_base,
        stock_actual: row.stock_actual,
        stock_minimo: row.stock_minimo,
        precio_compra_referencial: row.precio_compra_referencial,
        precio_venta: row.precio_venta,
        imagen_url: row.imagen_url,
        activo: row.activo,
      }).select("id,codigo_interno,categoria_id,subcategoria_id,nombre_producto,marca_id,presentacion,precio_venta,precio_compra_referencial,stock_minimo").single();

      if (error) {
        if (error.code === "23505") {
          const refreshed = await fetchExistingProducts();
          const duplicated = row.codigo_interno
            ? refreshed.productsByCode.get(normalizeKey(row.codigo_interno))
            : refreshed.productsByNaturalKey.get(naturalKey);
          if (duplicated) {
            existingProductsByCode.set(normalizeKey(duplicated.codigo_interno), duplicated);
            existingProductsByNaturalKey.set(naturalKey, duplicated);
          }
          currentSummary.omitidos += 1;
          currentReport.push({
            fila: row.rowNumber,
            codigo_interno: row.codigo_interno || duplicated?.codigo_interno || "Autogenerado",
            estado: "omitido",
            observacion:
              "Producto ya existe; no se duplico.",
          });
          continue;
        }

        currentSummary.errores += 1;
        currentReport.push({
          fila: row.rowNumber,
          codigo_interno: row.codigo_interno || "Autogenerado",
          estado: "error",
          observacion: `No se pudo crear producto: ${error.message}`,
        });
        continue;
      }

      const newProduct = insertedProduct as ExistingProductLite;
      const stockResult = await upsertStockTienda(
        newProduct.id,
        tiendaResult.almacen.id,
        row.stock_actual,
      );

      if (stockResult.error) {
        currentSummary.errores += 1;
        currentReport.push({
          fila: row.rowNumber,
          codigo_interno: newProduct.codigo_interno,
          estado: "error",
          observacion: `Producto creado, pero fallo stock Tienda: ${stockResult.error.message}`,
        });
        continue;
      }

      existingProductsByCode.set(normalizeKey(newProduct.codigo_interno), newProduct);
      existingProductsByNaturalKey.set(naturalKey, newProduct);
      currentSummary.creados += 1;
      currentReport.push({
        fila: row.rowNumber,
        codigo_interno: newProduct.codigo_interno,
        estado: "creado",
        observacion:
          row.observations.length > 0
            ? row.observations.join("; ")
            : "Producto creado.",
      });
    }

    setReport(currentReport);
    setSummary(currentSummary);
    setMessage(
      currentSummary.creados === 0 && currentSummary.errores === 0
        ? "Importacion finalizada. Todos los productos del archivo ya existian; no se duplicaron."
        : "Importacion finalizada.",
    );
    setIsProcessing(false);
  }

  async function handleCopyReport() {
    if (!reportText) {
      return;
    }

    await navigator.clipboard.writeText(reportText);
    setMessage("Reporte copiado al portapapeles.");
  }

  function handleDownloadReport() {
    if (!reportText) {
      return;
    }

    const blob = new Blob([reportText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reporte-importacion-productos.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Importar productos desde CSV
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Selecciona un archivo CSV, revisa la previsualizacion y luego
              guarda los productos. El archivo no se almacena; solo se guardan
              los datos validados en Supabase.
            </p>
          </div>
          <label className="inline-flex h-10 w-fit cursor-pointer items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Seleccionar CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
        </div>

        {message ? (
          <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {message}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Filas cargadas" value={rows.length} />
          <Stat label="Filas con errores" value={invalidRows} />
          <Stat label="Columnas detectadas" value={headers.length} />
        </div>

        {isProcessing ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Importando fila {processedRows} de {rows.length}. Este proceso puede
            tardar unos minutos si el archivo tiene muchos productos.
          </div>
        ) : null}
      </section>

      {rows.length > 0 ? (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Previsualizacion
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Se muestran las primeras 25 filas.
              </p>
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport}
              className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isProcessing ? "Importando..." : "Guardar productos"}
            </button>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Fila</th>
                  <th className="px-4 py-3 font-medium">Codigo</th>
                  <th className="px-4 py-3 font-medium">Producto</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                  <th className="px-4 py-3 font-medium">Subcategoria</th>
                  <th className="px-4 py-3 font-medium">Marca</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Precio</th>
                  <th className="px-4 py-3 font-medium">Activo</th>
                  <th className="px-4 py-3 font-medium">Observacion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.codigo_interno}`}>
                    <td className="px-4 py-3">{row.rowNumber}</td>
                    <td className="px-4 py-3 font-medium">
                      {row.codigo_interno || "Autogenerado"}
                    </td>
                    <td className="px-4 py-3">{row.nombre_producto}</td>
                    <td className="px-4 py-3">{row.categoria}</td>
                    <td className="px-4 py-3">{row.subcategoria}</td>
                    <td className="px-4 py-3">{row.marca}</td>
                    <td className="px-4 py-3">{row.stock_actual}</td>
                    <td className="px-4 py-3">
                      {row.precio_venta.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">{row.activo ? "Si" : "No"}</td>
                    <td className="px-4 py-3">
                      {[...row.errors, ...row.observations].join("; ") ||
                        "Lista para importar"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {summary ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Resumen final
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Si el CSV trae codigo interno, se usa para reconocer productos
                existentes. Si no lo trae, los productos nuevos reciben codigo
                automatico. El stock de Tienda solo se sobrescribe cuando el CSV
                trae stock_actual explicito.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyReport}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Copiar reporte
              </button>
              <button
                type="button"
                onClick={handleDownloadReport}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Descargar reporte
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Stat label="Creados" value={summary.creados} />
            <Stat label="Actualizados" value={summary.actualizados} />
            <Stat label="Omitidos" value={summary.omitidos} />
            <Stat label="Errores" value={summary.errores} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
