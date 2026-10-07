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

const env = process.env;
const PORT = Number(env.PORT || 4031);
const PUBLIC_URL = (env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const VERSION = "1.0.0";
const NAME = "Xonta Документы";

export const DESCRIPTION =
  "Инструменты для ИИ-агентов, которые готовят российские документы: проверка реквизитов (ИНН, КПП, ОГРН, БИК, счёт, СНИЛС), " +
  "сумма прописью с НДС, склонение ФИО и должностей по падежам, рабочие дни по производственному календарю РФ. " +
  "Бесплатно, без регистрации и ключей. Tools for AI agents preparing Russian business documents.";

const app = express();
app.set("trust proxy", 1); // ровно один прокси (Caddy) перед сервисом
app.use(express.json({ limit: "200kb" }));
app.use((err, _req, res, next) => (err ? res.status(400).json({ error: "Некорректный JSON" }) : next()));

async function runTool(tool, args, req, channel) {
  const t0 = Date.now();
  const base = { tool: tool.name, channel, ip: ipHash(req.ip), ua: String(req.get("user-agent") || "").slice(0, 80) };
  const slot = takeSlot(req.ip);
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

app.get("/", (req, res) => (req.accepts(["html", "json"]) === "json" ? res.json(info()) : res.type("html").send(renderHome({ name: NAME, description: DESCRIPTION, publicUrl: PUBLIC_URL, tools: TOOLS, limits: quotaInfo() }))));
app.get("/info.json", (_req, res) => res.json(info()));
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

mountMcp(app, { name: "xonta-docs", version: VERSION, instructions: DESCRIPTION, tools: TOOLS, runTool });

await initMorph();
refreshCalendars().then((r) => console.log("calendar refresh:", r.map((ok) => (ok ? "ok" : "embedded")).join(",")));
setInterval(refreshCalendars, 24 * 3600 * 1000).unref();

app.listen(PORT, () => console.log(`${NAME} ${VERSION} on :${PORT} | ${TOOLS.length} tools | ${PUBLIC_URL}`));
