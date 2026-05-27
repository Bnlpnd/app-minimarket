"use client";

/**
 * Importacion masiva de productos desde CSV.
 *
 * Flujo:
 *   1) Usuario descarga la plantilla (boton "Descargar plantilla").
 *   2) Edita en Excel/Sheets, exporta CSV, lo sube.
 *   3) Previsualizacion con validaciones y errores por fila.
 *   4) "Guardar productos" persiste: cabecera + stock por almacen
 *      (con factor de presentacion) + presentacion de compra + lote
 *      con vencimiento si corresponde.
 *
 * Columnas soportadas (orden libre, nombres EXACTOS o sus alias):
 *   Obligatorias:
 *     nombre_producto, categoria, subcategoria, marca, presentacion, precio_venta
 *   Opcionales:
 *     codigo_interno, unidad_base, precio_compra (alias precio_compra_referencial),
 *     stock_minimo, stock_tienda (alias stock_actual), stock_casa,
 *     stock_tienda_pres, stock_casa_pres,
 *     pres_compra_nombre, pres_compra_unidades, pres_compra_costo_total,
 *     lote_fecha_vto, lote_almacen, imagen_url, activo
 *
 * Para stock por presentacion (sacos, cajas, planchas):
 *   stock_final = stock_<alm> + (stock_<alm>_pres x pres_compra_unidades)
 *   Ej: arroz pirata, stock_tienda=5, stock_tienda_pres=1, pres_compra_unidades=49
 *   -> 5 + 1*49 = 54 kg en Tienda.
 */

import { useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type {
  Almacen,
  Categoria,
  Marca,
  Producto,
  Subcategoria,
} from "@/types/database";

// ============================================================================
// Definicion de columnas
// ============================================================================

type HeaderDef = {
  name: string;
  required: boolean;
  aliases?: string[];
  comment: string;
};

const HEADER_DEFS: HeaderDef[] = [
  { name: "nombre_producto", required: true, comment: "Nombre completo del producto" },
  { name: "categoria", required: true, comment: "Se crea si no existe" },
  { name: "subcategoria", required: true, comment: "Se crea bajo la categoria" },
  { name: "marca", required: true, comment: "Se crea si no existe" },
  { name: "presentacion", required: true, comment: "Botella, Bolsa, Saco, Unidad..." },
  { name: "unidad_base", required: false, comment: "und/kg/lt/ml/g - default und" },
  { name: "precio_compra", required: false, aliases: ["precio_compra_referencial"], comment: "Costo por unidad base" },
  { name: "precio_venta", required: true, comment: "Precio por unidad base" },
  { name: "stock_minimo", required: false, comment: "Default 10" },
  { name: "stock_tienda", required: false, aliases: ["stock_actual"], comment: "En unidad base (kg, und)" },
  { name: "stock_casa", required: false, comment: "En unidad base" },
  { name: "stock_tienda_pres", required: false, comment: "En presentaciones (sacos, cajas)" },
  { name: "stock_casa_pres", required: false, comment: "En presentaciones" },
  { name: "pres_compra_nombre", required: false, comment: "Ej: Saco x49, Plancha x18" },
  { name: "pres_compra_unidades", required: false, comment: "Cuantas unidades base trae la presentacion" },
  { name: "pres_compra_costo_total", required: false, comment: "Costo total de una presentacion" },
  { name: "lote_fecha_vto", required: false, comment: "YYYY-MM-DD opcional" },
  { name: "lote_almacen", required: false, comment: "tienda o casa - default tienda" },
  { name: "imagen_url", required: false, comment: "URL completa https://..." },
  { name: "activo", required: false, comment: "si/no - default si" },
  { name: "codigo_interno", required: false, comment: "Si vacio, se autogenera" },
];

const REQUIRED_HEADERS = HEADER_DEFS.filter((h) => h.required).map((h) => h.name);
const ALL_OFFICIAL_HEADERS = HEADER_DEFS.map((h) => h.name);

// Mapa alias -> oficial. Permite que un CSV con headers viejos siga funcionando.
const ALIAS_MAP: Record<string, string> = HEADER_DEFS.reduce((acc, def) => {
  for (const alias of def.aliases ?? []) {
    acc[normalizeKey(alias)] = def.name;
  }
  return acc;
}, {} as Record<string, string>);

// Fila de ejemplo para la plantilla descargable.
const PLANTILLA_EJEMPLO: Record<string, string> = {
  nombre_producto: "Arroz pirata azul",
  categoria: "Abarrotes",
  subcategoria: "Arroz",
  marca: "Pirata",
  presentacion: "Granel",
  unidad_base: "kg",
  precio_compra: "2.49",
  precio_venta: "3.00",
  stock_minimo: "20",
  stock_tienda: "5",
  stock_casa: "0",
  stock_tienda_pres: "1",
  stock_casa_pres: "3",
  pres_compra_nombre: "Saco x49",
  pres_compra_unidades: "49",
  pres_compra_costo_total: "122.00",
  lote_fecha_vto: "",
  lote_almacen: "",
  imagen_url: "",
  activo: "si",
  codigo_interno: "",
};

// ============================================================================
// Tipos
// ============================================================================

type CsvRow = Record<string, string>;

type ImportRow = {
  rowNumber: number;
  // Obligatorios
  nombre_producto: string;
  categoria: string;
  subcategoria: string;
  marca: string;
  presentacion: string;
  precio_venta: number;
  // Opcionales
  codigo_interno: string;
  unidad_base: string | null;
  precio_compra: number | null;
  stock_minimo: number;
  stock_minimo_explicit: boolean;
  stock_tienda: number;
  stock_casa: number;
  stock_tienda_pres: number;
  stock_casa_pres: number;
  stock_tienda_explicit: boolean;
  stock_casa_explicit: boolean;
  pres_compra_nombre: string;
  pres_compra_unidades: number | null;
  pres_compra_costo_total: number | null;
  lote_fecha_vto: string | null;
  lote_almacen: "tienda" | "casa";
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
  presentaciones_creadas: number;
  lotes_creados: number;
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

// ============================================================================
// Helpers de parseo
// ============================================================================

function normalizeSpaces(value: string) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return normalizeSpaces(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function emptyToNull(value: string | undefined | null) {
  const normalized = normalizeSpaces(value ?? "");
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
    if ((char === "," || char === ";") && !inQuotes) {
      // Soporta separador "," (estandar) o ";" (Excel ES).
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

// Overloads para que TS sepa que el tipo del retorno sigue al del fallback.
function parseNumber(value: string, fallback: number): number;
function parseNumber(value: string, fallback: null): number | null;
function parseNumber(value: string, fallback: number | null): number | null {
  const normalized = normalizeSpaces(value);
  if (!normalized) return fallback;
  const decimal = normalized.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(decimal);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseActivo(value: string) {
  const normalized = normalizeKey(value);
  if (!normalized) return true;
  if (["si", "sí", "true", "1", "activo", "yes"].includes(normalized)) return true;
  if (["no", "false", "0", "inactivo"].includes(normalized)) return false;
  return true;
}

function parseAlmacenLote(value: string): "tienda" | "casa" {
  return normalizeKey(value) === "casa" ? "casa" : "tienda";
}

function decodeCsv(buffer: ArrayBuffer) {
  // BOM UTF-8: si esta presente, removerlo.
  const view = new Uint8Array(buffer);
  let offset = 0;
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
    offset = 3;
  }
  const trimmed = buffer.slice(offset);
  const utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(trimmed);
  const windowsText = new TextDecoder("windows-1252", { fatal: false }).decode(trimmed);
  const utf8Score = (utf8Text.match(/�|Ã|Â/g) ?? []).length;
  const windowsScore = (windowsText.match(/�|Ã|Â/g) ?? []).length;
  return windowsScore < utf8Score ? windowsText : utf8Text;
}

function csvRowsToObjects(rows: string[][]) {
  if (rows.length === 0) {
    return { headers: [], normalizedHeaders: [], rows: [] as CsvRow[] };
  }

  const rawHeaders = rows[0].map((h) => normalizeSpaces(h));
  // Normalizar + aplicar alias.
  const normalizedHeaders = rawHeaders.map((header) => {
    const key = normalizeKey(header);
    return ALIAS_MAP[key] ?? key;
  });

  const objects = rows.slice(1).map((row) => {
    return normalizedHeaders.reduce<CsvRow>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {});
  });

  return { headers: rawHeaders, normalizedHeaders, rows: objects };
}

function buildImportRows(rows: CsvRow[]) {
  const seenCodes = new Set<string>();

  return rows.map<ImportRow>((row, index) => {
    const errors: string[] = [];
    const observations: string[] = [];
    const codigoInterno = normalizeSpaces(row.codigo_interno ?? "");
    const nombreProducto = normalizeSpaces(row.nombre_producto ?? "");
    const categoria = normalizeSpaces(row.categoria ?? "");
    const subcategoria = normalizeSpaces(row.subcategoria ?? "");
    const marca = normalizeSpaces(row.marca ?? "");
    const presentacion = normalizeSpaces(row.presentacion ?? "");

    // Numeros
    const precioVentaRaw = normalizeSpaces(row.precio_venta ?? "");
    const precioCompraRaw = normalizeSpaces(row.precio_compra ?? "");
    const stockMinimoRaw = normalizeSpaces(row.stock_minimo ?? "");
    const stockTiendaRaw = normalizeSpaces(row.stock_tienda ?? "");
    const stockCasaRaw = normalizeSpaces(row.stock_casa ?? "");
    const stockTiendaPresRaw = normalizeSpaces(row.stock_tienda_pres ?? "");
    const stockCasaPresRaw = normalizeSpaces(row.stock_casa_pres ?? "");
    const presUnidadesRaw = normalizeSpaces(row.pres_compra_unidades ?? "");
    const presCostoRaw = normalizeSpaces(row.pres_compra_costo_total ?? "");

    const precioVenta = parseNumber(precioVentaRaw, NaN);
    const precioCompra = parseNumber(precioCompraRaw, null);
    const stockMinimo = parseNumber(stockMinimoRaw, 10);
    const stockTienda = parseNumber(stockTiendaRaw, 0);
    const stockCasa = parseNumber(stockCasaRaw, 0);
    const stockTiendaPres = parseNumber(stockTiendaPresRaw, 0);
    const stockCasaPres = parseNumber(stockCasaPresRaw, 0);
    const presUnidades = parseNumber(presUnidadesRaw, null);
    const presCosto = parseNumber(presCostoRaw, null);

    // ---- Validaciones ----
    if (!nombreProducto) errors.push("nombre_producto obligatorio");
    if (!categoria) errors.push("categoria obligatoria");
    if (!subcategoria) errors.push("subcategoria obligatoria");
    if (!marca) errors.push("marca obligatoria");
    if (!presentacion) errors.push("presentacion obligatoria");
    if (!precioVentaRaw) errors.push("precio_venta obligatorio");
    else if (Number.isNaN(precioVenta) || precioVenta < 0) {
      errors.push(`precio_venta invalido: ${precioVentaRaw}`);
    }

    if (precioCompra !== null && Number.isNaN(precioCompra)) {
      errors.push(`precio_compra invalido: ${precioCompraRaw}`);
    }
    if (Number.isNaN(stockMinimo)) errors.push(`stock_minimo invalido: ${stockMinimoRaw}`);
    if (Number.isNaN(stockTienda)) errors.push(`stock_tienda invalido: ${stockTiendaRaw}`);
    if (Number.isNaN(stockCasa)) errors.push(`stock_casa invalido: ${stockCasaRaw}`);
    if (Number.isNaN(stockTiendaPres)) errors.push(`stock_tienda_pres invalido: ${stockTiendaPresRaw}`);
    if (Number.isNaN(stockCasaPres)) errors.push(`stock_casa_pres invalido: ${stockCasaPresRaw}`);
    if (presUnidades !== null && Number.isNaN(presUnidades)) {
      errors.push(`pres_compra_unidades invalido: ${presUnidadesRaw}`);
    }
    if (presCosto !== null && Number.isNaN(presCosto)) {
      errors.push(`pres_compra_costo_total invalido: ${presCostoRaw}`);
    }

    // Si usa stock por presentacion sin pres_compra_unidades, avisar.
    if ((Number(stockTiendaPres) > 0 || Number(stockCasaPres) > 0) &&
        (presUnidades === null || presUnidades <= 0)) {
      errors.push("stock_*_pres requiere pres_compra_unidades > 0");
    }

    if (codigoInterno && seenCodes.has(normalizeKey(codigoInterno))) {
      errors.push("codigo_interno duplicado en el CSV");
    }
    if (codigoInterno) {
      seenCodes.add(normalizeKey(codigoInterno));
    }

    // Validar fecha de vencimiento
    const loteFechaRaw = normalizeSpaces(row.lote_fecha_vto ?? "");
    let loteFechaVto: string | null = null;
    if (loteFechaRaw) {
      // Formato YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(loteFechaRaw)) {
        errors.push(`lote_fecha_vto debe ser YYYY-MM-DD: ${loteFechaRaw}`);
      } else {
        loteFechaVto = loteFechaRaw;
      }
    }

    return {
      rowNumber: index + 2, // +2: linea de header + 1-indexed
      nombre_producto: nombreProducto,
      categoria,
      subcategoria,
      marca,
      presentacion,
      precio_venta: Number.isNaN(precioVenta) ? 0 : precioVenta,
      codigo_interno: codigoInterno,
      unidad_base: emptyToNull(row.unidad_base) ?? "und",
      precio_compra: precioCompra === null || Number.isNaN(precioCompra) ? null : precioCompra,
      stock_minimo: Number.isNaN(stockMinimo) ? 10 : (stockMinimo ?? 10),
      stock_minimo_explicit: stockMinimoRaw !== "",
      stock_tienda: Number.isNaN(stockTienda) ? 0 : (stockTienda ?? 0),
      stock_casa: Number.isNaN(stockCasa) ? 0 : (stockCasa ?? 0),
      stock_tienda_pres: Number.isNaN(stockTiendaPres) ? 0 : (stockTiendaPres ?? 0),
      stock_casa_pres: Number.isNaN(stockCasaPres) ? 0 : (stockCasaPres ?? 0),
      stock_tienda_explicit: stockTiendaRaw !== "" || stockTiendaPresRaw !== "",
      stock_casa_explicit: stockCasaRaw !== "" || stockCasaPresRaw !== "",
      pres_compra_nombre: normalizeSpaces(row.pres_compra_nombre ?? ""),
      pres_compra_unidades: presUnidades === null || Number.isNaN(presUnidades) ? null : presUnidades,
      pres_compra_costo_total: presCosto === null || Number.isNaN(presCosto) ? null : presCosto,
      lote_fecha_vto: loteFechaVto,
      lote_almacen: parseAlmacenLote(row.lote_almacen ?? ""),
      imagen_url: emptyToNull(row.imagen_url),
      activo: parseActivo(row.activo ?? ""),
      errors,
      observations,
    };
  });
}

// ============================================================================
// Plantilla descargable
// ============================================================================

function buildPlantillaCsv(): string {
  const headers = ALL_OFFICIAL_HEADERS.join(",");
  const example = ALL_OFFICIAL_HEADERS.map((h) => {
    const v = PLANTILLA_EJEMPLO[h] ?? "";
    // Si tiene coma o comilla, encerrar entre comillas.
    if (/[",\n]/.test(v)) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  }).join(",");
  // BOM UTF-8 para que Excel lo abra con tildes bien.
  return "﻿" + headers + "\n" + example + "\n";
}

function downloadPlantilla() {
  const csv = buildPlantillaCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "plantilla-productos.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function buildReportText(report: ImportReportItem[], summary: ImportSummary) {
  const lines = [
    "Reporte de importacion de productos",
    `Productos creados: ${summary.creados}`,
    `Productos actualizados: ${summary.actualizados}`,
    `Productos omitidos: ${summary.omitidos}`,
    `Presentaciones de compra creadas: ${summary.presentaciones_creadas}`,
    `Lotes creados: ${summary.lotes_creados}`,
    `Errores: ${summary.errores}`,
    "",
    "fila,codigo_interno,estado,observacion",
    ...report.map((item) =>
      [item.fila, item.codigo_interno, item.estado, item.observacion.replace(/\r?\n/g, " ")]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];
  return lines.join("\n");
}

// ============================================================================
// Catalogos (ensure-or-create)
// ============================================================================

async function ensureCategoria(
  name: string,
  catalog: CatalogState,
): Promise<{ data: Categoria | null; error: string | null }> {
  const existing = catalog.categorias.find(
    (c) => normalizeKey(c.nombre) === normalizeKey(name),
  );
  if (existing) return { data: existing, error: null };

  const { data, error } = await supabase!
    .from("categorias")
    .insert({ nombre: name, activo: true })
    .select("*")
    .single();

  if (error) {
    // Carrera: alguien ya la creo. Buscamos de nuevo.
    const retry = await supabase!
      .from("categorias")
      .select("*")
      .ilike("nombre", name)
      .maybeSingle();
    if (retry.data) {
      catalog.categorias.push(retry.data as Categoria);
      return { data: retry.data as Categoria, error: null };
    }
    return { data: null, error: error.message };
  }

  const cat = data as Categoria;
  catalog.categorias.push(cat);
  return { data: cat, error: null };
}

async function ensureSubcategoria(
  name: string,
  categoriaId: string,
  catalog: CatalogState,
): Promise<{ data: Subcategoria | null; error: string | null }> {
  const existing = catalog.subcategorias.find(
    (s) =>
      s.categoria_id === categoriaId &&
      normalizeKey(s.nombre) === normalizeKey(name),
  );
  if (existing) return { data: existing, error: null };

  const { data, error } = await supabase!
    .from("subcategorias")
    .insert({ categoria_id: categoriaId, nombre: name, activo: true })
    .select("*")
    .single();

  if (error) {
    const retry = await supabase!
      .from("subcategorias")
      .select("*")
      .eq("categoria_id", categoriaId)
      .ilike("nombre", name)
      .maybeSingle();
    if (retry.data) {
      catalog.subcategorias.push(retry.data as Subcategoria);
      return { data: retry.data as Subcategoria, error: null };
    }
    return { data: null, error: error.message };
  }

  const sc = data as Subcategoria;
  catalog.subcategorias.push(sc);
  return { data: sc, error: null };
}

async function ensureMarca(
  name: string,
  catalog: CatalogState,
): Promise<{ data: Marca | null; error: string | null }> {
  const existing = catalog.marcas.find(
    (m) => normalizeKey(m.nombre) === normalizeKey(name),
  );
  if (existing) return { data: existing, error: null };

  const { data, error } = await supabase!
    .from("marcas")
    .insert({ nombre: name, activo: true })
    .select("*")
    .single();

  if (error) {
    const retry = await supabase!
      .from("marcas")
      .select("*")
      .ilike("nombre", name)
      .maybeSingle();
    if (retry.data) {
      catalog.marcas.push(retry.data as Marca);
      return { data: retry.data as Marca, error: null };
    }
    return { data: null, error: error.message };
  }

  const m = data as Marca;
  catalog.marcas.push(m);
  return { data: m, error: null };
}

async function ensurePresentacion(name: string): Promise<void> {
  // El producto guarda presentacion como texto; igual mantenemos el
  // catalogo sincronizado para que aparezca en los selects.
  if (!supabase) return;
  const { data } = await supabase
    .from("presentaciones")
    .select("id")
    .ilike("nombre", name)
    .maybeSingle();
  if (!data) {
    await supabase.from("presentaciones").insert({ nombre: name, activo: true });
  }
}

// ============================================================================
// Productos existentes
// ============================================================================

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

    if (error) return { productsByCode, productsByNaturalKey, error };

    const rows = (data ?? []) as ExistingProductLite[];
    for (const product of rows) {
      if (product.codigo_interno) {
        productsByCode.set(normalizeKey(product.codigo_interno), product);
      }
      productsByNaturalKey.set(
        buildNaturalKey(
          product.categoria_id,
          product.subcategoria_id,
          product.marca_id,
          product.nombre_producto,
          product.presentacion ?? "",
        ),
        product,
      );
    }
    if (rows.length < pageSize) return { productsByCode, productsByNaturalKey, error: null };
    from += pageSize;
  }
}

function buildNaturalKey(
  categoriaId: string,
  subcategoriaId: string,
  marcaId: string,
  nombre: string,
  presentacion: string,
) {
  return [
    categoriaId,
    subcategoriaId,
    marcaId,
    normalizeKey(nombre),
    normalizeKey(presentacion),
  ].join("|");
}

async function loadAlmacenes(): Promise<Almacen[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("almacenes")
    .select("*")
    .eq("activo", true);
  return (data ?? []) as Almacen[];
}

function findAlmacenByName(almacenes: Almacen[], names: string[]): Almacen | null {
  const lowered = names.map((n) => n.toLowerCase());
  return almacenes.find((a) => lowered.includes(a.nombre.toLowerCase())) ?? null;
}

async function upsertStock(productoId: string, almacenId: string, stock: number) {
  return supabase!.from("producto_almacen").upsert(
    {
      producto_id: productoId,
      almacen_id: almacenId,
      stock_actual: stock,
    },
    { onConflict: "producto_id,almacen_id" },
  );
}

async function upsertPresentacionCompra(productoId: string, row: ImportRow): Promise<boolean> {
  if (!supabase) return false;
  if (!row.pres_compra_nombre || !row.pres_compra_unidades || row.pres_compra_unidades <= 0) {
    return false;
  }

  // Buscar existente por nombre + producto
  const { data: existing } = await supabase
    .from("producto_presentaciones_compra")
    .select("id")
    .eq("producto_id", productoId)
    .ilike("nombre_presentacion", row.pres_compra_nombre)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("producto_presentaciones_compra")
      .update({
        unidades_por_presentacion: row.pres_compra_unidades,
        costo_presentacion: row.pres_compra_costo_total,
        activo: true,
      })
      .eq("id", (existing as { id: string }).id);
    return false;
  }

  // Desmarcar otras principales
  await supabase
    .from("producto_presentaciones_compra")
    .update({ es_principal: false })
    .eq("producto_id", productoId);

  await supabase.from("producto_presentaciones_compra").insert({
    producto_id: productoId,
    nombre_presentacion: row.pres_compra_nombre,
    unidades_por_presentacion: row.pres_compra_unidades,
    costo_presentacion: row.pres_compra_costo_total,
    es_principal: true,
    activo: true,
  });
  return true;
}

async function maybeCreateLote(
  productoId: string,
  row: ImportRow,
  tiendaId: string,
  casaId: string | null,
  stockTiendaFinal: number,
  stockCasaFinal: number,
): Promise<boolean> {
  if (!supabase || !row.lote_fecha_vto) return false;

  const almacenLoteId = row.lote_almacen === "casa" ? casaId : tiendaId;
  if (!almacenLoteId) return false;

  const cantidad = row.lote_almacen === "casa" ? stockCasaFinal : stockTiendaFinal;
  if (cantidad <= 0) return false;

  const { error } = await supabase.from("producto_lotes").insert({
    producto_id: productoId,
    almacen_id: almacenLoteId,
    cantidad_inicial: cantidad,
    cantidad_actual: cantidad,
    fecha_vencimiento: row.lote_fecha_vto,
    origen: "inicial",
    notas: "Importado desde CSV",
  });
  return !error;
}

// ============================================================================
// Componente
// ============================================================================

export function ProductoImportCsv({
  initialCategorias,
  initialSubcategorias,
  initialMarcas,
}: ProductoImportCsvProps) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [unknownHeaders, setUnknownHeaders] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedRows, setProcessedRows] = useState(0);
  const [report, setReport] = useState<ImportReportItem[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [showColumns, setShowColumns] = useState(false);

  const previewRows = useMemo(() => rows.slice(0, 25), [rows]);
  const invalidRows = rows.filter((r) => r.errors.length > 0).length;
  const canImport = rows.length > 0 && !isProcessing && invalidRows === 0;
  const reportText = summary ? buildReportText(report, summary) : "";

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setReport([]);
    setSummary(null);
    setMessage(null);
    setUnknownHeaders([]);

    if (!file) return;

    const buffer = await file.arrayBuffer();
    const text = decodeCsv(buffer);
    const parsedRows = parseCsv(text);
    const { headers: parsed, normalizedHeaders, rows: objectRows } =
      csvRowsToObjects(parsedRows);

    setRawHeaders(parsed);

    const missingRequired = REQUIRED_HEADERS.filter(
      (h) => !normalizedHeaders.includes(h),
    );

    if (missingRequired.length > 0) {
      setRows([]);
      setMessage(
        `Faltan columnas obligatorias: ${missingRequired.join(", ")}. Descarga la plantilla.`,
      );
      return;
    }

    // Detectar columnas extra que no reconocemos (para avisar al usuario).
    const unknowns = normalizedHeaders.filter(
      (h) => !ALL_OFFICIAL_HEADERS.includes(h),
    );
    setUnknownHeaders(unknowns);

    const importRows = buildImportRows(objectRows);
    setRows(importRows);
    const conErr = importRows.filter((r) => r.errors.length > 0).length;
    setMessage(
      `Archivo cargado: ${importRows.length} filas. Con errores: ${conErr}.`,
    );
  }

  async function handleImport() {
    if (supabaseConfigError || !supabase) {
      setMessage(supabaseConfigError ?? "No hay conexion a Supabase.");
      return;
    }

    setIsProcessing(true);
    setProcessedRows(0);
    setMessage("Importando. No cierres esta pantalla.");
    const currentReport: ImportReportItem[] = [];
    const currentSummary: ImportSummary = {
      creados: 0,
      actualizados: 0,
      errores: 0,
      omitidos: 0,
      presentaciones_creadas: 0,
      lotes_creados: 0,
    };
    const catalog: CatalogState = {
      categorias: [...initialCategorias],
      subcategorias: [...initialSubcategorias],
      marcas: [...initialMarcas],
    };

    const existing = await fetchExistingProducts();
    if (existing.error) {
      setMessage(`No se pudo consultar productos existentes: ${existing.error.message}`);
      setIsProcessing(false);
      return;
    }

    const almacenes = await loadAlmacenes();
    const tienda = findAlmacenByName(almacenes, ["tienda", "negocio"]);
    const casa = findAlmacenByName(almacenes, ["casa"]);

    if (!tienda) {
      setMessage("No se encontro el almacen Tienda. Crealo antes de importar.");
      setIsProcessing(false);
      return;
    }

    for (const [index, row] of rows.entries()) {
      setProcessedRows(index + 1);

      // Errores de validacion previa
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

      // 1) Catalogos
      const catRes = await ensureCategoria(row.categoria, catalog);
      if (!catRes.data) {
        currentSummary.errores += 1;
        currentReport.push({
          fila: row.rowNumber,
          codigo_interno: row.codigo_interno,
          estado: "error",
          observacion: `No se pudo crear categoria: ${catRes.error}`,
        });
        continue;
      }
      const subRes = await ensureSubcategoria(row.subcategoria, catRes.data.id, catalog);
      if (!subRes.data) {
        currentSummary.errores += 1;
        currentReport.push({
          fila: row.rowNumber,
          codigo_interno: row.codigo_interno,
          estado: "error",
          observacion: `No se pudo crear subcategoria: ${subRes.error}`,
        });
        continue;
      }
      const marcaRes = await ensureMarca(row.marca, catalog);
      if (!marcaRes.data) {
        currentSummary.errores += 1;
        currentReport.push({
          fila: row.rowNumber,
          codigo_interno: row.codigo_interno,
          estado: "error",
          observacion: `No se pudo crear marca: ${marcaRes.error}`,
        });
        continue;
      }
      await ensurePresentacion(row.presentacion);

      const categoria = catRes.data;
      const subcategoria = subRes.data;
      const marca = marcaRes.data;

      // 2) Buscar existente
      const naturalKey = buildNaturalKey(
        categoria.id,
        subcategoria.id,
        marca.id,
        row.nombre_producto,
        row.presentacion,
      );
      const existingProduct =
        (row.codigo_interno
          ? existing.productsByCode.get(normalizeKey(row.codigo_interno))
          : undefined) ?? existing.productsByNaturalKey.get(naturalKey);

      // 3) Calcular stock final por almacen
      const presFactor =
        row.pres_compra_unidades && row.pres_compra_unidades > 0
          ? row.pres_compra_unidades
          : 0;
      const stockTiendaFinal = row.stock_tienda + row.stock_tienda_pres * presFactor;
      const stockCasaFinal = row.stock_casa + row.stock_casa_pres * presFactor;

      // 4) Upsert producto
      let productoId: string;
      let estado: "creado" | "actualizado";

      const payload = {
        categoria_id: categoria.id,
        subcategoria_id: subcategoria.id,
        marca_id: marca.id,
        nombre_producto: row.nombre_producto,
        presentacion: row.presentacion,
        unidad_base: row.unidad_base ?? "und",
        stock_minimo: row.stock_minimo,
        precio_venta: row.precio_venta,
        precio_compra_referencial: row.precio_compra,
        imagen_url: row.imagen_url,
        activo: row.activo,
      };

      if (existingProduct) {
        const { error } = await supabase
          .from("productos")
          .update({
            ...payload,
            // Conservar precio_compra previo si CSV no lo trae.
            precio_compra_referencial:
              row.precio_compra !== null
                ? row.precio_compra
                : existingProduct.precio_compra_referencial,
            stock_minimo: row.stock_minimo_explicit
              ? row.stock_minimo
              : (existingProduct.stock_minimo ?? 10),
          })
          .eq("id", existingProduct.id);
        if (error) {
          currentSummary.errores += 1;
          currentReport.push({
            fila: row.rowNumber,
            codigo_interno: row.codigo_interno || existingProduct.codigo_interno,
            estado: "error",
            observacion: `No se pudo actualizar: ${error.message}`,
          });
          continue;
        }
        productoId = existingProduct.id;
        estado = "actualizado";
      } else {
        const { data: insertedProduct, error } = await supabase
          .from("productos")
          .insert({
            ...payload,
            codigo_interno: row.codigo_interno || null,
          })
          .select("id,codigo_interno")
          .single();
        if (error) {
          if (error.code === "23505") {
            currentSummary.omitidos += 1;
            currentReport.push({
              fila: row.rowNumber,
              codigo_interno: row.codigo_interno || "Autogenerado",
              estado: "omitido",
              observacion: "Codigo duplicado, se omite.",
            });
            continue;
          }
          currentSummary.errores += 1;
          currentReport.push({
            fila: row.rowNumber,
            codigo_interno: row.codigo_interno || "Autogenerado",
            estado: "error",
            observacion: `No se pudo crear: ${error.message}`,
          });
          continue;
        }
        productoId = (insertedProduct as { id: string; codigo_interno: string }).id;
        const insertedCode = (insertedProduct as { codigo_interno: string }).codigo_interno;

        existing.productsByCode.set(normalizeKey(insertedCode), {
          ...payload,
          id: productoId,
          codigo_interno: insertedCode,
        } as ExistingProductLite);
        existing.productsByNaturalKey.set(naturalKey, {
          ...payload,
          id: productoId,
          codigo_interno: insertedCode,
        } as ExistingProductLite);
        estado = "creado";
      }

      // 5) Stock por almacen (siempre que haya algo cargado o el CSV lo
      //    explicitara como 0).
      if (row.stock_tienda_explicit) {
        const r = await upsertStock(productoId, tienda.id, stockTiendaFinal);
        if (r.error) {
          currentSummary.errores += 1;
          currentReport.push({
            fila: row.rowNumber,
            codigo_interno: row.codigo_interno,
            estado: "error",
            observacion: `${estado} pero fallo stock Tienda: ${r.error.message}`,
          });
          continue;
        }
      }
      if (row.stock_casa_explicit) {
        if (!casa) {
          currentReport.push({
            fila: row.rowNumber,
            codigo_interno: row.codigo_interno,
            estado: estado,
            observacion: `${estado} pero no existe almacen Casa, se omitio stock_casa.`,
          });
        } else {
          const r = await upsertStock(productoId, casa.id, stockCasaFinal);
          if (r.error) {
            currentSummary.errores += 1;
            currentReport.push({
              fila: row.rowNumber,
              codigo_interno: row.codigo_interno,
              estado: "error",
              observacion: `${estado} pero fallo stock Casa: ${r.error.message}`,
            });
            continue;
          }
        }
      }

      // 6) Presentacion de compra
      const presCreada = await upsertPresentacionCompra(productoId, row);
      if (presCreada) currentSummary.presentaciones_creadas += 1;

      // 7) Lote opcional
      const loteCreado = await maybeCreateLote(
        productoId,
        row,
        tienda.id,
        casa?.id ?? null,
        stockTiendaFinal,
        stockCasaFinal,
      );
      if (loteCreado) currentSummary.lotes_creados += 1;

      // Cierre
      if (estado === "creado") currentSummary.creados += 1;
      else currentSummary.actualizados += 1;
      currentReport.push({
        fila: row.rowNumber,
        codigo_interno: row.codigo_interno,
        estado,
        observacion: [
          `${estado} OK`,
          row.stock_tienda_explicit ? `Tienda=${stockTiendaFinal}` : null,
          row.stock_casa_explicit ? `Casa=${stockCasaFinal}` : null,
          presCreada ? "+ presentacion compra" : null,
          loteCreado ? "+ lote" : null,
          ...row.observations,
        ]
          .filter(Boolean)
          .join("; "),
      });
    }

    setReport(currentReport);
    setSummary(currentSummary);
    setMessage("Importacion finalizada.");
    setIsProcessing(false);
  }

  async function handleCopyReport() {
    if (!reportText) return;
    await navigator.clipboard.writeText(reportText);
    setMessage("Reporte copiado al portapapeles.");
  }

  function handleDownloadReport() {
    if (!reportText) return;
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
              Descarga la plantilla, llenala en Excel/Sheets, exportala como
              CSV (UTF-8) y subila aqui. Soporta separador coma o punto y coma.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadPlantilla}
              className="inline-flex h-10 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Descargar plantilla
            </button>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Seleccionar CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* Columnas: toggle para ver definicion completa */}
        <button
          type="button"
          onClick={() => setShowColumns((s) => !s)}
          className="mt-4 text-sm font-medium text-emerald-700 hover:underline"
        >
          {showColumns ? "Ocultar" : "Ver"} columnas soportadas ({HEADER_DEFS.length})
        </button>
        {showColumns ? (
          <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Columna</th>
                  <th className="px-3 py-2">Obligatoria</th>
                  <th className="px-3 py-2">Descripcion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {HEADER_DEFS.map((h) => (
                  <tr key={h.name}>
                    <td className="px-3 py-2 font-mono font-medium">
                      {h.name}
                      {h.aliases ? (
                        <span className="ml-1 text-slate-400">
                          (alias: {h.aliases.join(", ")})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {h.required ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          si
                        </span>
                      ) : (
                        <span className="text-slate-400">opcional</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{h.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {message ? (
          <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {message}
          </p>
        ) : null}

        {unknownHeaders.length > 0 ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Columnas no reconocidas (se ignoran):{" "}
            <span className="font-mono">{unknownHeaders.join(", ")}</span>
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Filas cargadas" value={rows.length} />
          <Stat label="Filas con errores" value={invalidRows} />
          <Stat label="Columnas detectadas" value={rawHeaders.length} />
        </div>

        {isProcessing ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Importando fila {processedRows} de {rows.length}. Este proceso puede
            tardar varios minutos si el archivo tiene muchos productos.
          </div>
        ) : null}
      </section>

      {rows.length > 0 ? (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Previsualizacion</h2>
              <p className="mt-1 text-sm text-slate-600">
                Se muestran las primeras 25 filas. Resolve los errores en el
                CSV antes de importar.
              </p>
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport}
              className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              title={!canImport && invalidRows > 0 ? "Hay filas con errores" : ""}
            >
              {isProcessing ? "Importando..." : "Guardar productos"}
            </button>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Fila</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Cat / Subcat / Marca</th>
                  <th className="px-3 py-2">Pres</th>
                  <th className="px-3 py-2">P. compra</th>
                  <th className="px-3 py-2">P. venta</th>
                  <th className="px-3 py-2">Tienda</th>
                  <th className="px-3 py-2">Casa</th>
                  <th className="px-3 py-2">Pres compra</th>
                  <th className="px-3 py-2">Vto</th>
                  <th className="px-3 py-2">Errores / obs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.map((row) => {
                  const presFactor =
                    row.pres_compra_unidades && row.pres_compra_unidades > 0
                      ? row.pres_compra_unidades
                      : 0;
                  const tFinal = row.stock_tienda + row.stock_tienda_pres * presFactor;
                  const cFinal = row.stock_casa + row.stock_casa_pres * presFactor;
                  const hasErr = row.errors.length > 0;
                  return (
                    <tr
                      key={row.rowNumber}
                      className={hasErr ? "bg-red-50/60" : undefined}
                    >
                      <td className="px-3 py-2 text-xs text-slate-500">{row.rowNumber}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{row.nombre_producto || "—"}</p>
                        <p className="text-xs text-slate-500">
                          {row.codigo_interno || "auto"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.categoria} / {row.subcategoria}
                        <p className="text-slate-500">{row.marca}</p>
                      </td>
                      <td className="px-3 py-2 text-xs">{row.presentacion}</td>
                      <td className="px-3 py-2 text-xs">
                        {row.precio_compra !== null ? row.precio_compra.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">
                        {row.precio_venta.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.stock_tienda_explicit ? (
                          <>
                            <span className="font-semibold">{tFinal}</span>
                            {row.stock_tienda_pres > 0 ? (
                              <span className="block text-[10px] text-slate-500">
                                ({row.stock_tienda}+{row.stock_tienda_pres}x{presFactor})
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.stock_casa_explicit ? (
                          <>
                            <span className="font-semibold">{cFinal}</span>
                            {row.stock_casa_pres > 0 ? (
                              <span className="block text-[10px] text-slate-500">
                                ({row.stock_casa}+{row.stock_casa_pres}x{presFactor})
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.pres_compra_nombre ? (
                          <>
                            {row.pres_compra_nombre}
                            <span className="block text-[10px] text-slate-500">
                              x{row.pres_compra_unidades}
                              {row.pres_compra_costo_total
                                ? ` · S/${row.pres_compra_costo_total.toFixed(2)}`
                                : ""}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.lote_fecha_vto ? (
                          <>
                            {row.lote_fecha_vto}
                            <span className="block text-[10px] text-slate-500">
                              ({row.lote_almacen})
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {hasErr ? (
                          <span className="text-red-700">{row.errors.join("; ")}</span>
                        ) : (
                          <span className="text-emerald-700">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {summary ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Resumen final</h2>
              <p className="mt-1 text-sm text-slate-600">
                El stock se reemplaza con el valor del CSV (no se suma). Para
                ingresos posteriores usa &quot;Compras a proveedor&quot; o
                &quot;Agregar stock&quot;.
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

          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Creados" value={summary.creados} />
            <Stat label="Actualizados" value={summary.actualizados} />
            <Stat label="Omitidos" value={summary.omitidos} />
            <Stat label="Errores" value={summary.errores} />
            <Stat label="Pres. compra" value={summary.presentaciones_creadas} />
            <Stat label="Lotes" value={summary.lotes_creados} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
