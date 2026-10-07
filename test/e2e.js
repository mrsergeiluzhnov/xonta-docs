// Сквозная проверка: поднимаем сервер, ходим по REST и через настоящий MCP-клиент, проверяем лимиты и журнал.
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = 4398, BASE = `http://localhost:${PORT}`, LOG = "/tmp/xonta-docs-e2e.jsonl";
rmSync(LOG, { force: true });
const svc = spawn("node", ["src/server.js"], { env: { ...process.env, PORT: String(PORT), FREE_DAILY_PER_IP: "12", RATE_PER_MIN: "100", LOG_FILE: LOG }, stdio: ["ignore", "pipe", "inherit"] });
let out = "";
svc.stdout.on("data", (d) => (out += d));
for (let i = 0; i < 50 && !out.includes(" on :"); i++) await new Promise((r) => setTimeout(r, 200));

let ok = true;
const check = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); ok &&= !!c; };
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

try {
  const home = await fetch(BASE + "/");
  check(home.status === 200 && (await home.text()).includes("Склонение ФИО"), "главная страница HTML");
  const info = await (await fetch(BASE + "/", { headers: { accept: "application/json" } })).json();
  check(info.tools.length === 4 && info.mcp.url.endsWith("/mcp"), "JSON-описание сервиса");
  check((await (await fetch(BASE + "/llms.txt")).text()).includes("Склонение ФИО"), "llms.txt");
  const oa = await (await fetch(BASE + "/openapi.json")).json();
  check(Object.keys(oa.paths).length === 4, "openapi.json");

  const r1 = await (await post("/v1/text/amount-in-words", { amount: "1234.56", vat_rate: 22 })).json();
  check(r1.vat?.line?.includes("НДС (22%)"), "REST сумма прописью");
  const bad = await post("/v1/requisites/validate", {});
  check(bad.status === 400, `REST ошибка ввода → ${bad.status}`);

  const client = new Client({ name: "e2e", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(BASE + "/mcp")));
  const { tools } = await client.listTools();
  check(tools.length === 4, `MCP: ${tools.length} инструмента в списке`);
  const d = await client.callTool({ name: "decline_name", arguments: { full_name: "Иванов Иван Петрович", position: "генеральный директор" } });
  check(JSON.parse(d.content[0].text).position_and_name === "генерального директора Иванова Ивана Петровича", "MCP склонение");
  const w = await client.callTool({ name: "working_days", arguments: { date: "2026-12-25", add_working_days: "5" } });
  check(JSON.parse(w.content[0].text).result_date === "2027-01-12", "MCP рабочие дни (число строкой)");
  const v = await client.callTool({ name: "validate_requisites", arguments: { inn: 7707083893 } });
  check(JSON.parse(v.content[0].text).all_valid === true, "MCP реквизиты (ИНН числом)");
  const e = await client.callTool({ name: "amount_in_words", arguments: { amount: "abc" } });
  check(e.isError === true, "MCP ошибка возвращается как isError");

  // лимит 12 в сутки: уже сделано 6 вызовов инструментов (включая ошибочные)
  let last;
  for (let i = 0; i < 8; i++) last = await post("/v1/text/amount-in-words", { amount: "1" });
  check(last.status === 429, `суточный лимит → ${last.status}`);
  await client.close();

  await new Promise((r) => setTimeout(r, 300));
  const lines = readFileSync(LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  check(lines.length >= 12 && lines.some((l) => l.channel === "mcp" && l.ok) && lines.every((l) => /^[0-9a-f]{12}$/.test(l.ip)), `журнал: ${lines.length} строк, IP захэширован`);
} catch (err) {
  ok = false;
  console.error(err);
} finally {
  svc.kill();
  console.log(ok ? "\nALL PASSED" : "\nSOME CHECKS FAILED\n" + out);
  process.exit(ok ? 0 : 1);
}
