// Распознавание российских документов (счёт, акт, УПД, счёт-фактура, договор, накладная) из PDF или DOCX
// с текстовым слоем: тип, номер и дата, стороны, реквизиты, итоги, НДС, позиции. Реквизиты проверяются
// по контрольным суммам. Правила, а не нейросеть: результат предсказуем, но разбирается «как получилось» —
// поля, которые не нашлись, возвращаются пустыми, а не выдумываются.
import mammoth from "mammoth";
import { getDocumentProxy } from "unpdf";
import { download } from "../fetch.js";
import { checkInn, checkKpp, checkOgrn, checkBik, checkAccount } from "./requisites.js";

const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const MAX_FILE = 10 * 1024 * 1024;
const MONTHS = { январ: 1, феврал: 2, март: 3, апрел: 4, ма: 5, июн: 6, июл: 7, август: 8, сентябр: 9, октябр: 10, ноябр: 11, декабр: 12 };

// ---------- текст из файла ----------
async function pdfLines(buf) {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const lines = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 30); p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x, w: it.width || 0, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      let line = "", end = null;
      for (const pt of r.parts) {
        if (end != null) line += pt.x - end > 9 ? " | " : pt.x - end > 1 ? " " : "";
        line += pt.s;
        end = pt.x + pt.w;
      }
      lines.push(line.trim());
    }
  }
  return { lines, pages: pdf.numPages };
}

const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
async function docxLines(buf) {
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  const text = decode(
    html
      .replace(/<\/p>\s*(?=<\/td>)/g, " ")
      .replace(/<\/(td|th)>/g, " | ")
      .replace(/<\/(p|tr|h\d|li)>/g, "\n")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );
  return { lines: text.split("\n").map((l) => l.replace(/\s*\|\s*$/, "").replace(/\s+/g, " ").trim()).filter(Boolean), pages: null };
}

async function loadFile(args) {
  let buf, name = String(args.filename || ""), ctype = "";
  if (args.url) {
    const r = await download(String(args.url));
    buf = r.buf; ctype = r.contentType; name ||= decodeURIComponent(new URL(r.finalUrl).pathname.split("/").pop() || "");
  } else if (args.base64) {
    buf = Buffer.from(String(args.base64).replace(/^data:[^,]+,/, ""), "base64");
  } else throw bad("Передайте url (ссылка на PDF или DOCX) или base64 с содержимым файла и filename");
  if (!buf.length) throw bad("Файл пустой");
  if (buf.length > MAX_FILE) throw bad("Файл больше 10 МБ", 413);
  const isPdf = buf.subarray(0, 5).toString() === "%PDF-" || /pdf/i.test(ctype) || /\.pdf$/i.test(name);
  const isDocx = buf.subarray(0, 2).toString() === "PK" && (!/\.(xlsx|pptx|zip)$/i.test(name));
  if (isPdf) return { ...(await pdfLines(buf)), format: "pdf" };
  if (isDocx) return { ...(await docxLines(buf)), format: "docx" };
  throw bad("Поддерживаются PDF и DOCX. Старый формат .doc и картинки пока не распознаются", 415);
}

// ---------- разбор ----------
const money = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/[\s ]/g, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t).toFixed(2) : null;
};
const MONEY_RE = String.raw`(\d{1,3}(?:[  ]\d{3})+(?:[.,]\d{2})|\d+(?:[.,]\d{2}))`;

