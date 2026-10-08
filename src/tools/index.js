// Реестр инструментов: из него строятся REST-эндпоинты, MCP-инструменты, openapi.json и llms.txt.
import { validateRequisites } from "./requisites.js";
import { amountInWords } from "./words.js";
import { declineTool } from "./decline.js";
import { workingDays } from "./calendar.js";

export const TOOLS = [
  {
    name: "validate_requisites",
    path: "/v1/requisites/validate",
    title: "Проверка реквизитов (ИНН, КПП, ОГРН, БИК, счёт, СНИЛС)",
    description:
      "Проверяет российские реквизиты по контрольным суммам: ИНН (10/12 цифр), КПП, ОГРН/ОГРНИП, БИК, расчётный и корреспондентский счёт (ключевание по БИК), СНИЛС. " +
      "Находит опечатки до выставления счёта или платежа и указывает, если реквизиты похожи на реквизиты разных лиц. " +
      "Validates Russian company/bank identifiers (INN, KPP, OGRN, BIC, bank account, SNILS) by checksums. Offline, instant.",
    input: {
      type: "object",
      properties: {
        inn: { type: "string", description: "ИНН, 10 или 12 цифр" },
        kpp: { type: "string", description: "КПП, 9 символов" },
        ogrn: { type: "string", description: "ОГРН (13 цифр) или ОГРНИП (15 цифр)" },
        bik: { type: "string", description: "БИК банка, 9 цифр. Нужен для проверки счетов" },
        account: { type: "string", description: "Расчётный счёт, 20 цифр" },
        corr_account: { type: "string", description: "Корреспондентский счёт банка, 20 цифр" },
        snils: { type: "string", description: "СНИЛС, 11 цифр (можно с дефисами и пробелом)" },
      },
    },
    example: { inn: "7707083893", kpp: "773601001", ogrn: "1027700132195", bik: "044525225", account: "40702810938000000001", corr_account: "30101810400000000225" },
    handler: validateRequisites,
  },
  {
    name: "amount_in_words",
    path: "/v1/text/amount-in-words",
    title: "Сумма прописью (с НДС)",
    description:
      "Сумма прописью для счетов, актов и договоров: «Одна тысяча двести тридцать четыре рубля 56 копеек». " +
      "Считает НДС (в том числе или сверху) и выдаёт готовую строку «…, в том числе НДС (22%) 222 руб. 63 коп.». Рубли, доллары, евро, юани. " +
      "Russian 'amount in words' for invoices with VAT line.",
    input: {
      type: "object",
      required: ["amount"],
      properties: {
        amount: { type: "string", description: "Сумма: 1234.56 или «1 234,56»" },
        currency: { type: "string", enum: ["RUB", "USD", "EUR", "CNY"], description: "Валюта, по умолчанию RUB" },
        vat_rate: { type: "string", description: "Ставка НДС в процентах (22, 20, 10, 7, 5, 0) или «без НДС». Не указывать — НДС не считается" },
        vat_included: { type: "boolean", description: "true (по умолчанию) — НДС уже в сумме; false — начислить сверху" },
        kopecks: { type: "string", enum: ["digits", "words"], description: "Копейки цифрами (по умолчанию) или словами" },
      },
    },
    example: { amount: "1234.56", vat_rate: "22" },
    handler: amountInWords,
  },
  {
    name: "decline_name",
    path: "/v1/text/decline",
    title: "Склонение ФИО и должности по падежам",
    description:
      "Склоняет ФИО и должность по падежам для договоров, доверенностей и приказов: «в лице генерального директора Иванова Ивана Петровича», «выдана Кузнецовой Анне Сергеевне». " +
      "Сам определяет пол по отчеству или имени, возвращает полную форму и инициалы. case=all — все шесть падежей сразу. " +
      "Declines Russian full names and job titles by grammatical case.",
    input: {
      type: "object",
      properties: {
        full_name: { type: "string", description: "ФИО целиком, по умолчанию в порядке «Фамилия Имя Отчество»" },
        last_name: { type: "string", description: "Фамилия (вместо full_name)" },
        first_name: { type: "string", description: "Имя" },
        middle_name: { type: "string", description: "Отчество" },
        position: { type: "string", description: "Должность, например «генеральный директор» или «главный бухгалтер»" },
        case: { type: "string", description: "Падеж: genitive (родительный, по умолчанию), dative, accusative, instrumental, prepositional, nominative, по-русски, или all" },
        gender: { type: "string", enum: ["male", "female"], description: "Пол, если его нельзя определить по отчеству" },
        order: { type: "string", enum: ["last_first", "first_last"], description: "Порядок слов в full_name: last_first (по умолчанию) или first_last" },
      },
    },
    example: { full_name: "Иванов Иван Петрович", position: "генеральный директор", case: "genitive" },
    handler: declineTool,
  },
  {
    name: "working_days",
    path: "/v1/calendar/working-days",
    title: "Рабочие дни по производственному календарю РФ",
    description:
      "Производственный календарь России с праздниками и переносами. Три режима: " +
      "(1) date + add_working_days — какая дата будет через N рабочих дней («оплата в течение 5 рабочих дней»); " +
      "(2) date + end_date — сколько рабочих дней и часов между датами; " +
      "(3) только date — рабочий ли это день, праздник, сокращённый день и ближайший рабочий день. " +
      "Russian business-day calendar with official holidays and transfers.",
    input: {
      type: "object",
      properties: {
        date: { type: "string", description: "Дата ГГГГ-ММ-ДД или ДД.ММ.ГГГГ. По умолчанию сегодня (Москва)" },
        add_working_days: { type: "integer", description: "Сколько рабочих дней прибавить (можно отрицательное)" },
        end_date: { type: "string", description: "Конец периода для подсчёта рабочих дней (включительно)" },
      },
    },
    example: { date: "2026-12-25", add_working_days: 5 },
    handler: workingDays,
  },
];

