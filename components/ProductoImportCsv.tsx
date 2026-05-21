"use client";

import { useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type { Categoria, Marca, Producto, Subcategoria } from "@/types/database";

const REQUIRED_HEADERS = [
  "codigo_interno",
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
  stock_minimo: number | null;
  precio_compra_referencial: number;
  precio_venta: number;
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
  return parseNumber(value, 0);
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
    const stockActualParsed = parseNumber(row.stock_actual ?? "", 0);
    const stockActual = stockActualParsed === null ? 0 : stockActualParsed;
    const stockMinimo = parseNumber(row.stock_minimo ?? "", null);
    const precioCompraParsed = parsePrice(
      row.precio_compra_referencial ?? "",
    );
    const precioVentaParsed = parsePrice(row.precio_venta ?? "");
    const precioCompra =
      precioCompraParsed === null ? 0 : precioCompraParsed;
    const precioVenta = precioVentaParsed === null ? 0 : precioVentaParsed;

    if (!codigoInterno) {
      errors.push("codigo_interno obligatorio");
    }

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

    if (Number.isNaN(precioCompra)) {
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
      stock_minimo: Number.isNaN(stockMinimo) ? null : stockMinimo,
      precio_compra_referencial: Number.isNaN(precioCompra)
        ? 0
        : precioCompra,
      precio_venta: Number.isNaN(precioVenta) ? 0 : precioVenta,
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

async function fetchExistingProductCodes() {
  const pageSize = 1000;
  const codes = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase!
      .from("productos")
      .select("codigo_interno")
      .range(from, from + pageSize - 1);

    if (error) {
      return { codes, error };
    }

    const products = (data ?? []) as Pick<Producto, "codigo_interno">[];

    products.forEach((product) => {
      codes.add(normalizeKey(product.codigo_interno));
    });

    if (products.length < pageSize) {
      return { codes, error: null };
    }

    from += pageSize;
  }
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

    const existingProducts = await fetchExistingProductCodes();

    if (existingProducts.error) {
      setMessage(
        `No se pudo consultar productos existentes: ${existingProducts.error.message}`,
      );
      setIsProcessing(false);
      return;
    }

    const existingCodes = existingProducts.codes;

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

      if (existingCodes.has(normalizeKey(row.codigo_interno))) {
        currentSummary.omitidos += 1;
        currentReport.push({
          fila: row.rowNumber,
          codigo_interno: row.codigo_interno,
          estado: "omitido",
          observacion: "Producto ya existe por codigo_interno; no se duplico.",
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

      const { error } = await supabase.from("productos").insert({
        codigo_interno: row.codigo_interno,
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
      });

      if (error) {
        if (error.code === "23505") {
          existingCodes.add(normalizeKey(row.codigo_interno));
          currentSummary.omitidos += 1;
          currentReport.push({
            fila: row.rowNumber,
            codigo_interno: row.codigo_interno,
            estado: "omitido",
            observacion:
              "Producto ya existe por codigo_interno; no se duplico.",
          });
          continue;
        }

        currentSummary.errores += 1;
        currentReport.push({
          fila: row.rowNumber,
          codigo_interno: row.codigo_interno,
          estado: "error",
          observacion: `No se pudo crear producto: ${error.message}`,
        });
        continue;
      }

      existingCodes.add(normalizeKey(row.codigo_interno));
      currentSummary.creados += 1;
      currentReport.push({
        fila: row.rowNumber,
        codigo_interno: row.codigo_interno,
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

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
                      {row.codigo_interno || "Sin codigo"}
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
                Productos actualizados se mantiene en 0 porque esta importacion
                no modifica productos existentes; los omite para no duplicar.
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