function parseDate(s) {
  if (!s) return null;
  let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (m) {
    const key = Object.keys(MONTHS).sort((a, b) => b.length - a.length).find((k) => m[2].toLowerCase().startsWith(k));
    if (key) return `${m[3]}-${String(MONTHS[key]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

const TYPES = [
  ["invoice_factura", /сч[её]т[\s-]*фактур/i, "Счёт-фактура"],
  ["upd", /универсальн[а-яё]* передаточн[а-яё]* документ|(?<![а-яё])УПД(?![а-яё])/iu, "УПД"],
  ["invoice", /сч[её]т на оплату|сч[её]т\s*№/i, "Счёт на оплату"],
  ["act", /(?<![а-яё])акт(?![а-яё])/iu, "Акт"],
  ["waybill", /товарн[а-яё]* накладн|ТОРГ-12/iu, "Товарная накладная"],
  ["contract", /(?<![а-яё])договор(?![а-яё])/iu, "Договор"],
];

function detectHeader(text) {
  const re = /(сч[её]т[\s-]*фактура|сч[её]т на оплату|сч[её]т|универсальный передаточный документ|акт[а-яё ,()]*?|договор[а-яё ]*?|товарная накладная)\s*№\s*([A-Za-zА-Яа-я0-9\/\-_.]+)\s*от\s*(«?\d{1,2}»?\s*[а-яё]+\s*\d{4}|\d{1,2}\.\d{1,2}\.\d{4})/i;
  const m = text.match(re);
  let type = null;
  const scope = m ? m[1] : text.slice(0, 600);
  for (const [code, rx, title] of TYPES) if (rx.test(scope)) { type = { code, title }; break; }
  if (!type) for (const [code, rx, title] of TYPES) if (rx.test(text.slice(0, 3000))) { type = { code, title }; break; }
  // УПД: заголовок «Универсальный передаточный документ» стоит над строкой «Счёт-фактура № …»
  if (/универсальн[а-яё]* передаточн[а-яё]* документ|(?<![а-яё])УПД(?![а-яё])/iu.test(text.slice(0, 400))) type = { code: "upd", title: "УПД" };
  let number = m ? m[2].replace(/[.,]$/, "") : null;
  let date = m ? parseDate(m[3].replace(/[«»]/g, "")) : null;
  if (!number) number = (text.slice(0, 600).match(/№\s*([A-Za-zА-Яа-я0-9\/\-_.]+)/) || [])[1]?.replace(/[.,]$/, "") || null;
  if (!date) date = parseDate((text.slice(0, 600).match(/(«?\d{1,2}»?\s+[а-яё]+\s+\d{4}|\d{1,2}\.\d{1,2}\.\d{4})/i) || [])[1]?.replace(/[«»]/g, ""));
  return { type, number, date, header: m ? m[0].replace(/\s+/g, " ") : null };
}

const SELLER = ["Поставщик", "Продавец", "Исполнитель", "Подрядчик", "Арендодатель", "Получатель"];
const BUYER = ["Покупатель", "Заказчик", "Плательщик", "Арендатор", "Грузополучатель"];
const ALL_LABELS = [...SELLER, ...BUYER, "Основание", "Грузоотправитель", "Итого", "Всего"];

function partyFrom(text, labels) {
  for (const label of labels) {
    const re = new RegExp(`(?:^|\\n|\\|\\s*)${label}(?:\\s*\\([^)]{0,40}\\))?\\s*[:\\n|]\\s*`, "i");
    const m = re.exec(text);
    if (!m) continue;
    const start = m.index + m[0].length;
    let end = Math.min(text.length, start + 500);
    for (const other of ALL_LABELS) {
      if (other === label) continue;
      const om = new RegExp(`(?:^|\\n|\\|\\s*)${other}(?:\\s*\\([^)]{0,40}\\))?\\s*[:\\n]`, "i").exec(text.slice(start));
      if (om && start + om.index < end) end = start + om.index;
    }
    const seg = text.slice(start, end).replace(/^[\s|:]+/, "");
    const p = { label, name: null, inn: null, kpp: null, ogrn: null, address: null };
    const nm = seg.match(/^\s*([^,\n|]+?)(?=\s*,|\s+ИНН|\n|\||$)/);
    if (nm && !/^(ИНН|КПП)/i.test(nm[1])) p.name = nm[1].trim();
    const ik = seg.match(/ИНН\s*\/\s*КПП[^\d\n]{0,30}(\d{10}|\d{12})\s*\/\s*(\d{9})/i);
    if (ik) { p.inn = ik[1]; p.kpp = ik[2]; }
    p.inn ||= (seg.match(/ИНН[:\s]*(\d{12}|\d{10})(?!\d)/i) || [])[1] || null;
    p.kpp ||= (seg.match(/КПП[:\s]*(\d{9})(?!\d)/i) || [])[1] || null;
    p.ogrn = (seg.match(/ОГРН(?:ИП)?[:\s]*(\d{15}|\d{13})(?!\d)/i) || [])[1] || null;
    const addr = seg.match(/(?:адрес[:\s]*)?((?:(?<!\d)\d{6},\s*)?(?:г\.|город|обл\.|область|респ\.|край|пос\.)[^\n|]{3,200}?)(?=,\s*(?:тел|e-mail|р\/с|ИНН)|\n|\||$)/i);
    if (addr) p.address = addr[1].trim().replace(/,$/, "");
    if (!p.address) {
      const pc = seg.match(/(?<!\d)(\d{6},\s*[^\n|]{5,200}?)(?=,\s*(?:тел|e-mail|р\/с|ИНН)|\n|\||$)/i);
      if (pc) p.address = pc[1].trim();
    }
    if (p.name || p.inn) return p;
  }
  return null;
}

function bankFrom(text) {
  const bik = (text.match(/БИК[:\s|]*(\d{9})(?!\d)/i) || [])[1] || null;
  const accounts = [...new Set((text.match(/(?<!\d)\d{20}(?!\d)/g) || []))];
  const corr = accounts.find((a) => a.startsWith("301")) || null;
  const settlement = accounts.find((a) => /^40[5-8]/.test(a)) || accounts.find((a) => !a.startsWith("301")) || null;
  let bankName = (text.match(/(?:^|\n|\|\s*)((?:ПАО|АО|ООО|КБ|АКБ|Банк)[^\n|]{2,80}?(?:банк|Банк|БАНК)[^\n|]{0,60}?)(?=\s*(?:\||\n|Банк получателя|БИК))/) || [])[1]
    || (text.match(/(?:^|\n|\|\s*)([^\n|]{3,80}?(?:Сбербанк|Т-Банк|Тинькофф|Альфа-Банк|ВТБ|Точка|Модульбанк|Райффайзен|Газпромбанк|Открытие|Совкомбанк)[^\n|]{0,60})/i) || [])[1] || null;
  if (bankName) bankName = bankName.replace(/\s*Банк получателя.*/i, "").trim();
  return { bank_name: bankName, bik, account: settlement, corr_account: corr };
}

function totalsFrom(text) {
  const g = (re) => (text.match(re) || []);
  const subtotal = money(g(new RegExp(`Итого[^\\d\\n]{0,25}?${MONEY_RE}`, "i"))[1]);
  const total = money(g(new RegExp(`(?:Всего к оплате|Итого к оплате|Всего с НДС|Всего)[^\\d\\n]{0,25}?${MONEY_RE}`, "i"))[1]);
  let vat = null;
  const v1 = g(new RegExp(`(?:в\\s+том\\s+числе|в\\s+т\\.\\s?ч\\.)\\s+НДС\\s*\\(?\\s*(\\d{1,2})\\s*%\\s*\\)?[^\\d\\n]{0,10}?${MONEY_RE}`, "i"));
  const v2 = g(new RegExp(`НДС\\s*\\(?\\s*(\\d{1,2})\\s*%\\s*\\)?[:\\s|]*${MONEY_RE}`, "i"));
  const v0 = g(new RegExp(`(?:в\\s+том\\s+числе|в\\s+т\\.\\s?ч\\.)\\s+НДС[^\\d\\n%]{0,15}${MONEY_RE}`, "i"));
  if (v1.length) vat = { rate: Number(v1[1]), included: true, amount: money(v1[2]) };
  else if (v0.length) vat = { rate: null, included: true, amount: money(v0[1]) };
  else if (v2.length) vat = { rate: Number(v2[1]), included: null, amount: money(v2[2]) };
  else if (/без\s+(налога\s*\(?НДС\)?|НДС)/i.test(text)) vat = "без НДС";
  const words = (text.match(/([А-ЯЁ][а-яё]+(?:\s+[а-яё]+)*\s+рубл[ьяей]+\s+\d{2}\s+копе[а-яё]+)/) || [])[1] || null;
  // УПД: «Всего к оплате | сумма без НДС | НДС | сумма с НДС»
  const upd = text.match(new RegExp(`Всего к оплате[^\\d\\n]*${MONEY_RE}\\s*\\|\\s*${MONEY_RE}\\s*\\|\\s*${MONEY_RE}`, "i"));
  if (upd) return { subtotal: money(upd[1]), total: money(upd[3]), vat: { rate: null, included: false, amount: money(upd[2]) }, total_words: words };
  // ставка не указана — восстанавливаем, если сумма точно соответствует стандартной ставке
  if (vat && typeof vat === "object" && vat.rate == null && vat.amount && (total || subtotal)) {
    const T = Math.round(Number(total || subtotal) * 100), V = Math.round(Number(vat.amount) * 100);
    const r = [22, 20, 10, 7, 5].find((x) => Math.abs(Math.round((T * x) / (100 + x)) - V) <= 1);
    if (r) { vat.rate = r; vat.rate_inferred = true; }
  }
  return { subtotal, total: total || subtotal, vat, total_words: words };
}

// Запасной разбор: ячейки склеены пробелами, длинное название перенесено на соседние строки
const ITEM_LOOSE = new RegExp(`^(\\d{1,3})\\s+(?:(.+?)\\s+)?(\\d+(?:[.,]\\d+)?)\\s+([а-яёa-z.²³]{1,8})\\s+${MONEY_RE}\\s+${MONEY_RE}$`, "i");
const NOT_NAME = /^(№|итого|всего|в том числе|без налога|наименование|товары)/i;
function itemsLoose(lines) {
  const items = [];
  lines.forEach((raw, i) => {
    const l = raw.replace(/\s*\|\s*/g, " ").trim();
    const m = l.match(ITEM_LOOSE);
    if (!m) return;
    let name = m[2] || "";
    if (!name) {
      const prev = (lines[i - 1] || "").replace(/\s*\|\s*/g, " ").trim();
      const next = (lines[i + 1] || "").replace(/\s*\|\s*/g, " ").trim();
      if (prev && !ITEM_LOOSE.test(prev) && !NOT_NAME.test(prev)) name = prev;
      if (next && next.length < 40 && !ITEM_LOOSE.test(next) && !NOT_NAME.test(next) && !/\d[ \u00a0]?\d{3}[,.]\d{2}/.test(next)) name = `${name} ${next}`.trim();
    }
    items.push({ n: Number(m[1]), name: name || null, quantity: m[3].replace(",", "."), unit: m[4], price: money(m[5]), sum: money(m[6]) });
  });
  return items;
}

function itemsFrom(lines) {
  const strict = itemsStrict(lines);
  return strict.length ? strict : itemsLoose(lines);
}

function itemsStrict(lines) {
  const items = [];
  for (const l of lines) {
    if (!l.includes("|")) continue;
    const c = l.split("|").map((x) => x.trim()).filter((x) => x !== "");
    if (c.length < 4 || !/^\d{1,3}$/.test(c[0])) continue;
    let sum = money(c[c.length - 1]), price = money(c[c.length - 2]);
    if (!sum || !price) continue;
    let mid = c.slice(2, c.length - 2), withVat = null;
    const rateIdx = c.findIndex((x) => /^\d{1,2}\s*%$|^без НДС$/i.test(x));
    if (rateIdx > 3) {
      // строка УПД/счёта-фактуры: … цена | стоимость без НДС | акциз | ставка | НДС | стоимость с НДС
      const before = c.slice(2, rateIdx).filter((x) => money(x));
      if (before.length >= 2) {
        price = money(before[before.length - 2]);
        sum = money(before[before.length - 1]); // стоимость без НДС
        withVat = money(c[c.length - 1]);
        mid = c.slice(2, c.indexOf(before[before.length - 2]));
      }
    }
    let qty = null, unit = null;
    for (const x of mid) {
      const both = x.match(/^(\d+(?:[.,]\d+)?)\s+([а-яёa-z.²³]{1,10})$/i); // «1 усл.» в одной ячейке
      if (both) { qty = both[1]; unit = both[2]; break; }
      if (/^\d+([.,]\d+)?$/.test(x.replace(/\s/g, ""))) qty = x.replace(/\s/g, ""); // берём последнее число перед ценой (код ОКЕИ идёт раньше)
      else if (unit == null && /^[а-яёa-z.²³ ]{1,10}$/i.test(x)) unit = x;
    }
    items.push({ n: Number(c[0]), name: c[1], quantity: qty ? qty.replace(",", ".") : null, unit, price, sum, ...(withVat ? { sum_with_vat: withVat } : {}) });
  }
  return items;
}

function validate(res) {
  const issues = [], checks = {};
  const chk = (path, r) => { checks[path] = r.valid === false ? `ошибка: ${r.error}` : r.valid ? "верно" : "не проверено"; if (r.valid === false) issues.push(`${path}: ${r.error}`); };
  for (const side of ["seller", "buyer"]) {
    const p = res[side];
    if (!p) continue;
    if (p.inn) chk(`${side}.inn`, checkInn(p.inn));
    if (p.kpp) chk(`${side}.kpp`, checkKpp(p.kpp));
    if (p.ogrn) chk(`${side}.ogrn`, checkOgrn(p.ogrn));
  }
  const b = res.bank;
  if (b.bik) chk("bank.bik", checkBik(b.bik));
  if (b.account && b.bik) chk("bank.account", checkAccount(b.account, b.bik));
  if (b.corr_account && b.bik) chk("bank.corr_account", checkAccount(b.corr_account, b.bik, { corr: true }));
  if (res.items.length && res.totals.subtotal) {
    const s = res.items.reduce((a, x) => a + Math.round(Number(x.sum) * 100), 0);
    const ok = s === Math.round(Number(res.totals.subtotal) * 100);
    checks["items_sum"] = ok ? "сумма позиций совпадает с итогом" : `сумма позиций ${(s / 100).toFixed(2)} не совпадает с итогом ${res.totals.subtotal}`;
    if (!ok) issues.push(checks["items_sum"]);
  }
  const v = res.totals.vat;
  if (v && typeof v === "object" && v.included && v.rate && v.amount && res.totals.total) {
    const expect = Math.round((Number(res.totals.total) * 100 * v.rate) / (100 + v.rate));
    const ok = Math.abs(expect - Math.round(Number(v.amount) * 100)) <= 1;
    checks["vat"] = ok ? "НДС рассчитан верно" : `НДС ${v.amount} не равен ${(expect / 100).toFixed(2)} (${v.rate}% «в том числе» от ${res.totals.total})`;
    if (!ok) issues.push(checks["vat"]);
  }
  return { checks, issues };
}

export async function parseDocument(args) {
  const { lines, pages, format } = await loadFile(args);
  const out = analyzeLines(lines);
  out.source = { format, pages, lines: lines.length };
  if (args.include_text === true) out.text = lines.join("\n").slice(0, 20000);
  return out;
}

export function analyzeLines(lines) {
  const text = lines.join("\n");
  if (text.replace(/\s/g, "").length < 40)
    throw bad("В файле почти нет текста — похоже, это скан или фотография. Распознавание сканов пока не поддерживается: нужен PDF с текстовым слоем или DOCX.", 422);

  const head = detectHeader(text);
  const res = {
    type: head.type?.code || "unknown",
    type_title: head.type?.title || "Не определён",
    number: head.number,
    date: head.date,
    seller: partyFrom(text, SELLER),
    buyer: partyFrom(text, BUYER),
    basis: (text.match(/Основание[:\s|]*([^\n|]{3,200})/i) || [])[1]?.trim() || null,
    bank: bankFrom(text),
    totals: totalsFrom(text),
    items: itemsFrom(lines),
  };
  // если продавец не нашёлся по меткам, но в банковском блоке есть ИНН получателя — берём оттуда
  if (!res.seller) {
    const inn = (text.match(/ИНН[:\s]*(\d{12}|\d{10})(?!\d)/) || [])[1];
    if (inn) res.seller = { label: "Получатель (банковский блок)", name: null, inn, kpp: (text.match(/КПП[:\s]*(\d{9})/) || [])[1] || null, ogrn: null, address: null };
  }
  const { checks, issues } = validate(res);
  const found = ["number", "date"].filter((k) => res[k]).length + (res.seller?.inn ? 1 : 0) + (res.buyer?.inn ? 1 : 0) + (res.totals.total ? 1 : 0);
  return {
    ...res,
    checks,
    issues,
    confidence: found >= 5 ? "high" : found >= 3 ? "medium" : "low",
    note: "Поля разобраны по правилам из текста документа; не найденные поля возвращаются пустыми (null). Проверьте результат перед использованием в учёте. Реквизиты проверены по контрольным суммам, а не по ЕГРЮЛ.",
  };
}
