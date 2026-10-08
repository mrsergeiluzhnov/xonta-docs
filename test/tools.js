// Проверка инструментов на известных значениях. Запуск: npm test
import assert from "node:assert/strict";
import { TOOLS } from "../src/tools/index.js";
import { checkInn, checkOgrn, checkSnils, checkAccount, checkKpp } from "../src/tools/requisites.js";
import { numberToWords } from "../src/tools/words.js";
import { setCalendarFetcher } from "../src/tools/calendar.js";

setCalendarFetcher(async () => { throw new Error("offline"); }); // тесты только на встроенных данных
const run = (n, a) => TOOLS.find((t) => t.name === n).handler(a);
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log("PASS", name); };

// --- реквизиты (реальные реквизиты Сбербанка и известные тестовые номера) ---
await t("ИНН 10 и 12", () => {
  assert.equal(checkInn("7707083893").valid, true);
  assert.equal(checkInn("7707083894").valid, false);
  assert.equal(checkInn("500100732259").valid, true);
  assert.equal(checkInn("500100732258").valid, false);
  assert.equal(checkInn("12345").valid, false);
});
await t("ОГРН и ОГРНИП", () => {
  assert.equal(checkOgrn("1027700132195").valid, true);
  assert.equal(checkOgrn("1027700132196").valid, false);
  assert.equal(checkOgrn("304500116000157").valid, true);
});
await t("СНИЛС", () => {
  assert.equal(checkSnils("112-233-445 95").valid, true);
  assert.equal(checkSnils("11223344594").valid, false);
});
await t("КПП", () => {
  assert.equal(checkKpp("773601001").valid, true);
  assert.equal(checkKpp("7736AB001").valid, true);
  assert.equal(checkKpp("77360100").valid, false);
});
await t("счета по БИК", () => {
  assert.equal(checkAccount("30101810400000000225", "044525225", { corr: true }).valid, true);
  assert.equal(checkAccount("30101810400000000226", "044525225", { corr: true }).valid, false);
  assert.equal(checkAccount("40702810938000000001", "044525225").valid, true);
  assert.equal(checkAccount("40702810938000000002", "044525225").valid, false);
  assert.equal(checkAccount("40702810938000000001").valid, null);
});
await t("перекрёстные предупреждения", async () => {
  const r = await run("validate_requisites", { inn: "500100732259", kpp: "773601001", ogrn: "1027700132195" });
  assert.ok(r.warnings.length >= 2);
  await assert.rejects(run("validate_requisites", {}), /хотя бы одно/);
});

// --- сумма прописью ---
await t("числа прописью", () => {
  const cases = { 0: "ноль", 1: "один", 12: "двенадцать", 21: "двадцать один", 111: "сто одиннадцать", 1000: "одна тысяча", 2001: "две тысячи один",
    11000: "одиннадцать тысяч", 22000: "двадцать две тысячи", 1000000: "один миллион", 1002003004: "один миллиард два миллиона три тысячи четыре" };
  for (const [n, w] of Object.entries(cases)) assert.equal(numberToWords(n), w);
  assert.equal(numberToWords(21, "f"), "двадцать одна");
});
await t("рубли, копейки, НДС", async () => {
  assert.equal((await run("amount_in_words", { amount: "1234.56" })).words, "Одна тысяча двести тридцать четыре рубля 56 копеек");
  assert.equal((await run("amount_in_words", { amount: "1 001,01" })).words, "Одна тысяча один рубль 01 копейка");
  assert.equal((await run("amount_in_words", { amount: "2.03", kopecks: "words" })).words, "Два рубля три копейки");
  assert.equal((await run("amount_in_words", { amount: 0.5 })).numeric, "0 руб. 50 коп.");
  const v = await run("amount_in_words", { amount: "1220", vat_rate: "22" });
  assert.equal(v.vat.amount, "220.00");
  assert.equal(v.vat.line, "Одна тысяча двести двадцать рублей 00 копеек, в том числе НДС (22%) 220 руб. 00 коп.");
  const top = await run("amount_in_words", { amount: "1000", vat_rate: "20", vat_included: false });
  assert.equal(top.vat.total, "1200.00");
  assert.equal((await run("amount_in_words", { amount: "100", vat_rate: "без НДС" })).vat.line, "Сто рублей 00 копеек, без НДС");
  assert.equal((await run("amount_in_words", { amount: "5", currency: "USD" })).words, "Пять долларов США 00 центов");
  await assert.rejects(run("amount_in_words", { amount: "abc" }), /Не удалось прочитать/);
});

