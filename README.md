# Xonta Документы — MCP-инструменты для российских документов

[![smithery badge](https://smithery.ai/badge/mrsergeiluzhnov/xonta-docs)](https://smithery.ai/servers/mrsergeiluzhnov/xonta-docs)

Бесплатный MCP-сервер для ИИ-агентов, которые готовят счета, акты, договоры, доверенности и приказы. Агент передаёт реквизиты и позиции — получает готовый счёт или акт в PDF и Word. Без регистрации и ключей.

**Адрес MCP:** `https://mcp.xonta.ru/mcp` (Streamable HTTP) · **Сайт:** https://mcp.xonta.ru

| Инструмент | Что делает |
|---|---|
| `make_invoice` | Счёт на оплату в PDF и DOCX по российской форме: банковский блок, позиции, НДС, сумма прописью, подписи, срок оплаты в рабочих днях. Реквизиты проверяются до формирования |
| `make_act` | Акт оказанных услуг в PDF и DOCX: стороны, основание, услуги, итог, НДС, сумма прописью, подписи обеих сторон |
| `validate_requisites` | Проверка ИНН (10/12), КПП, ОГРН/ОГРНИП, БИК, расчётного и корр. счёта (ключевание по БИК), СНИЛС по контрольным суммам. Предупреждает, если реквизиты похожи на реквизиты разных лиц |
| `amount_in_words` | Сумма прописью: «Одна тысяча двести тридцать четыре рубля 56 копеек». НДС в том числе или сверху, готовая строка для счёта. RUB, USD, EUR, CNY |
| `decline_name` | ФИО и должность в нужном падеже: «в лице генерального директора Иванова Ивана Петровича». Пол определяется автоматически, есть инициалы и режим «все падежи» |
| `working_days` | Производственный календарь РФ: дата через N рабочих дней, число рабочих дней и часов в периоде, праздник ли день |

## Подключение

Claude Desktop, Cursor и другие клиенты с удалёнными MCP-серверами:

```json
{ "mcpServers": { "xonta-docs": { "url": "https://mcp.xonta.ru/mcp" } } }
```

Или обычный HTTP:

```bash
curl -X POST https://mcp.xonta.ru/v1/text/decline \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Иванов Иван Петрович","position":"генеральный директор","case":"genitive"}'
# → "position_and_name": "генерального директора Иванова Ивана Петровича"
```

Описание API: `/openapi.json`, для нейросетей: `/llms.txt`.

Каталоги: [официальный реестр MCP](https://registry.modelcontextprotocol.io/v0/servers?search=xonta-docs) (`io.github.mrsergeiluzhnov/xonta-docs`) · [Glama](https://glama.ai/mcp/connectors/ru.xonta.mcp/xonta-docs) · [Smithery](https://smithery.ai/servers/mrsergeiluzhnov/xonta-docs)

Лимиты: 300 единиц в сутки и 60 вызовов в минуту с одного адреса (счёт или акт — 5 единиц, остальные инструменты — 1). Готовые документы доступны по ссылке 24 часа и затем удаляются; остальные инструменты ничего не сохраняют. В журнал пишутся только название инструмента, время и хэш адреса.

## English

Free remote MCP server for AI agents that prepare Russian business documents: generates Russian invoices (schet na oplatu) and service acts (akt) as PDF/DOCX, validates Russian company and bank identifiers (INN, KPP, OGRN, BIC, account, SNILS) by checksum, writes amounts in Russian words with a VAT line, declines Russian names and job titles by grammatical case, and computes business days using the official Russian production calendar. No API key. Endpoint: `https://mcp.xonta.ru/mcp`.

## Запуск у себя

```bash
npm install
npm test        # проверка инструментов на известных значениях
npm run e2e     # сервер + REST + настоящий MCP-клиент + лимиты
npm start       # http://localhost:4031
```

## Источники и лицензии

- Склонение ФИО: [petrovich](https://github.com/petrovich/petrovich-js) (MIT).
- Склонение должностей: [Az.js](https://github.com/deNULL/Az.js) (MIT) со словарями [OpenCorpora](http://opencorpora.org) (CC BY-SA).
- Шрифт в PDF: Liberation Sans (SIL OFL 1.1), файлы и лицензия в `assets/fonts`.
- Производственный календарь: [xmlcalendar.ru](https://xmlcalendar.ru) по постановлениям Правительства РФ. Встроены 2025–2027 годы, на сервере данные обновляются раз в сутки.

Проверка реквизитов подтверждает правильность формата и контрольных чисел, но не существование организации в ЕГРЮЛ.

Код: MIT. Сделано командой [Xonta](https://xonta.ru) — маркетплейса ИИ-агентов для бизнеса.
