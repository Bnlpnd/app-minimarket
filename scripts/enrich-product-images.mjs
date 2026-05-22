import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const MAX_IMAGE_SIZE = 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const USER_AGENT =
  "app-minimarket/1.0 product-image-enrichment; contact=local";
const PLAZA_VEA_SEARCH =
  "https://www.plazavea.com.pe/api/catalog_system/pub/products/search";

const STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "para",
  "con",
  "sin",
  "por",
  "x",
  "un",
  "und",
  "unidad",
  "unidades",
  "botella",
  "frasco",
  "bolsa",
  "paquete",
  "doypack",
  "sachet",
  "lata",
  "caja",
  "bidon",
  "barril",
  "pack",
  "display",
  "producto",
]);

function parseArgs() {
  const args = new Map();
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, value = "true"] = arg.slice(2).split("=");
    args.set(key, value);
  }
  return args;
}

async function readEnvFile() {
  const envPath = path.join(process.cwd(), ".env.local");
  const text = await fs.readFile(envPath, "utf8");
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = line.slice(0, index);
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }

  return env;
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " ")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value) {
  return normalize(value)
    .split(" ")
    .filter(Boolean);
}

function importantTokens(product) {
  const brandTokens = new Set(tokens(product.marca));
  return tokens(`${product.nombre_producto} ${product.presentacion ?? ""}`)
    .filter((token) => token.length > 1)
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => !brandTokens.has(token));
}

function quantityTokens(product) {
  return tokens(`${product.nombre_producto} ${product.presentacion ?? ""}`).filter(
    (token) =>
      /^\d+([.,]\d+)?$/.test(token) ||
      ["ml", "l", "lt", "g", "gr", "kg", "cm", "m", "oz"].includes(token),
  );
}

function numericTokens(product) {
  return [
    ...new Set(
      tokens(`${product.nombre_producto} ${product.presentacion ?? ""}`).filter(
        (token) => /^\d+$/.test(token),
      ),
    ),
  ];
}

function brandMatches(product, candidateText) {
  const brand = normalize(product.marca);
  if (!brand || ["generico", "sin marca", "general"].includes(brand)) {
    return true;
  }

  return candidateText.includes(brand);
}

function scoreCandidate(product, candidate) {
  const candidateText = normalize(
    `${candidate.productName ?? ""} ${candidate.brand ?? ""}`,
  );
  const candidateTokens = new Set(tokens(candidateText));
  const brandMatch = brandMatches(product, candidateText);
  const nameTokens = importantTokens(product);
  const qtyTokens = quantityTokens(product);
  const numbers = numericTokens(product);
  const numberMatch = numbers.every((token) => candidateTokens.has(token));

  let score = 0;

  if (brandMatch) {
    score += 42;
  } else if (normalize(product.marca) !== "generico") {
    score -= 40;
  }

  if (nameTokens.length > 0) {
    const matched = nameTokens.filter((token) => candidateTokens.has(token)).length;
    score += Math.round((matched / nameTokens.length) * 35);
  }

  if (qtyTokens.length > 0) {
    const matched = qtyTokens.filter((token) => candidateTokens.has(token)).length;
    score += Math.round((matched / qtyTokens.length) * 28);
  }

  if (candidate.imageUrl) {
    score += 5;
  }

  return {
    score,
    brandMatch,
    numberMatch,
    matchedNameTokens: nameTokens.filter((token) => candidateTokens.has(token)),
    requiredNameTokens: nameTokens,
    quantityTokens: qtyTokens,
    numberTokens: numbers,
  };
}

function buildSearchTerms(product) {
  const marca = normalize(product.marca);
  const name = product.nombre_producto ?? "";
  const terms = [name];

  if (marca && !normalize(name).includes(marca) && marca !== "generico") {
    terms.unshift(`${product.marca} ${name}`);
  }

  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}

async function searchPlazaVea(product) {
  const terms = buildSearchTerms(product);

  for (const term of terms) {
    const url = `${PLAZA_VEA_SEARCH}?ft=${encodeURIComponent(
      term,
    )}&_from=0&_to=9`;

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      continue;
    }

    const data = await response.json();
    const items = Array.isArray(data) ? data : [];
    const candidates = data
      ? items
      .map((item) => ({
        source: "plazavea",
        productName: item.productName ?? "",
        brand: item.brand ?? "",
        productUrl: item.link ?? "",
        imageUrl: item.items?.[0]?.images?.[0]?.imageUrl ?? "",
      }))
      .filter((item) => item.imageUrl)
      : [];

    if (candidates.length === 0) {
      continue;
    }

    const ranked = candidates
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(product, candidate),
      }))
      .sort((a, b) => b.score.score - a.score.score);

    const best = ranked[0];
    if (
      best &&
      best.score.score >= 70 &&
      best.score.brandMatch &&
      best.score.numberMatch
    ) {
      return best;
    }
  }

  return null;
}

