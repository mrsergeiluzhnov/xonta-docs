// Главная страница сервиса для людей и поисковиков (Яндекс, Алиса): что умеет и как подключить.
import { esc, STYLE, headTags, topNav, footer } from "./layout.js";
import { PAGES, slugOf } from "./seo.js";

export function renderHome({ name, description, publicUrl, tools, limits }) {
  const mcpUrl = `${publicUrl}/mcp`;
  const cfg = JSON.stringify({ mcpServers: { "xonta-docs": { url: mcpUrl } } }, null, 2);
  const curl = `curl -X POST ${publicUrl}${tools[2].path} \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(tools[2].example)}'`;
  const ld = [{
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name,
    description,
    url: publicUrl,
    documentation: `${publicUrl}/openapi.json`,
    provider: { "@type": "Organization", name: "Xonta", url: "https://xonta.ru" },
    offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
  }, {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Инструменты Xonta Документы",
    itemListElement: tools.filter(slugOf).map((t, i) => ({ "@type": "ListItem", position: i + 1, name: PAGES[t.name].h1, url: `${publicUrl}/tools/${slugOf(t)}` })),
  }];
  return `<!doctype html>
<html lang="ru"><head>
${headTags({ title: `${name} — MCP-инструменты для ИИ-агентов: счёт и акт в PDF, реквизиты, сумма прописью, склонение ФИО`, description, url: `${publicUrl}/`, publicUrl, ld })}
${STYLE}
</head>
<body><main>
${topNav()}
<h1>${esc(name)}</h1>
<p class="lead">Бесплатные инструменты для ИИ-агентов, которые готовят счета, акты, договоры и доверенности. Агент присылает реквизиты и позиции — получает готовый счёт или акт в PDF и Word, присылает входящий документ — получает разобранные данные. Подключаются по протоколу MCP к Claude, Cursor, GigaChat-агентам и любым другим клиентам.</p>
<div class="badges"><span>бесплатно</span><span>без регистрации и ключей</span><span>MCP + REST</span><span>счета и акты в PDF и DOCX</span><span>распознавание документов</span></div>

<h2 id="tools">Инструменты</h2>
${tools.map((t) => `<div class="tool"><h3>${slugOf(t) ? `<a href="/tools/${slugOf(t)}">${esc(t.title)}</a>` : esc(t.title)}</h3><p>${esc(t.description.replace(/\s[A-Z][^А-Яа-яЁё]*$/, ""))}</p><code>${esc(t.name)} · POST ${esc(t.path)}</code></div>`).join("\n")}

<h2>Как подключить</h2>
<p>Адрес MCP-сервера (Streamable HTTP):</p>
<pre><code>${esc(mcpUrl)}</code></pre>
<p>Для Claude Desktop, Cursor и других клиентов с поддержкой удалённых MCP-серверов:</p>
<pre><code>${esc(cfg)}</code></pre>
<p>Или обычным HTTP-запросом:</p>
<pre><code>${esc(curl)}</code></pre>
<p>Описание API: <a href="/openapi.json">openapi.json</a> · для нейросетей: <a href="/llms.txt">llms.txt</a> · исходный код: <a href="https://github.com/mrsergeiluzhnov/xonta-docs">GitHub</a></p>
<p>Сервер есть в каталогах: <a href="https://registry.modelcontextprotocol.io/v0/servers?search=xonta-docs">официальный реестр MCP</a>, <a href="https://glama.ai/mcp/connectors/ru.xonta.mcp/xonta-docs">Glama</a>, <a href="https://smithery.ai/servers/mrsergeiluzhnov/xonta-docs">Smithery</a>, <a href="https://mcpservers.org/servers/mrsergeiluzhnov/xonta-docs">mcpservers.org</a>.</p>

<h2>Лимиты</h2>
<p>${limits.per_ip_per_day} вызовов в сутки и ${limits.per_ip_per_minute} в минуту с одного адреса. Нужно больше — напишите через <a href="https://xonta.ru">xonta.ru</a>.</p>

<h2>Частые вопросы</h2>
<p><b>Проверяет ли сервис, что организация существует?</b> Нет, проверяются формат и контрольные числа реквизитов. Это ловит опечатки, но не заменяет проверку в ЕГРЮЛ.</p>
<p><b>Откуда календарь?</b> Производственный календарь РФ по постановлениям Правительства (данные xmlcalendar.ru), обновляется автоматически.</p>
<p><b>Сохраняются ли данные?</b> Проверка реквизитов, сумма прописью, склонение и календарь работают в памяти и ничего не записывают. Файлы, присланные на распознавание, не сохраняются. Готовые счета и акты хранятся 24 часа, чтобы их можно было скачать по ссылке, и затем удаляются автоматически.</p>
<p><b>Проверка иностранных слов — это юридическая проверка?</b> Нет. Инструмент подсвечивает латиницу и частые англицизмы и предлагает замены, но не сверяет текст с нормативными словарями, утверждёнными Правительством. Окончательное решение — за вами или вашим юристом.</p>
<p><b>Проверка медицинских карточек гарантирует прохождение модерации маркетплейса?</b> Нет. Инструмент проверяет текст и формат номера регистрации, но не сверяет номер с государственными реестрами — это делает сам маркетплейс. Это подсказка, а не юридическое заключение.</p>
<p><b>Можно ли ставить на счёт печать и подпись?</b> Сервис формирует документ без подписи. Подпишите его вручную после печати или отправьте через систему ЭДО.</p>

${footer()}
</main></body></html>`;
}