// --- склонение ---
await t("ФИО по падежам", async () => {
  const g = await run("decline_name", { full_name: "Иванов Иван Петрович" });
  assert.equal(g.full, "Иванова Ивана Петровича");
  assert.equal(g.short, "Иванова И. П.");
  assert.equal((await run("decline_name", { full_name: "Кузнецова Анна Сергеевна", case: "дательный" })).full, "Кузнецовой Анне Сергеевне");
  assert.equal((await run("decline_name", { full_name: "Ковальчук Мария", case: "genitive" })).full, "Ковальчук Марии");
  assert.equal((await run("decline_name", { full_name: "Ковальчук Никита Ильич", case: "instrumental" })).full, "Ковальчуком Никитой Ильичем");
  const all = await run("decline_name", { full_name: "Петров Пётр", case: "all" });
  assert.equal(all.cases.prepositional.full, "Петрове Петре");
});
await t("должности", async () => {
  const pos = async (p, c) => (await run("decline_name", { position: p, case: c })).position;
  assert.equal(await pos("генеральный директор", "genitive"), "генерального директора");
  assert.equal(await pos("главный бухгалтер", "accusative"), "главного бухгалтера");
  assert.equal(await pos("старший менеджер по продажам", "instrumental"), "старшим менеджером по продажам");
  assert.equal(await pos("заместитель генерального директора", "dative"), "заместителю генерального директора");
  assert.equal(await pos("Ведущий инженер-программист", "genitive"), "Ведущего инженера-программиста");
  assert.equal(await pos("Генеральный директор ООО «Ромашка»", "genitive"), "Генерального директора ООО «Ромашка»");
  const r = await run("decline_name", { full_name: "Иванов Иван Петрович", position: "генеральный директор" });
  assert.equal(r.position_and_name, "генерального директора Иванова Ивана Петровича");
});

// --- календарь ---
await t("календарь: итоги 2025–2027 совпадают с официальной статистикой (247 дней, 1972 ч)", async () => {
  for (const y of [2025, 2026, 2027]) {
    const r = await run("working_days", { date: `${y}-01-01`, end_date: `${y}-12-31` });
    assert.equal(r.working_days, 247, `${y}`);
    assert.equal(r.hours_40h_week, 1972, `${y}`);
  }
});
await t("календарь: сроки и праздники", async () => {
  assert.equal((await run("working_days", { date: "2026-12-25", add_working_days: 5 })).result_date, "2027-01-12");
  assert.equal((await run("working_days", { date: "2026-06-15", add_working_days: -3 })).result_date, "2026-06-09");
  assert.equal((await run("working_days", { date: "2026-05-08" })).short_day, true);
  assert.equal((await run("working_days", { date: "09.01.2026" })).working, false);
  assert.equal((await run("working_days", { date: "2025-11-01" })).working, true); // рабочая суббота
  assert.equal((await run("working_days", { date: "2026-11-04" })).kind, "праздник: День народного единства");
  await assert.rejects(run("working_days", { date: "2026-02-30" }), /такой даты нет/);
});

