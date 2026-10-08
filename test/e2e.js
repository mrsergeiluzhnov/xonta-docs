// Сквозная проверка: поднимаем сервер, ходим по REST и через настоящий MCP-клиент, проверяем лимиты и журнал.
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = 4398, BASE = `http://localhost:${PORT}`, LOG = "/tmp/xonta-docs-e2e.jsonl";
rmSync(LOG, { force: true });
const svc = spawn("node", ["src/server.js"], { env: { ...process.env, PORT: String(PORT), FREE_DAILY_PER_IP: "40", FILES_DIR: "/tmp/xonta-docs-e2e-files", PUBLIC_URL: BASE, RATE_PER_MIN: "100", LOG_FILE: LOG }, stdio: ["ignore", "pipe", "inherit"] });
let out = "";
svc.stdout.on("data", (d) => (out += d));
for (let i = 0; i < 50 && !out.includes(" on :"); i++) await new Promise((r) => setTimeout(r, 200));

let ok = true;
const check = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); ok &&= !!c; };
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

try {
  const home = await fetch(BASE + "/");
  check(home.status === 200 && (await home.text()).includes("Склонение ФИО"), "главная страница HTML");
  const br = await fetch(BASE + "/mcp", { headers: { accept: "text/html,application/xhtml+xml" }, redirect: "manual" });
  check(br.status === 302 && br.headers.get("location").startsWith("/"), "браузер на /mcp → переход на главную");
  const sse = await fetch(BASE + "/mcp", { headers: { accept: "text/event-stream" } });
  check(sse.status === 405, "MCP-клиент GET /mcp → 405 по стандарту");
  const info = await (await fetch(BASE + "/", { headers: { accept: "application/json" } })).json();
  check(info.tools.length === 11 && info.mcp.url.endsWith("/mcp"), "JSON-описание сервиса");
  check((await (await fetch(BASE + "/llms.txt")).text()).includes("Склонение ФИО"), "llms.txt");
  const robots = await (await fetch(BASE + "/robots.txt")).text();
  check(robots.includes("Disallow: /mcp") && robots.includes("Sitemap: " + BASE + "/sitemap.xml"), "robots.txt");
  const sm = await (await fetch(BASE + "/sitemap.xml")).text();
  check((sm.match(/<loc>/g) || []).length === 13 && sm.includes("/tools/proverka-kartochki-lekarstv-bad-medizdeliy"), "sitemap.xml: главная, 11 страниц инструментов, llms.txt");
  const tp = await fetch(BASE + "/tools/schet-na-oplatu-pdf");
  const tpHtml = await tp.text();
  check(tp.status === 200 && tpHtml.includes('rel="canonical"') && tpHtml.includes("FAQPage") && tpHtml.includes("make_invoice"), "страница инструмента: canonical, разметка FAQ");
  check((await fetch(BASE + "/tools/net-takoy")).status === 404, "несуществующая страница инструмента → 404");
  const og = await fetch(BASE + "/og.png");
  check(og.status === 200 && og.headers.get("content-type") === "image/png", "картинка для соцсетей /og.png");
  const oa = await (await fetch(BASE + "/openapi.json")).json();
  check(Object.keys(oa.paths).length === 11, "openapi.json");

  const r1 = await (await post("/v1/text/amount-in-words", { amount: "1234.56", vat_rate: 22 })).json();
  check(r1.vat?.line?.includes("НДС (22%)"), "REST сумма прописью");
  const bad = await post("/v1/requisites/validate", {});
  check(bad.status === 400, `REST ошибка ввода → ${bad.status}`);

  const client = new Client({ name: "e2e", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(BASE + "/mcp")));
  const { tools } = await client.listTools();
  check(tools.length === 11, `MCP: ${tools.length} инструментов в списке`);
  const invTool = tools.find((t) => t.name === "make_invoice");
  check(invTool.inputSchema.properties.seller.type === "object" && invTool.inputSchema.properties.items.type === "array", "MCP: вложенная схема счёта (seller — объект, items — массив)");
  const ex = info.tools.find((t) => t.name === "make_invoice").example;
  const inv = await client.callTool({ name: "make_invoice", arguments: { ...ex, format: "both" } });
  const invRes = JSON.parse(inv.content[0].text);
  check(invRes.files?.length === 2 && invRes.payment_due === "2026-10-14", "MCP: счёт сформирован (PDF + DOCX, срок оплаты)");
  const dl = await fetch(invRes.files[0].url);
  const buf = Buffer.from(await dl.arrayBuffer());
  check(dl.status === 200 && buf.subarray(0, 5).toString() === "%PDF-" && /filename\*=UTF-8''schet-15/.test(dl.headers.get("content-disposition")), "скачивание PDF по ссылке");
  check((await fetch(BASE + "/files/000000000000000000000000/x.pdf")).status === 404, "несуществующий файл → 404");
  const parsed = await client.callTool({ name: "parse_document", arguments: { base64: buf.toString("base64"), filename: "schet.pdf" } });
  const pr = JSON.parse(parsed.content[0].text);
  check(pr.type === "invoice" && pr.seller?.inn === "7707083893" && pr.totals?.total === "165000.00" && pr.issues.length === 0, "MCP: распознавание скачанного счёта (base64 через MCP)");
  const fw = await client.callTool({ name: "check_foreign_words", arguments: { text: "Big SALE и кэшбэк" } });
  check(JSON.parse(fw.content[0].text).summary.latin === 1, "MCP: проверка иностранных слов");
  const badInv = await client.callTool({ name: "make_invoice", arguments: { ...ex, seller: { ...ex.seller, bik: "044525226" } } });
  check(badInv.isError === true && badInv.content[0].text.includes("seller."), "MCP: счёт с неверными реквизитами не формируется");
  const d = await client.callTool({ name: "decline_name", arguments: { full_name: "Иванов Иван Петрович", position: "генеральный директор" } });
  check(JSON.parse(d.content[0].text).position_and_name === "генерального директора Иванова Ивана Петровича", "MCP склонение");
  const w = await client.callTool({ name: "working_days", arguments: { date: "2026-12-25", add_working_days: "5" } });
  check(JSON.parse(w.content[0].text).result_date === "2027-01-12", "MCP рабочие дни (число строкой)");
  const v = await client.callTool({ name: "validate_requisites", arguments: { inn: 7707083893 } });
  check(JSON.parse(v.content[0].text).all_valid === true, "MCP реквизиты (ИНН числом)");
  const e = await client.callTool({ name: "amount_in_words", arguments: { amount: "abc" } });
  check(e.isError === true, "MCP ошибка возвращается как isError");

  // лимит 40 в сутки: документы весят по 5, распознавание 3
  let last;
  for (let i = 0; i < 30; i++) last = await post("/v1/text/amount-in-words", { amount: "1" });
  check(last.status === 429, `суточный лимит → ${last.status}`);
  await client.close();

  await new Promise((r) => setTimeout(r, 300));
  const lines = readFileSync(LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  check(lines.some((l) => l.event === "page" && l.page === "/tools/schet-na-oplatu-pdf"), "журнал: просмотр страницы инструмента записан");
  check(lines.length >= 12 && lines.some((l) => l.channel === "mcp" && l.ok) && lines.every((l) => /^[0-9a-f]{12}$/.test(l.ip)), `журнал: ${lines.length} строк, IP захэширован`);
} catch (err) {
  ok = false;
  console.error(err);
} finally {
  svc.kill();
  console.log(ok ? "\nALL PASSED" : "\nSOME CHECKS FAILED\n" + out);
  process.exit(ok ? 0 : 1);
}
