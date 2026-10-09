// Recreates the RLS test database: Supabase stub + every migration, in order.
// Usage: TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres node scripts/db-test-reset.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const adminUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl) {
  console.error("Set TEST_DATABASE_URL to a disposable PostgreSQL server (never a Supabase project).");
  process.exit(1);
}
const dbName = process.env.TEST_DATABASE_NAME ?? "guromart_test";
const root = path.resolve(import.meta.dirname, "..");

const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
await admin.query(`drop database if exists ${dbName} with (force)`);
await admin.query(`create database ${dbName}`);
await admin.end();

const url = new URL(adminUrl);
url.pathname = `/${dbName}`;
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
await db.query(await readFile(path.join(root, "supabase/tests/supabase-stub.sql"), "utf8"));
const dir = path.join(root, "supabase/migrations");
for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
  try {
    await db.query(await readFile(path.join(dir, file), "utf8"));
  } catch (error) {
    console.error(`Migration ${file} failed`);
    throw error;
  }
}
await db.end();
console.log(`Test database ${dbName} is ready.`);