// --- документы ---
const { computeDoc, shortName } = await import("../src/tools/documents.js");
const inv = TOOLS.find((x) => x.name === "make_invoice").example;
await t("счёт: суммы, НДС, прописью, количество с дробью", () => {
  const d = computeDoc({ ...inv, vat_rate: "22", items: [...inv.items, { name: "Консультация", quantity: "2,5", unit: "час", price: "3500.50" }] }, "invoice");
  assert.equal(d.total.replace(/ /g, " "), "173 751,25");
  assert.equal(d.vat.amount.replace(/ /g, " "), "31 332,19");
  assert.equal(d.items[2].sum.replace(/ /g, " "), "8 751,25");
  assert.equal(d.words, "Сто семьдесят три тысячи семьсот пятьдесят один рубль 25 копеек");
  assert.equal(d.totalsLine.replace(/ /g, " "), "Всего наименований 3, на сумму 173 751,25 руб.");
  assert.equal(d.title, "Счёт на оплату № 15 от 7 октября 2026 г.");
  const top = computeDoc({ ...inv, vat_rate: "20", vat_included: false, items: [{ name: "x", price: "1000" }] }, "invoice");
  assert.equal(top.total.replace(/ /g, " "), "1 200,00");
  assert.equal(computeDoc({ ...inv, items: [{ name: "x", price: "1" }] }, "invoice").totalsLine.startsWith("Всего наименований 1,"), true);
});
await t("счёт: ошибки реквизитов блокируют документ", () => {
  assert.throws(() => computeDoc({ ...inv, seller: { ...inv.seller, account: "40702810938000000002" } }, "invoice"), /контрольная сумма|Контрольная сумма/);
  assert.throws(() => computeDoc({ ...inv, buyer: { name: "X", inn: "500100732258" } }, "invoice"), /buyer\.inn/);
  assert.throws(() => computeDoc({ ...inv, seller: { name: "ООО X", inn: "7707083893" } }, "invoice"), /банковские реквизиты/);
  assert.throws(() => computeDoc({ ...inv, items: [] }, "invoice"), /items/);
  assert.throws(() => computeDoc({ ...inv, items: [{ name: "x", price: "1", quantity: "-1" }] }, "invoice"), /quantity/);
});
await t("акт: без банковских реквизитов, ИП, инициалы", async () => {
  const a = computeDoc(TOOLS.find((x) => x.name === "make_act").example, "act");
  assert.equal(a.title, "Акт № 15 от 31 октября 2026 г.");
  assert.equal(a.buyer.isIp, true);
  assert.equal(a.totalsLine.replace(/ /g, " "), "Всего оказано услуг 1, на сумму 120 000,00 руб.");
  assert.equal(shortName("Иванов Иван Петрович"), "Иванов И. П.");
});
await t("счёт и акт: PDF и DOCX создаются, срок оплаты по календарю", async () => {
  process.env.FILES_DIR ||= "/tmp/xonta-docs-test-files";
  const r = await run("make_invoice", { ...inv, format: "both", include_base64: true });
  assert.equal(r.payment_due, "2026-10-14");
  assert.equal(r.files.length, 2);
  assert.ok(Buffer.from(r.base64.pdf, "base64").subarray(0, 5).toString() === "%PDF-");
  assert.ok(Buffer.from(r.base64.docx, "base64").subarray(0, 2).toString() === "PK");
  const a = await run("make_act", { ...TOOLS.find((x) => x.name === "make_act").example });
  assert.equal(a.files[0].format, "pdf");
  // много позиций — PDF на несколько страниц не падает
  const many = await run("make_invoice", { ...inv, items: Array.from({ length: 60 }, (_, i) => ({ name: `Позиция ${i + 1}`, price: "100" })), include_base64: true });
  assert.ok(Buffer.from(many.base64.pdf, "base64").toString("latin1").match(/\/Type \/Page\b/g).length >= 2);
});

