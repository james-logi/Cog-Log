import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";

// node:sqlite(Node 22.5+ 내장)를 사용한다. better-sqlite3 등 네이티브 애드온은
// Windows 산업용 PC 배포 시 Visual Studio Build Tools 없이는 설치가 실패하므로
// 피한다(스펙 1.3 배포 가정).
let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    db = new DatabaseSync(config.dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
  }
  return db;
}
