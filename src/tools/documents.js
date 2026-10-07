// Счёт на оплату и акт оказанных услуг: проверка реквизитов, расчёт сумм и НДС, сумма прописью,
// срок оплаты по производственному календарю, выдача PDF и DOCX по ссылке.
import { checkInn, checkKpp, checkOgrn, checkBik, checkAccount } from "./requisites.js";
import { toMinorUnits, moneyWords, plural } from "./words.js";
import { workingDays } from "./calendar.js";
import { renderPdf } from "../render/pdf.js";
import { renderDocx } from "../render/docx.js";
import { saveFile } from "../files.js";

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const s = (v, max = 300) => (v == null ? "" : String(v).trim().slice(0, max));

export function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y} г.`;
}
export function fmtMoney(minor) {
  const neg = minor < 0n;
  const a = neg ? -minor : minor;
  const int = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${int},${String(a % 100n).padStart(2, "0")}`;
}
function fmtQty(milli) {
  const int = milli / 1000n, frac = milli % 1000n;
  return frac ? `${int},${String(frac).padStart(3, "0").replace(/0+$/, "")}` : `${int}`;
}

function parseDate(v) {
  if (!v) {
    const n = new Date(Date.now() + 3 * 3600 * 1000);
    return n.toISOString().slice(0, 10);
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw bad("date: укажите дату в формате ГГГГ-ММ-ДД или ДД.ММ.ГГГГ");
}

// «Иванов Иван Петрович» → «Иванов И. П.»
export function shortName(full) {
  const w = s(full).split(/\s+/).filter(Boolean);
  if (w.length < 2) return w[0] || "";
  return `${w[0]}\u00a0${w.slice(1).map((x) => x[0].toUpperCase() + ".").join("\u00a0")}`;
}

function party(p, role, { needBank }) {
  if (!p || typeof p !== "object") throw bad(`${role}: передайте объект с реквизитами (name, inn, …)`);
  const r = {
    name: s(p.name, 300), inn: s(p.inn, 12).replace(/\s/g, ""), kpp: s(p.kpp, 9).replace(/\s/g, ""), ogrn: s(p.ogrn, 15).replace(/\s/g, ""),
    address: s(p.address, 400), phone: s(p.phone, 60),
    bank_name: s(p.bank_name, 200), bik: s(p.bik, 9).replace(/\s/g, ""), account: s(p.account, 20).replace(/\s/g, ""), corr_account: s(p.corr_account, 20).replace(/\s/g, ""),
    signer_name: s(p.signer_name, 120), signer_position: s(p.signer_position, 120), accountant_name: s(p.accountant_name, 120),
  };
  if (!r.name) throw bad(`${role}.name: укажите наименование, например «ООО «Ромашка»» или «ИП Иванов Иван Петрович»`);
  const errors = [];
  const chk = (field, res) => { if (res.valid === false) errors.push(`${role}.${field}: ${res.error}`); };
  if (r.inn) chk("inn", checkInn(r.inn));
  if (r.kpp) chk("kpp", checkKpp(r.kpp));
  if (r.ogrn) chk("ogrn", checkOgrn(r.ogrn));
  if (needBank) {
    for (const f of ["bank_name", "bik", "account"]) if (!r[f]) errors.push(`${role}.${f}: для счёта на оплату нужны банковские реквизиты получателя (bank_name, bik, account, желательно corr_account)`);
  }
  if (r.bik) chk("bik", checkBik(r.bik));
  if (r.account && r.bik) chk("account", checkAccount(r.account, r.bik));
  if (r.corr_account && r.bik) chk("corr_account", checkAccount(r.corr_account, r.bik, { corr: true }));
  r.isIp = r.inn.length === 12 || /^ИП\s/i.test(r.name) || /индивидуальный предприниматель/i.test(r.name);
  return { party: r, errors };
}

export function describeParty(p) {
  return [p.name, p.inn && `ИНН ${p.inn}`, p.kpp && `КПП ${p.kpp}`, p.ogrn && `${p.ogrn.length === 15 ? "ОГРНИП" : "ОГРН"} ${p.ogrn}`, p.address, p.phone && `тел.: ${p.phone}`]
    .filter(Boolean).join(", ");
}

function parseQty(v) {
  const t = String(v ?? 1).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(t) || Number(t) <= 0) throw bad(`quantity «${v}»: положительное число, до 3 знаков после запятой`);
  const [i, f = ""] = t.split(".");
  return BigInt(i) * 1000n + BigInt((f + "000").slice(0, 3));
}

const divRound = (a, b) => (a * 2n + b) / (2n * b);