// ---------- Документы ----------
import { makeInvoice, makeAct } from "./documents.js";

const PARTY_PROPS = {
  name: { type: "string", description: "Наименование: «ООО «Ромашка»» или «ИП Иванов Иван Петрович»" },
  inn: { type: "string", description: "ИНН" },
  kpp: { type: "string", description: "КПП (у ИП нет)" },
  ogrn: { type: "string", description: "ОГРН или ОГРНИП" },
  address: { type: "string", description: "Юридический адрес" },
  phone: { type: "string", description: "Телефон" },
  signer_name: { type: "string", description: "ФИО подписанта полностью, например «Иванов Иван Петрович»" },
  signer_position: { type: "string", description: "Должность подписанта, например «генеральный директор»" },
};
const BANK_PROPS = {
  bank_name: { type: "string", description: "Банк получателя, например «ПАО Сбербанк, г. Москва»" },
  bik: { type: "string", description: "БИК банка" },
  account: { type: "string", description: "Расчётный счёт" },
  corr_account: { type: "string", description: "Корреспондентский счёт банка" },
  accountant_name: { type: "string", description: "ФИО главного бухгалтера (если не указано — подписывает руководитель)" },
};
const ITEMS = {
  type: "array",
  description: "Позиции документа",
  items: {
    type: "object",
    required: ["name", "price"],
    properties: {
      name: { type: "string", description: "Наименование товара, работы или услуги" },
      quantity: { type: "number", description: "Количество, по умолчанию 1" },
      unit: { type: "string", description: "Единица: шт., усл., час, мес. и т. п." },
      price: { type: "string", description: "Цена за единицу в рублях, например 15000 или 1500.50" },
    },
  },
};
const COMMON = {
  number: { type: "string", description: "Номер документа" },
  date: { type: "string", description: "Дата ГГГГ-ММ-ДД или ДД.ММ.ГГГГ, по умолчанию сегодня" },
  items: ITEMS,
  vat_rate: { type: "string", description: "НДС: «без НДС» (по умолчанию) или ставка в процентах: 22, 20, 10, 7, 5, 0" },
  vat_included: { type: "boolean", description: "true (по умолчанию) — цены уже с НДС; false — начислить НДС сверху" },
  basis: { type: "string", description: "Основание, например «Договор № 12 от 01.10.2026»" },
  comment: { type: "string", description: "Дополнительный текст внизу документа" },
  format: { type: "string", enum: ["pdf", "docx", "both"], description: "Формат файла: pdf (по умолчанию), docx или both" },
  include_base64: { type: "boolean", description: "Вернуть файл ещё и в base64 (по умолчанию только ссылка)" },
};
const EXAMPLE_SELLER = {
  name: "ООО «Ромашка»", inn: "7707083893", kpp: "773601001", address: "г. Москва, ул. Примерная, д. 1",
  bank_name: "ПАО Сбербанк, г. Москва", bik: "044525225", account: "40702810938000000001", corr_account: "30101810400000000225",
  signer_name: "Иванов Иван Петрович", signer_position: "генеральный директор",
};
const EXAMPLE_BUYER = { name: "ИП Петров Пётр Петрович", inn: "500100732259", signer_name: "Петров Пётр Петрович" };