// --- русский текст ---
const { checkForeignWords, typograph, transliterate } = await import("../src/tools/text.js");
await t("иностранные слова: латиница, жаргон, распространённые, исключения", async () => {
  const r = await checkForeignWords({ text: "Big SALE в барбершопе! Кэшбэк и фидбэком делитесь. Новый кейс бренда Nike. Пишите hello@shop.ru, www.shop.ru. Артикул SKU123, USB.", allow: "Nike" });
  assert.deepEqual(r.latin.map((x) => x.text), ["Big SALE"]);
  assert.deepEqual(r.likely_not_in_dictionaries.map((x) => x.word).sort(), ["барбершоп", "кэшбэк", "фидбэк"]);
  assert.deepEqual(r.check_in_dictionary.map((x) => x.word).sort(), ["бренд", "кейс"]);
  assert.match(r.disclaimer, /не юридическое заключение/);
  const clean = await checkForeignWords({ text: "Скидки на всю обувь до конца месяца." });
  assert.equal(clean.summary.latin + clean.summary.likely_not_in_dictionaries, 0);
  assert.equal(clean.verdict, "Латиницы и англицизмов из нашего списка не найдено.");
});
await t("типограф", async () => {
  const r = await typograph({ text: 'Он сказал: "Это "лучший" выбор" - и ушёл... Цена 1 500 руб. за 2-3 дня. Пришёл ли он?' });
  assert.equal(r.text, "Он сказал: «Это „лучший“ выбор» — и ушёл… Цена 1 500 руб. за 2–3 дня. Пришёл ли он?");
  assert.ok((await typograph({ text: "в лесу", format: "html" })).html === "в&nbsp;лесу");
});
await t("транслитерация", async () => {
  assert.equal((await transliterate({ text: "Щукина Юлия Цыганова, ЖЕНЯ" })).result, "Shchukina Iuliia Tsyganova, ZHENIA");
  assert.equal((await transliterate({ text: "Цветочная улица", system: "gost" })).result, "Cvetochnaya ulica");
  assert.equal((await transliterate({ text: "Цирк Ёлки", system: "gost" })).result, "Czirk Yolki");
  assert.equal((await transliterate({ text: "Счёт на оплату № 15!", system: "slug" })).result, "schet-na-oplatu-15");
});

