// Журнал вызовов: одна JSON-строка на вызов в stdout и в файл (LOG_FILE), который переживает пересборку контейнера.
// IP не хранится — только короткий хэш, чтобы считать уникальных пользователей.
import { appendFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const LOG_FILE = process.env.LOG_FILE || "";
const SALT = process.env.LOG_SALT || "xonta-docs";
let dirReady;

export const ipHash = (ip) => createHash("sha256").update(SALT + (ip || "")).digest("hex").slice(0, 12);

export async function logCall(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  console.log(line);
  if (!LOG_FILE) return;
  try {
    dirReady ??= mkdir(path.dirname(LOG_FILE), { recursive: true });
    await dirReady;
    await appendFile(LOG_FILE, line + "\n");
  } catch (e) {
    console.error("log write failed:", e.message);
  }
}