TOOLS.push(
  {
    name: "make_invoice",
    path: "/v1/documents/invoice",
    weight: 5,
    title: "Счёт на оплату (PDF, DOCX)",
    description:
      "Формирует счёт на оплату по российской форме: банковский блок получателя, поставщик и покупатель, таблица позиций, итог, НДС или «Без налога (НДС)», сумма прописью, подписи. " +
      "Перед формированием проверяет ИНН, КПП, БИК и счета по контрольным суммам; при ошибке в реквизитах документ не создаётся. Может добавить срок оплаты в рабочих днях по производственному календарю. " +
      "Возвращает ссылку на PDF и/или DOCX (действует 24 часа). Generates a Russian invoice (schet na oplatu) as PDF/DOCX.",
    input: {
      type: "object",
      required: ["number", "seller", "buyer", "items"],
      properties: {
        ...COMMON,
        seller: { type: "object", description: "Поставщик (получатель денег) с банковскими реквизитами", required: ["name", "bank_name", "bik", "account"], properties: { ...PARTY_PROPS, ...BANK_PROPS } },
        buyer: { type: "object", description: "Покупатель (плательщик)", required: ["name"], properties: PARTY_PROPS },
        payment_due_working_days: { type: "integer", description: "Срок оплаты в рабочих днях — в счёт добавится «Оплатить не позднее …»" },
      },
    },
    example: {
      number: "15", date: "2026-10-07", seller: EXAMPLE_SELLER, buyer: EXAMPLE_BUYER,
      items: [{ name: "Разработка ИИ-агента для обработки заявок", quantity: 1, unit: "усл.", price: "120000" }, { name: "Сопровождение, месяц", quantity: 3, unit: "мес.", price: "15000" }],
      vat_rate: "без НДС", payment_due_working_days: 5,
    },
    handler: makeInvoice,
  },
  {
    name: "make_act",
    path: "/v1/documents/act",
    weight: 5,
    title: "Акт оказанных услуг (PDF, DOCX)",
    description:
      "Формирует акт выполненных работ (оказанных услуг): исполнитель и заказчик, основание, таблица услуг, итог, НДС, сумма прописью, фраза об отсутствии претензий, блок подписей обеих сторон. " +
      "Проверяет реквизиты сторон по контрольным суммам. Возвращает ссылку на PDF и/или DOCX (действует 24 часа). Generates a Russian services acceptance act (akt) as PDF/DOCX.",
    input: {
      type: "object",
      required: ["number", "seller", "buyer", "items"],
      properties: {
        ...COMMON,
        seller: { type: "object", description: "Исполнитель", required: ["name"], properties: PARTY_PROPS },
        buyer: { type: "object", description: "Заказчик", required: ["name"], properties: PARTY_PROPS },
      },
    },
    example: {
      number: "15", date: "2026-10-31", basis: "Договор № 12 от 01.10.2026",
      seller: { name: EXAMPLE_SELLER.name, inn: EXAMPLE_SELLER.inn, kpp: EXAMPLE_SELLER.kpp, signer_name: EXAMPLE_SELLER.signer_name, signer_position: EXAMPLE_SELLER.signer_position },
      buyer: EXAMPLE_BUYER,
      items: [{ name: "Разработка ИИ-агента для обработки заявок", quantity: 1, unit: "усл.", price: "120000" }],
      vat_rate: "без НДС",
    },
    handler: makeAct,
  },
);

// ---------- Русский текст ----------
import { checkForeignWords, typograph, transliterate } from "./text.js";
import { parseDocument } from "./parse.js";

