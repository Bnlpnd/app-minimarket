import pg from "pg";

const { Client } = pg;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseKey || !databaseUrl) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and DATABASE_URL are required.",
  );
  process.exit(1);
}

const headers = {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function post(table, body) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();

  return {
    body: text ? JSON.parse(text) : null,
    ok: response.ok,
    status: response.status,
  };
}

async function main() {
  const stamp = Date.now();
  const catName = `Cat Codex ${stamp}`;
  const subName = `Sub Codex ${stamp}`;
  const brandName = `Marca Codex ${stamp}`;

  const categoria = await post("categorias", { nombre: catName });
  if (!categoria.ok) {
    throw new Error(`categoria: ${JSON.stringify(categoria)}`);
  }

  const duplicada = await post("categorias", {
    nombre: ` Cat   Codex   ${stamp} `,
  });

  const subcategoria = await post("subcategorias", {
    categoria_id: categoria.body[0].id,
    nombre: subName,
  });
  if (!subcategoria.ok) {
    throw new Error(`subcategoria: ${JSON.stringify(subcategoria)}`);
  }

  const marca = await post("marcas", { nombre: brandName });
  if (!marca.ok) {
    throw new Error(`marca: ${JSON.stringify(marca)}`);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query("delete from public.subcategorias where id = $1", [
      subcategoria.body[0].id,
    ]);
    await client.query("delete from public.marcas where id = $1", [
      marca.body[0].id,
    ]);
    await client.query("delete from public.categorias where id = $1", [
      categoria.body[0].id,
    ]);
  } finally {
    await client.end();
  }

  console.log(
    JSON.stringify(
      {
        categoriaCreada: categoria.body[0].nombre,
        duplicadoBloqueado: !duplicada.ok,
        estadoDuplicado: duplicada.status,
        subcategoriaCreada: subcategoria.body[0].nombre,
        marcaCreada: marca.body[0].nombre,
        datosPruebaEliminados: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
