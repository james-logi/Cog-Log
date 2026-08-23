import fs from "node:fs";
import path from "node:path";
import { isSea, getAsset, getAssetKeys } from "node:sea";
import { getDb } from "./connection.js";
import { moduleDirname } from "../lib/moduleDir.js";

const MIGRATIONS_DIR = path.join(moduleDirname(import.meta.url), "migrations");
const MIGRATION_KEY_PREFIX = "migrations/";

interface MigrationSource {
  name: string;
  sql: string;
}

// 단일 .exe로 패키징된 경우 마이그레이션 .sql 파일은 디스크에 없고 SEA
// 자산으로 실행 파일 안에 내장돼 있다(scripts/package-exe.mjs 참고).
function loadMigrations(): MigrationSource[] {
  if (isSea()) {
    return getAssetKeys()
      .filter((key) => key.startsWith(MIGRATION_KEY_PREFIX) && key.endsWith(".sql"))
      .map((key) => ({
        name: key.slice(MIGRATION_KEY_PREFIX.length),
        sql: getAsset(key, "utf8") as string,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf-8") }));
}

export function runMigrations(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (db.prepare("SELECT name FROM schema_migrations").all() as Array<{ name: string }>).map((row) => row.name)
  );

  for (const migration of loadMigrations()) {
    if (applied.has(migration.name)) continue;
    console.log(`Applying migration: ${migration.name}`);
    db.exec(migration.sql);
    db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(migration.name);
  }

  console.log("Migrations up to date.");
}