TOOLS.push(
  {
    name: "check_foreign_words",
    path: "/v1/text/foreign-words",
    title: "Иностранные слова в тексте (подсказки к закону о русском языке)",
    description:
      "Помогает подготовить текст для потребителей (сайт, карточка товара, рассылка, реклама, вывеска) с учётом требований об использовании русского языка, действующих с 1 марта 2026 года. " +
      "Находит слова латиницей, жаргонные англицизмы (дедлайн, кэшбэк, сейл) с вариантами русских замен и распространённые заимствования, которые стоит сверить со словарём. " +
      "Это автоматическая подсказка, а не юридическое заключение: сервис не сверяет текст с нормативными словарями, утверждёнными распоряжением Правительства № 1102-р. " +
      "Highlights Latin-script words and anglicisms in Russian consumer-facing text, with Russian replacements. Not legal advice.",
    input: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "Текст для проверки, до 50 000 символов" },
        allow: { type: "string", description: "Товарные знаки и названия, которые не нужно отмечать, через запятую: «Nike, Яндекс Маркет»" },
      },
    },
    example: { text: "Big SALE в нашем барбершопе! Кэшбэк 10% и бесплатная доставка. Дедлайн акции — 31 октября.", allow: "" },
    handler: checkForeignWords,
  },
  {
    name: "typograph",
    path: "/v1/text/typograph",
    title: "Типограф для русского текста",
    description:
      "Приводит русский текст к типографским правилам: кавычки «ёлочки» и „лапки“ для вложенных, длинное тире, многоточие, диапазоны чисел через короткое тире, " +
      "неразрывные пробелы после предлогов и союзов, перед частицами, между числом и единицей измерения или валютой, в сокращениях. Можно получить результат с &nbsp; для HTML. " +
      "Russian typography: quotes, dashes, non-breaking spaces.",
    input: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "Текст" },
        format: { type: "string", enum: ["text", "html"], description: "html — дополнительно вернуть вариант с &nbsp;" },
      },
    },
    example: { text: 'Акция "Осень - время скидок" действует 1-15 октября: скидка 20 % на 500 товаров...', format: "text" },
    handler: typograph,
  },
  {
    name: "transliterate",
    path: "/v1/text/transliterate",
    title: "Транслитерация: загранпаспорт, ГОСТ, адрес страницы",
    description:
      "Переводит кириллицу в латиницу по выбранной системе: passport — как в загранпаспорте и на банковских картах (приказ МВД № 889, рекомендации ИКАО), " +
      "gost — ГОСТ 7.79-2000 система Б, slug — для адресов страниц и имён файлов (строчные буквы и дефисы). Cyrillic to Latin transliteration.",
    input: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "Текст на кириллице" },
        system: { type: "string", enum: ["passport", "gost", "slug"], description: "Система: passport (по умолчанию), gost или slug" },
      },
    },
    example: { text: "Щукина Юлия Сергеевна", system: "passport" },
    handler: transliterate,
  },
  {
    name: "parse_document",
    path: "/v1/documents/parse",
    weight: 3,
    title: "Распознавание документа: счёт, акт, УПД, счёт-фактура, договор",
    description:
      "Извлекает данные из российского документа в PDF или DOCX с текстовым слоем: тип, номер и дату, продавца и покупателя (название, ИНН, КПП, ОГРН, адрес), банковские реквизиты, " +
      "основание, позиции (наименование, количество, единица, цена, сумма), итог, НДС и сумму прописью. Сразу проверяет ИНН, КПП, БИК и счета по контрольным суммам, " +
      "сверяет сумму позиций с итогом и расчёт НДС. Разбор по правилам: что не найдено, возвращается пустым, а не выдумывается. Сканы и фото без текстового слоя пока не поддерживаются. " +
      "Файл не сохраняется. Extracts structured data from Russian invoices, acts, UPD and contracts (PDF/DOCX).",
    input: {
      type: "object",
      properties: {
        url: { type: "string", description: "Публичная ссылка на PDF или DOCX (до 10 МБ)" },
        base64: { type: "string", description: "Или содержимое файла в base64" },
        filename: { type: "string", description: "Имя файла, если передаёте base64, например schet.pdf" },
        include_text: { type: "boolean", description: "Вернуть также распознанный текст документа" },
      },
    },
    example: { url: "https://example.com/schet-248.pdf" },
    handler: parseDocument,
  },
);

// ---------- Медицина: карточки и реклама ----------
import { checkMedicalText } from "./medical.js";

TOOLS.push({
  name: "check_medical_text",
  path: "/v1/text/medical-check",
  title: "Проверка карточки и рекламы: лекарства, медизделия, БАД, медуслуги",
  description:
    "Проверяет текст карточки товара на маркетплейсе или рекламы по статьям 24 и 25 закона «О рекламе» и постановлению Правительства № 821 (проверка карточек с 1 октября 2026): " +
    "есть ли обязательное предупреждение («Не является лекарственным средством» для БАД; о противопоказаниях, инструкции или консультации специалиста — для лекарств, медизделий и медуслуг), " +
    "найден ли номер регистрации и верен ли его формат (РЗН, ФСР, ЛП, СГР), а также подсвечивает рискованные формулировки: обещания излечения, гарантии, «без побочных эффектов», отзывы и благодарности, лечебные свойства у БАД. " +
    "Это подсказка, а не юридическое заключение: номера не сверяются с госреестрами. Checks Russian medical product cards and ads against advertising law. Not legal advice.",
  input: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", description: "Текст карточки товара или рекламы, до 30 000 символов" },
      kind: { type: "string", enum: ["drug", "device", "supplement", "service"], description: "Тип: drug — лекарство, device — медизделие, supplement — БАД, service — медуслуга. Если не указать, определится по тексту" },
      channel: { type: "string", enum: ["card", "ad"], description: "card — карточка товара (по умолчанию), ad — реклама" },
    },
  },
  example: { text: "БАД «Хондро-Плюс» лечит суставы! 100% результат, без побочных эффектов. СГР RU.77.99.32.003.R.001234.10.24", channel: "card" },
  handler: checkMedicalText,
});
