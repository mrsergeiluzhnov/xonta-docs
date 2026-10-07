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