async function downloadImage(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`download ${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error(`invalid_mime:${contentType || "unknown"}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`too_large:${buffer.length}`);
  }

  return {
    buffer,
    contentType,
    extension: ALLOWED_TYPES.get(contentType),
    size: buffer.length,
  };
}

function safeFileName(value) {
  return normalize(value)
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}

async function uploadToSupabase(env, product, image) {
  const fileName = `${safeFileName(product.codigo_interno)}-${Date.now()}.${
    image.extension
  }`;
  const objectPath = `imagenes-web/${fileName}`;
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/productos/${objectPath}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      "Content-Type": image.contentType,
      "x-upsert": "true",
    },
    body: image.buffer,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`upload ${response.status}: ${text}`);
  }

  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/productos/${objectPath}`;
}

async function main() {
  const args = parseArgs();
  const limit = Number(args.get("limit") ?? 0);
  const offset = Number(args.get("offset") ?? 0);
  const dryRun = args.get("dry-run") === "true";
  const env = await readEnvFile();
  const dbUrl = process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    throw new Error("Falta SUPABASE_DB_URL para leer y actualizar productos.");
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Faltan variables NEXT_PUBLIC_SUPABASE_* en .env.local.");
  }

  await fs.mkdir("reports", { recursive: true });

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const productsResult = await client.query(
    `
      select
        p.id,
        p.codigo_interno,
        p.nombre_producto,
        p.presentacion,
        p.imagen_url,
        c.nombre as categoria,
        m.nombre as marca
      from productos p
      left join categorias c on c.id = p.categoria_id
      left join marcas m on m.id = p.marca_id
      where p.activo = true
        and (p.imagen_url is null or btrim(p.imagen_url) = '')
      order by p.nombre_producto, p.codigo_interno
      offset $1
      ${limit > 0 ? "limit $2" : ""}
    `,
    limit > 0 ? [offset, limit] : [offset],
  );

  const products = productsResult.rows;
  const report = {
    startedAt: new Date().toISOString(),
    dryRun,
    maxImageSize: MAX_IMAGE_SIZE,
    totalSelected: products.length,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    rows: [],
  };

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const prefix = `[${index + 1}/${products.length}] ${product.codigo_interno}`;

    try {
      const match = await searchPlazaVea(product);
      if (!match) {
        report.skipped += 1;
        report.rows.push({
          status: "no_clear_match",
          codigo_interno: product.codigo_interno,
          nombre_producto: product.nombre_producto,
          marca: product.marca,
        });
        console.log(`${prefix} sin coincidencia clara`);
        continue;
      }

      const image = await downloadImage(match.candidate.imageUrl);
      const publicUrl = dryRun
        ? match.candidate.imageUrl
        : await uploadToSupabase(env, product, image);

      if (!dryRun) {
        await client.query(
          "update productos set imagen_url = $1, updated_at = now() where id = $2",
          [publicUrl, product.id],
        );
      }

      report.uploaded += 1;
      report.rows.push({
        status: dryRun ? "dry_match" : "uploaded",
        codigo_interno: product.codigo_interno,
        nombre_producto: product.nombre_producto,
        marca: product.marca,
        size: image.size,
        mime: image.contentType,
        score: match.score.score,
        source: match.candidate.source,
        source_product_name: match.candidate.productName,
        source_brand: match.candidate.brand,
        source_url: match.candidate.productUrl,
        source_image_url: match.candidate.imageUrl,
        public_url: publicUrl,
      });
      console.log(`${prefix} imagen cargada (${image.size} bytes)`);
    } catch (error) {
      report.failed += 1;
      report.rows.push({
        status: "error",
        codigo_interno: product.codigo_interno,
        nombre_producto: product.nombre_producto,
        marca: product.marca,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`${prefix} error: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 140));
  }

  report.finishedAt = new Date().toISOString();

  const reportPath = path.join(
    "reports",
    `product-image-enrichment-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`,
  );
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await client.end();

  console.log(
    JSON.stringify(
      {
        reportPath,
        uploaded: report.uploaded,
        skipped: report.skipped,
        failed: report.failed,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
