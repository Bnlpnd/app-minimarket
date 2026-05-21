import pg from "pg";

const { Client } = pg;

const expectedTables = [
  "roles",
  "usuarios_perfil",
  "clientes",
  "categorias",
  "subcategorias",
  "marcas",
  "productos",
  "producto_imagenes",
  "pedidos",
  "detalle_pedido",
  "pagos",
  "stock_movimientos",
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const tables = await client.query(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1)
        order by table_name;
      `,
      [expectedTables],
    );

    const roles = await client.query(
      "select nombre from public.roles order by nombre;",
    );

    const trigger = await client.query(
      `
        select tgname
        from pg_trigger
        where tgname = 'descontar_stock_al_en_preparacion';
      `,
    );

    console.log(
      JSON.stringify(
        {
          tables_found: tables.rows.map((row) => row.table_name),
          roles_found: roles.rows.map((row) => row.nombre),
          stock_trigger_found: trigger.rowCount === 1,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
