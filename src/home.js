// Главная страница сервиса для людей и поисковиков (Яндекс, Алиса): что умеет и как подключить.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function renderHome({ name, description, publicUrl, tools, limits }) {
  const mcpUrl = `${publicUrl}/mcp`;
  const cfg = JSON.stringify({ mcpServers: { "xonta-docs": { url: mcpUrl } } }, null, 2);
  const curl = `curl -X POST ${publicUrl}${tools[2].path} \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(tools[2].example)}'`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name,
    description,
    url: publicUrl,
    documentation: `${publicUrl}/openapi.json`,
    provider: { "@type": "Organization", name: "Xonta", url: "https://xonta.ru" },
    offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
  };
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} — MCP-инструменты для ИИ-агентов: счёт и акт в PDF, реквизиты, сумма прописью, склонение ФИО</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(publicUrl)}/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#57534e;--card:#fff;--line:#e7e5e4;--accent:#4f46e5;--code:#f5f5f4}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--card:#1c1917;--line:#292524;--accent:#a5b4fc;--code:#292524}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:860px;margin:0 auto;padding:40px 16px 64px}h1{font-size:30px;line-height:1.2;margin:0 0 12px}
h2{font-size:20px;margin:40px 0 12px}p{margin:0 0 12px}.lead{color:var(--muted);font-size:18px}
.badges span{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 10px;margin:0 6px 6px 0;font-size:14px;color:var(--muted)}
.tool{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 12px}
.tool h3{margin:0 0 6px;font-size:17px}.tool code{font-size:13px}
pre{background:var(--code);border-radius:10px;padding:14px;overflow-x:auto;font-size:13px;margin:0 0 12px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}a{color:var(--accent)}footer{margin-top:48px;color:var(--muted);font-size:14px}
</style></head>
<body><main>
<h1>${esc(name)}</h1>
<p class="lead">Бесплатные инструменты для ИИ-агентов, которые готовят счета, акты, договоры и доверенности. Агент присылает реквизиты и позиции — получает готовый счёт или акт в PDF и Word. Подключаются по протоколу MCP к Claude, Cursor, GigaChat-агентам и любым другим клиентам.</p>
<div class="badges"><span>бесплатно</span><span>без регистрации и ключей</span><span>MCP + REST</span><span>счета и акты в PDF и DOCX</span></div>

<h2>Инструменты</h2>
${tools.map((t) => `<div class="tool"><h3>${esc(t.title)}</h3><p>${esc(t.description.replace(/\s[A-Z][^А-Яа-яЁё]*$/, ""))}</p><code>${esc(t.name)} · POST ${esc(t.path)}</code></div>`).join("\n")}

<h2>Как подключить</h2>
<p>Адрес MCP-сервера (Streamable HTTP):</p>
<pre><code>${esc(mcpUrl)}</code></pre>
<p>Для Claude Desktop, Cursor и других клиентов с поддержкой удалённых MCP-серверов:</p>
<pre><code>${esc(cfg)}</code></pre>
<p>Или обычным HTTP-запросом:</p>
<pre><code>${esc(curl)}</code></pre>
<p>Описание API: <a href="/openapi.json">openapi.json</a> · для нейросетей: <a href="/llms.txt">llms.txt</a> · исходный код: <a href="https://github.com/mrsergeiluzhnov/xonta-docs">GitHub</a></p>
<p>Сервер есть в каталогах: <a href="https://registry.modelcontextprotocol.io/v0/servers?search=xonta-docs">официальный реестр MCP</a>, <a href="https://glama.ai/mcp/connectors/ru.xonta.mcp/xonta-docs">Glama</a>, <a href="https://smithery.ai/servers/mrsergeiluzhnov/xonta-docs">Smithery</a>.</p>

<h2>Лимиты</h2>
<p>${limits.per_ip_per_day} вызовов в сутки и ${limits.per_ip_per_minute} в минуту с одного адреса. Нужно больше — напишите через <a href="https://xonta.ru">xonta.ru</a>.</p>

<h2>Частые вопросы</h2>
<p><b>Проверяет ли сервис, что организация существует?</b> Нет, проверяются формат и контрольные числа реквизитов. Это ловит опечатки, но не заменяет проверку в ЕГРЮЛ.</p>
<p><b>Откуда календарь?</b> Производственный календарь РФ по постановлениям Правительства (данные xmlcalendar.ru), обновляется автоматически.</p>
<p><b>Сохраняются ли данные?</b> Проверка реквизитов, сумма прописью, склонение и календарь работают в памяти и ничего не записывают. Готовые счета и акты хранятся 24 часа, чтобы их можно было скачать по ссылке, и затем удаляются автоматически.</p>
<p><b>Можно ли ставить на счёт печать и подпись?</b> Сервис формирует документ без подписи. Подпишите его вручную после печати или отправьте через систему ЭДО.</p>

<footer>Сделано командой <a href="https://xonta.ru">Xonta</a> — маркетплейса ИИ-агентов для бизнеса. Новости: <a href="https://t.me/xonta_live">Xonta Live</a>.</footer>
</main></body></html>`;
}