// --- распознавание документов ---
const { parseDocument, analyzeLines } = await import("../src/tools/parse.js");
await t("распознавание: наши счёт и акт в PDF и DOCX (круговая проверка)", async () => {
  for (const [name, fmt] of [["make_invoice", "pdf"], ["make_invoice", "docx"], ["make_act", "pdf"], ["make_act", "docx"]]) {
    const ex = structuredClone(TOOLS.find((x) => x.name === name).example);
    if (name === "make_invoice") ex.vat_rate = "22";
    const made = await run(name, { ...ex, format: fmt, include_base64: true });
    const p = await parseDocument({ base64: made.base64[fmt], filename: `x.${fmt}` });
    assert.equal(p.type, name === "make_act" ? "act" : "invoice", `${name} ${fmt}`);
    assert.equal(p.number, "15");
    assert.equal(p.seller.inn, "7707083893");
    assert.equal(p.buyer.inn, "500100732259");
    assert.equal(p.buyer.name, "ИП Петров Пётр Петрович");
    assert.equal(p.items[0].quantity, "1");
    assert.equal(p.items[0].unit, "усл.");
    assert.deepEqual(p.issues, [], `${name} ${fmt}: ${p.issues}`);
    assert.equal(p.confidence, "high");
    if (name === "make_invoice") { assert.equal(p.totals.total, "165000.00"); assert.equal(p.totals.vat.amount, "29754.10"); assert.equal(p.bank.account, "40702810938000000001"); }
    else assert.equal(p.basis, "Договор № 12 от 01.10.2026");
  }
});
await t("распознавание: счёт в стиле 1С, УПД, договор", () => {
  const onec = analyzeLines(`АО "АЛЬФА-БАНК" г. Москва | БИК | 044525593
Банк получателя | Сч. № | 30101810200000000593
ИНН 7728168971 | КПП 770801001 | Сч. № | 40702810701300012345
Счет на оплату № 248 от 15 сентября 2026 г.
Поставщик (Исполнитель): | ООО "Вектор", ИНН 7728168971, КПП 770801001, 119021, Москва г, Тимура Фрунзе ул, дом № 11
Покупатель (Заказчик): | ООО "Ромашка", ИНН 7707083893, КПП 773601001
№ | Товары (работы, услуги) | Кол-во | Ед. | Цена | Сумма
1 | Бумага офисная А4 | 20 | пач | 450,00 | 9 000,00
2 | Картридж | 2 | шт | 3 100,00 | 6 200,00
Итого: | 15 200,00
В том числе НДС: | 2 740,98
Всего к оплате: | 15 200,00`.split("\n"));
  assert.equal(onec.type, "invoice"); assert.equal(onec.date, "2026-09-15"); assert.equal(onec.seller.name, 'ООО "Вектор"');
  assert.equal(onec.seller.address, "119021, Москва г, Тимура Фрунзе ул, дом № 11");
  assert.equal(onec.totals.vat.rate, 22); assert.equal(onec.totals.vat.rate_inferred, true);
  assert.equal(onec.items.length, 2); assert.equal(onec.checks.items_sum, "сумма позиций совпадает с итогом");
  assert.ok(onec.issues.some((x) => x.startsWith("bank.account")), "выдуманный счёт должен не пройти проверку");
  const upd = analyzeLines(`Универсальный передаточный документ
Счет-фактура № 1045 от 30.09.2026 | (1)
Продавец: ООО "Техносфера" | (2)
ИНН/КПП продавца: 7736207543/773601001 | (2б)
Покупатель: ООО "Ромашка" | (6)
ИНН/КПП покупателя: 7707083893/773601001 | (6б)
1 | Ноутбук | 796 | шт | 2 | 50 000,00 | 100 000,00 | без акциза | 22% | 22 000,00 | 122 000,00
Всего к оплате | 100 000,00 | 22 000,00 | 122 000,00`.split("\n"));
  assert.equal(upd.type, "upd"); assert.equal(upd.number, "1045"); assert.equal(upd.seller.inn, "7736207543"); assert.equal(upd.seller.kpp, "773601001");
  assert.equal(upd.totals.total, "122000.00"); assert.equal(upd.items[0].quantity, "2"); assert.equal(upd.items[0].sum, "100000.00"); assert.deepEqual(upd.issues, []);
  const dog = analyzeLines(["ДОГОВОР ОКАЗАНИЯ УСЛУГ № 12", "г. Москва 01 октября 2026 г.", "Заказчик: ООО «Ромашка», ИНН 7707083893, КПП 773601001", "Исполнитель: ИП Петров Пётр Петрович, ИНН 500100732259, ОГРНИП 304500116000157"]);
  assert.equal(dog.type, "contract"); assert.equal(dog.number, "12"); assert.equal(dog.date, "2026-10-01"); assert.equal(dog.seller.ogrn, "304500116000157");
});
await t("распознавание: PDF из другой программы (LibreOffice, склеенные ячейки, перенос названия)", async () => {
  const { readFileSync } = await import("node:fs");
  const r = await parseDocument({ base64: readFileSync(new URL("./fixtures/schet-libreoffice.pdf", import.meta.url)).toString("base64"), filename: "s.pdf" });
  assert.equal(r.number, "77/2026"); assert.equal(r.date, "2026-10-03"); assert.equal(r.seller.inn, "7736207543");
  assert.equal(r.items.length, 2); assert.equal(r.items[0].name, "Размещение рекламы, октябрь 2026"); assert.equal(r.items[1].quantity, "2.5");
  assert.equal(r.totals.vat.amount, "12803.28"); assert.deepEqual(r.issues, []);
});
await t("распознавание: скан без текста и внутренние ссылки отклоняются", async () => {
  const PDFDocument = (await import("pdfkit")).default;
  const blank = await new Promise((res) => { const d = new PDFDocument(); const ch = []; d.on("data", (c) => ch.push(c)); d.on("end", () => res(Buffer.concat(ch))); d.rect(10, 10, 100, 100).fill(); d.end(); });
  await assert.rejects(parseDocument({ base64: blank.toString("base64"), filename: "scan.pdf" }), /скан/);
  await assert.rejects(parseDocument({ url: "http://127.0.0.1/x.pdf" }), /внутренние адреса/);
  await assert.rejects(parseDocument({ base64: Buffer.from("hello").toString("base64"), filename: "a.txt" }), /PDF и DOCX/);
});