export function computeDoc(args, kind) {
  const number = s(args.number, 40);
  if (!number) throw bad("number: укажите номер документа");
  const date = parseDate(args.date);
  const seller = party(args.seller, "seller", { needBank: kind === "invoice" });
  const buyer = party(args.buyer, "buyer", { needBank: false });
  const errors = [...seller.errors, ...buyer.errors];
  if (errors.length) throw bad(`Документ не сформирован, исправьте реквизиты: ${errors.join("; ")}`);

  if (!Array.isArray(args.items) || !args.items.length) throw bad("items: передайте список позиций [{name, quantity, unit, price}]");
  if (args.items.length > 100) throw bad("items: не больше 100 позиций");
  const items = args.items.map((it, i) => {
    const name = s(it?.name, 500);
    if (!name) throw bad(`items[${i}].name: укажите наименование`);
    const qty = parseQty(it.quantity);
    const price = toMinorUnits(it.price);
    if (price < 0n) throw bad(`items[${i}].price: цена не может быть отрицательной`);
    const sum = divRound(price * qty, 1000n);
    return { n: i + 1, name, qty: fmtQty(qty), unit: s(it.unit, 20) || (kind === "act" ? "усл." : "шт."), price: fmtMoney(price), sum: fmtMoney(sum), sumMinor: sum };
  });
  const subtotal = items.reduce((a, x) => a + x.sumMinor, 0n);

  // НДС на итог документа
  const vatRaw = String(args.vat_rate ?? "").trim().toLowerCase();
  let vat = null, total = subtotal;
  if (vatRaw && !/^(none|без ндс|без|no|нет)$/.test(vatRaw)) {
    const rate = Number(vatRaw.replace("%", "").replace(",", "."));
    if (!(rate >= 0 && rate <= 100)) throw bad("vat_rate: ставка НДС в процентах (22, 20, 10, 7, 5, 0) или «без НДС»");
    const r = BigInt(Math.round(rate * 100));
    const included = args.vat_included !== false;
    const amount = included ? divRound(subtotal * r, 10000n + r) : divRound(subtotal * r, 10000n);
    if (!included) total = subtotal + amount;
    vat = { rate, included, amount: fmtMoney(amount), amountMinor: amount };
  }
  const words = moneyWords(total, "RUB", "digits").words;
  const count = items.length;
  const totalsLine = kind === "act"
    ? `Всего оказано услуг ${count}, на сумму ${fmtMoney(total)} руб.`
    : `Всего наименований ${count}, на сумму ${fmtMoney(total)} руб.`;

  return {
    kind, number, date, dateText: fmtDate(date),
    title: kind === "act" ? `Акт № ${number} от ${fmtDate(date)}` : `Счёт на оплату № ${number} от ${fmtDate(date)}`,
    seller: seller.party, buyer: buyer.party, basis: s(args.basis, 300), comment: s(args.comment, 1000),
    items, subtotal: fmtMoney(subtotal), vat, total: fmtMoney(total), totalMinor: total, words, totalsLine,
  };
}

const translit = (t) => {
  const map = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
  return t.toLowerCase().split("").map((c) => map[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
};

async function produce(args, kind) {
  const doc = computeDoc(args, kind);
  if (kind === "invoice" && args.payment_due_working_days != null && args.payment_due_working_days !== "") {
    const n = Number(args.payment_due_working_days);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw bad("payment_due_working_days: целое число от 1 до 365");
    const due = await workingDays({ date: doc.date, add_working_days: n });
    doc.due = { date: due.result_date, text: `Оплатить не позднее ${fmtDate(due.result_date)} (${n} ${plural(n, ["рабочий день", "рабочих дня", "рабочих дней"])} с даты счёта).` };
  }
  const fmt = ["pdf", "docx", "both"].includes(args.format) ? args.format : "pdf";
  const base = translit(`${kind === "act" ? "akt" : "schet"}-${doc.number}-ot-${doc.date}`);
  const files = [];
  const raw = {};
  if (fmt === "pdf" || fmt === "both") { raw.pdf = await renderPdf(doc); files.push(await saveFile(raw.pdf, "pdf", base)); }
  if (fmt === "docx" || fmt === "both") { raw.docx = await renderDocx(doc); files.push(await saveFile(raw.docx, "docx", base)); }

  const res = {
    document: doc.title,
    seller: doc.seller.name,
    buyer: doc.buyer.name,
    items: doc.items.length,
    total: doc.total.replace(/ /g, " "),
    vat: doc.vat ? { rate: doc.vat.rate, included: doc.vat.included, amount: doc.vat.amount.replace(/ /g, " ") } : "без НДС",
    total_words: doc.words,
    ...(doc.due ? { payment_due: doc.due.date } : {}),
    files,
    note: "Ссылки действуют 24 часа. Документ сформирован по данным запроса — проверьте реквизиты перед отправкой. Подпись и печать ставятся вручную или через ЭДО.",
  };
  if (args.include_base64 === true) res.base64 = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.toString("base64")]));
  return res;
}

export const makeInvoice = (args) => produce(args, "invoice");
export const makeAct = (args) => produce(args, "act");
