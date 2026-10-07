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

console.log(`\nALL PASSED (${passed})`);