// --- медицинские карточки и реклама ---
const { checkMedicalText } = await import("../src/tools/medical.js");
await t("медтексты: БАД с нарушениями и корректная карточка", async () => {
  const badText = await checkMedicalText({ text: "БАД «Хондро-Плюс» лечит суставы и избавляет от артрита! 100% результат, абсолютно безопасно. Мне помог за неделю! Огромное спасибо производителю. СГР RU.77.99.32.003.R.001234.10.24" });
  assert.equal(badText.kind, "supplement");
  assert.ok(badText.recommendations.some((x) => x.includes("Не является лекарственным средством")), "в карточке — рекомендация");
  const badAd = await checkMedicalText({ text: "БАД для суставов. СГР RU.77.99.32.003.R.001234.10.24", channel: "ad" });
  assert.ok(badAd.problems.some((x) => x.includes("Не является лекарственным средством")), "в рекламе — замечание");
  const phrases = badText.risky_phrases.map((x) => x.phrase.toLowerCase());
  for (const p of ["лечит", "от артрита", "100% результат", "мне помог"]) assert.ok(phrases.some((x) => x.includes(p)), p);
  const ok = await checkMedicalText({ text: "Биологически активная добавка «Витамин D3». Источник витамина D. Не является лекарственным средством. СГР RU.77.99.32.003.R.001234.10.24" });
  assert.equal(ok.status, "замечаний не найдено");
  assert.match(ok.disclaimer, /не юридическое заключение/);
});
await t("медтексты: медизделие, лекарство, медуслуга, формат номеров", async () => {
  const dev = await checkMedicalText({ text: "Тонометр автоматический. Регистрационное удостоверение РЗН 2019/8521 от 12.03.2019, бессрочно. Имеются противопоказания, ознакомьтесь с инструкцией по применению." });
  assert.equal(dev.kind, "device"); assert.equal(dev.status, "замечаний не найдено");
  const devNoDate = await checkMedicalText({ text: "Тонометр. РЗН 2019/8521. Перед применением проконсультируйтесь со специалистом." });
  assert.equal(devNoDate.recommendations.length, 2);
  const drug = await checkMedicalText({ text: "Препарат Х — рецептурный, отпускается по рецепту. Клинически доказана эффективность. ЛП-№(001234)-(РГ-RU)", channel: "ad" });
  assert.equal(drug.kind, "drug"); assert.ok(drug.problems.some((x) => x.includes("ч. 8"))); assert.ok(drug.risky_phrases.some((x) => x.basis.includes("п. 4")));
  const svc = await checkMedicalText({ text: "Стоматология — лучшие врачи города! Гарантируем результат. Приём врача от 1000 ₽.", channel: "ad" });
  assert.equal(svc.kind, "service"); assert.equal(svc.risky_phrases.length, 2); assert.equal(svc.problems.length, 1);
  const wrong = await checkMedicalText({ text: "БАД, свидетельство RU.77.99.32.003.R.001234.13.24. Не является лекарственным средством" });
  assert.ok(wrong.problems.some((x) => x.includes("месяц выдачи")));
  const unknown = await checkMedicalText({ text: "Отличная футболка из хлопка." });
  assert.equal(unknown.kind, null);
  const forced = await checkMedicalText({ text: "Отличная футболка из хлопка.", kind: "supplement" });
  assert.equal(forced.kind_source, "указан в запросе");
});

console.log(`\nALL PASSED (${passed})`);
