import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const migrationPath = process.argv[2];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!migrationPath) {
  console.error("Migration path is required.");
  process.exit(1);
}

const resolvedMigrationPath = path.resolve(process.cwd(), migrationPath);
const sql = fs.readFileSync(resolvedMigrationPath, "utf8");

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log("MIGRATION_OK");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
