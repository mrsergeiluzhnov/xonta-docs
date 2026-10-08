// Статистика по журналу. На сервере: docker compose exec docs node src/stats.js [дней=14]
import { readFileSync, existsSync } from "node:fs";

const FILE = process.env.LOG_FILE || "/data/logs/calls.jsonl";
const DAYS = Number(process.argv[2] || 14);
if (!existsSync(FILE)) { console.log(`Журнала пока нет (${FILE}).`); process.exit(0); }

const since = new Date(Date.now() - DAYS * 86400000).toISOString();
const rows = readFileSync(FILE, "utf8").split("\n").filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.ts >= since);

// Свои проверки и роботы-сканеры, чтобы отделить их от настоящих пользователей
const OWN = /^curl\//i; // наши проверки с сервера и Mac идут через curl; агенты на Node и Python — не «свои»
const BOT = /bot|probe|crawler|spider|scan|monitor|uptime|check|preview|httpx|go-http|axios|headless/i;
const who = (r) => (OWN.test(r.ua || "") ? "свои" : BOT.test(r.ua || "") || BOT.test(r.client || "") ? "роботы" : "остальные");
const count = (arr, key) => { const m = new Map(); for (const x of arr) { const k = key(x); m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
const pad = (n) => String(n).padStart(5);

const calls = rows.filter((r) => r.tool), connects = rows.filter((r) => r.event === "connect"), lists = rows.filter((r) => r.event === "list"), pages = rows.filter((r) => r.event === "page");
console.log(`Период: ${DAYS} дн.\n`);
console.log(`Подключения MCP: ${connects.length}   запросы списка инструментов: ${lists.length}   вызовы инструментов: ${calls.length}   просмотры страниц: ${pages.length}\n`);

console.log("Кто подключался (клиент MCP):");
for (const [k, n] of count(connects, (r) => `${r.client}  [${who(r)}]`)) console.log(`${pad(n)}  ${k}`);
console.log("\nВызовы инструментов по группам:");
for (const [k, n] of count(calls, who)) console.log(`${pad(n)}  ${k}`);
console.log("\nВызовы инструментов (без своих):");
for (const [k, n] of count(calls.filter((r) => who(r) !== "свои"), (r) => `${r.tool}${r.ok ? "" : " (ошибка)"}`)) console.log(`${pad(n)}  ${k}`);
console.log("\nПо дням (без своих): подключения / вызовы / уникальные адреса");
const days = new Map();
for (const r of rows.filter((r) => who(r) !== "свои" && (r.tool || r.event === "connect"))) {
  const d = r.ts.slice(0, 10); const e = days.get(d) || { c: 0, t: 0, ip: new Set() };
  if (r.tool) e.t++; else e.c++; e.ip.add(r.ip); days.set(d, e);
}
for (const [d, e] of [...days].sort()) console.log(`  ${d}  ${pad(e.c)} / ${pad(e.t)} / ${pad(e.ip.size)}`);
console.log("\nПрограммы (User-Agent), все события:");
for (const [k, n] of count(rows, (r) => `${(r.ua || "—").split(/[\s/;(]/)[0]}  [${who(r)}]`).slice(0, 15)) console.log(`${pad(n)}  ${k}`);
