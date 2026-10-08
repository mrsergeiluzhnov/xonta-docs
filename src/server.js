// Xonta Документы: бесплатные инструменты для ИИ-агентов, которые готовят российские документы.
// REST (POST /v1/...) + MCP (/mcp). Без ключей, с суточным лимитом на адрес.
import express from "express";
import { TOOLS } from "./tools/index.js";
import { initMorph } from "./tools/decline.js";
import { refreshCalendars } from "./tools/calendar.js";
import { mountMcp } from "./mcp.js";
import { takeSlot, quotaInfo } from "./quota.js";
import { logCall, ipHash } from "./log.js";
import { renderHome } from "./home.js";
import { initFiles, mountFiles } from "./files.js";
import { mountSeo } from "./seo.js";
import { readFileSync } from "node:fs";

const env = process.env;
const PORT = Number(env.PORT || 4031);
const PUBLIC_URL = (env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const VERSION = "1.4.0";
const NAME = "Xonta Документы";

export const DESCRIPTION =
  "Инструменты для ИИ-агентов, которые работают с российскими документами и текстами: счёт и акт в PDF и DOCX, распознавание счетов, актов, УПД и договоров, " +
  "проверка реквизитов (ИНН, КПП, ОГРН, БИК, счёт, СНИЛС), сумма прописью с НДС, склонение ФИО и должностей, рабочие дни по производственному календарю, " +
  "подсказки по иностранным словам (закон о русском языке), проверка карточек и рекламы лекарств, медизделий и БАД, типограф и транслитерация. " +
  "Бесплатно, без регистрации и ключей. Tools for AI agents preparing Russian business documents.";

const app = express();
app.set("trust proxy", 1); // ровно один прокси (Caddy) перед сервисом
app.use(express.json({ limit: "15mb" })); // распознавание документов принимает файлы в base64 до 10 МБ
app.use((err, _req, res, next) => (err ? res.status(400).json({ error: "Некорректный JSON" }) : next()));

async function runTool(tool, args, req, channel) {
  const t0 = Date.now();
  const base = { tool: tool.name, channel, ip: ipHash(req.ip), ua: String(req.get("user-agent") || "").slice(0, 80) };
  const slot = takeSlot(req.ip, tool.weight || 1);
  if (!slot.ok) {
    logCall({ ...base, ok: false, status: 429 });
    throw Object.assign(new Error(slot.reason), { status: 429 });
  }
  try {
    const out = await tool.handler(args || {});
    logCall({ ...base, ok: true, ms: Date.now() - t0 });
    return out;
  } catch (e) {
    e.status ||= 422;
    logCall({ ...base, ok: false, status: e.status, error: String(e.message).slice(0, 200), ms: Date.now() - t0 });
    throw e;
  }
}

// ---------- Описание для людей, агентов и каталогов ----------
const info = () => ({
  service: NAME,
  version: VERSION,
  description: DESCRIPTION,
  price: "бесплатно",
  limits: quotaInfo(),
  mcp: { url: `${PUBLIC_URL}/mcp`, transport: "streamable-http" },
  tools: TOOLS.map((t) => ({ name: t.name, endpoint: `POST ${t.path}`, title: t.title, description: t.description, example: t.example })),
  docs: { openapi: `${PUBLIC_URL}/openapi.json`, llms: `${PUBLIC_URL}/llms.txt` },
  author: { name: "Xonta — маркетплейс ИИ-агентов", url: "https://xonta.ru" },
});

// просмотры страниц описания: люди, поисковики и каталоги
app.use((req, _res, next) => {
  if (req.method === "GET" && (["/", "/llms.txt", "/openapi.json", "/info.json", "/robots.txt", "/sitemap.xml"].includes(req.path) || req.path.startsWith("/tools/")))
    logCall({ event: "page", page: req.path, ip: ipHash(req.ip), ua: String(req.get("user-agent") || "").slice(0, 80) });
  next();
});
app.get("/", (req, res) => (req.accepts(["html", "json"]) === "json" ? res.json(info()) : res.type("html").send(renderHome({ name: NAME, description: DESCRIPTION, publicUrl: PUBLIC_URL, tools: TOOLS, limits: quotaInfo() }))));
app.get("/info.json", (_req, res) => res.json(info()));
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#4f46e5"/><path d="M19 18h7l6 9 6-9h7L35.5 32 45 46h-7l-6-9-6 9h-7l9.5-14z" fill="#fff"/></svg>`;
app.get(["/favicon.svg", "/favicon.ico"], (_req, res) => res.type("image/svg+xml").set("Cache-Control", "public, max-age=604800").send(FAVICON));
mountSeo(app, { tools: TOOLS, publicUrl: PUBLIC_URL });
const OG = readFileSync(new URL("../assets/og.png", import.meta.url));
app.get("/og.png", (_req, res) => res.type("image/png").set("Cache-Control", "public, max-age=604800").send(OG));
// подтверждение управления доменом для паспорта агента (orchestrator Xonta): значение задаётся XONTA_CHALLENGE в .env
app.get("/.well-known/xonta-challenge.txt", (_req, res) => (env.XONTA_CHALLENGE ? res.type("text/plain").send(env.XONTA_CHALLENGE) : res.status(404).type("text/plain").send("Not found")));
app.get("/health", (_req, res) => res.json({ ok: true, version: VERSION }));

app.get("/openapi.json", (_req, res) => {
  const paths = {};
  for (const t of TOOLS) {
    paths[t.path] = {
      post: {
        operationId: t.name,
        summary: t.title,
        description: t.description,
        requestBody: { required: true, content: { "application/json": { schema: t.input, example: t.example } } },
        responses: { 200: { description: "Результат" }, 400: { description: "Некорректные данные" }, 429: { description: "Превышен лимит" } },
      },
    };
  }
  res.json({ openapi: "3.1.0", info: { title: NAME, version: VERSION, description: DESCRIPTION }, servers: [{ url: PUBLIC_URL }], paths });
});

app.get("/llms.txt", (_req, res) =>
  res.type("text/plain; charset=utf-8").send(
    `# ${NAME}\n\n> ${DESCRIPTION}\n\nMCP: ${PUBLIC_URL}/mcp (streamable HTTP, без ключа)\n\n## Инструменты (POST, JSON)\n` +
      TOOLS.map((t) => `- [${t.title}](${PUBLIC_URL}${t.path}): ${t.description} Пример: ${JSON.stringify(t.example)}`).join("\n") +
      `\n\n## Лимиты\n${quotaInfo().per_ip_per_day} вызовов в сутки и ${quotaInfo().per_ip_per_minute} в минуту с одного адреса.\n\n## Автор\nXonta — маркетплейс ИИ-агентов: https://xonta.ru\n`,
  ),
);

// ---------- Инструменты ----------
for (const t of TOOLS) {
  app.post(t.path, async (req, res) => {
    try {
      res.json(await runTool(t, req.body, req, "http"));
    } catch (e) {
      res.status(e.status).json({ error: e.message });
    }
  });
}

mountFiles(app);
mountMcp(app, { name: "xonta-docs", version: VERSION, instructions: DESCRIPTION, tools: TOOLS, runTool });

await initMorph();
await initFiles(PUBLIC_URL);
refreshCalendars().then((r) => console.log("calendar refresh:", r.map((ok) => (ok ? "ok" : "embedded")).join(",")));
setInterval(refreshCalendars, 24 * 3600 * 1000).unref();

app.listen(PORT, () => console.log(`${NAME} ${VERSION} on :${PORT} | ${TOOLS.length} tools | ${PUBLIC_URL}`));
