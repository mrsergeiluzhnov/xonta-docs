// Статистика по журналу вызовов. На сервере: docker compose exec docs node src/stats.js [дней=14]
import { readFileSync, existsSync } from "node:fs";

const FILE = process.env.LOG_FILE || "/data/logs/calls.jsonl";
const DAYS = Number(process.argv[2] || 14);
if (!existsSync(FILE)) { console.log(`Журнала пока нет (${FILE}) — вызовов ещё не было.`); process.exit(0); }

const since = new Date(Date.now() - DAYS * 86400000).toISOString();
const rows = readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.ts >= since);

const byDay = new Map(), byTool = new Map(), users = new Set(), uas = new Map();
let ok = 0, limited = 0;
for (const r of rows) {
  const d = r.ts.slice(0, 10);
  const e = byDay.get(d) || { calls: 0, users: new Set() };
  e.calls++; e.users.add(r.ip); byDay.set(d, e);
  byTool.set(`${r.tool} (${r.channel})`, (byTool.get(`${r.tool} (${r.channel})`) || 0) + 1);
  users.add(r.ip);
  if (r.ok) ok++;
  if (r.status === 429) limited++;
  const ua = (r.ua || "—").split(/[\s/]/)[0];
  uas.set(ua, (uas.get(ua) || 0) + 1);
}
console.log(`За ${DAYS} дн.: ${rows.length} вызовов, успешных ${ok}, упёрлись в лимит ${limited}, уникальных адресов ${users.size}\n`);
console.log("По дням:");
for (const [d, e] of [...byDay].sort()) console.log(`  ${d}  вызовов ${String(e.calls).padStart(5)}  адресов ${e.users.size}`);
console.log("\nПо инструментам:");
for (const [k, n] of [...byTool].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log("\nКлиенты (User-Agent):");
for (const [k, n] of [...uas].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(n).padStart(5)}  ${k}`);
