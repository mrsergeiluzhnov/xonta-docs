// PDF счёта и акта (pdfkit). Вёрстка повторяет привычные бланки: банковский блок, шапка, таблица, итоги, подписи.
import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeParty, shortName } from "../tools/documents.js";

const FONTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
const M = 40; // поля
const W = 595.28 - 2 * M; // ширина рабочей области A4

export function renderPdf(d) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margins: { top: M, bottom: M, left: M, right: M }, info: { Title: d.title, Producer: "Xonta Документы — mcp.xonta.ru", Creator: "mcp.xonta.ru" } });
    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.registerFont("R", path.join(FONTS, "LiberationSans-Regular.ttf"));
    pdf.registerFont("B", path.join(FONTS, "LiberationSans-Bold.ttf"));
    try {
      draw(pdf, d);
      pdf.end();
    } catch (e) {
      reject(e);
    }
  });
}

const bottom = (pdf) => pdf.page.height - M;

function ensure(pdf, h) {
  if (pdf.y + h > bottom(pdf)) { pdf.addPage(); return true; }
  return false;
}

function text(pdf, str, x, y, w, { font = "R", size = 9, align = "left" } = {}) {
  pdf.font(font).fontSize(size).text(str, x, y, { width: w, align });
}
const hOf = (pdf, str, w, font = "R", size = 9) => pdf.font(font).fontSize(size).heightOfString(str || " ", { width: w });

function cellBox(pdf, x, y, w, h) {
  pdf.lineWidth(0.6).rect(x, y, w, h).stroke();
}

// Банковский блок счёта (как в типовом бланке)
function bankBlock(pdf, s) {
  const c1 = 300, c2 = 55, c3 = W - c1 - c2, x0 = M;
  let y = pdf.y;
  const pad = 3;
  const bankH = Math.max(hOf(pdf, s.bank_name, c1 - 2 * pad) + 14, 30);
  // банк
  cellBox(pdf, x0, y, c1, bankH);
  text(pdf, s.bank_name, x0 + pad, y + pad, c1 - 2 * pad);
  text(pdf, "Банк получателя", x0 + pad, y + bankH - 11, c1 - 2 * pad, { size: 7 });
  cellBox(pdf, x0 + c1, y, c2, 15); text(pdf, "БИК", x0 + c1 + pad, y + 4, c2 - 2 * pad);
  cellBox(pdf, x0 + c1 + c2, y, c3, 15); text(pdf, s.bik, x0 + c1 + c2 + pad, y + 4, c3 - 2 * pad);
  cellBox(pdf, x0 + c1, y + 15, c2, bankH - 15); text(pdf, "Сч. №", x0 + c1 + pad, y + 19, c2 - 2 * pad);
  cellBox(pdf, x0 + c1 + c2, y + 15, c3, bankH - 15); text(pdf, s.corr_account || "", x0 + c1 + c2 + pad, y + 19, c3 - 2 * pad);
  y += bankH;
  // ИНН / КПП
  const half = c1 / 2;
  cellBox(pdf, x0, y, half, 15); text(pdf, `ИНН ${s.inn || ""}`, x0 + pad, y + 4, half - 2 * pad);
  cellBox(pdf, x0 + half, y, half, 15); text(pdf, s.isIp ? "" : `КПП ${s.kpp || ""}`, x0 + half + pad, y + 4, half - 2 * pad);
  const recH = Math.max(hOf(pdf, s.name, c1 - 2 * pad) + 14, 30);
  cellBox(pdf, x0 + c1, y, c2, 15 + recH); text(pdf, "Сч. №", x0 + c1 + pad, y + 4, c2 - 2 * pad);
  cellBox(pdf, x0 + c1 + c2, y, c3, 15 + recH); text(pdf, s.account, x0 + c1 + c2 + pad, y + 4, c3 - 2 * pad);
  y += 15;
  cellBox(pdf, x0, y, c1, recH);
  text(pdf, s.name, x0 + pad, y + pad, c1 - 2 * pad);
  text(pdf, "Получатель", x0 + pad, y + recH - 11, c1 - 2 * pad, { size: 7 });
  pdf.y = y + recH + 14;
}

function titleLine(pdf, title) {
  text(pdf, title, M, pdf.y, W, { font: "B", size: 14 });
  pdf.y += 4;
  pdf.lineWidth(1.5).moveTo(M, pdf.y).lineTo(M + W, pdf.y).stroke();
  pdf.y += 8;
}

function labeled(pdf, label, value) {
  const lw = 105;
  const h = Math.max(hOf(pdf, value, W - lw, "B"), hOf(pdf, label, lw));
  ensure(pdf, h + 6);
  const y = pdf.y;
  text(pdf, label, M, y, lw - 6);
  text(pdf, value, M + lw, y, W - lw, { font: "B" });
  pdf.y = y + h + 6;
}

function itemsTable(pdf, d) {
  const cols = [
    { k: "n", t: "№", w: 24, a: "center" },
    { k: "name", t: d.kind === "act" ? "Наименование работ, услуг" : "Товары (работы, услуги)", w: 0, a: "left" },
    { k: "qty", t: "Кол-во", w: 48, a: "right" },
    { k: "unit", t: "Ед.", w: 38, a: "left" },
    { k: "price", t: "Цена", w: 72, a: "right" },
    { k: "sum", t: "Сумма", w: 80, a: "right" },
  ];
  cols[1].w = W - cols.reduce((a, c) => a + c.w, 0);
  const pad = 3;
  const header = () => {
    const h = 18, y = pdf.y;
    let x = M;
    for (const c of cols) { pdf.lineWidth(1).rect(x, y, c.w, h).stroke(); text(pdf, c.t, x + pad, y + 5, c.w - 2 * pad, { font: "B", align: "center" }); x += c.w; }
    pdf.y = y + h;
  };
  pdf.y += 2;
  header();
  for (const it of d.items) {
    const h = Math.max(...cols.map((c) => hOf(pdf, String(it[c.k]), c.w - 2 * pad))) + 2 * pad;
    if (ensure(pdf, h)) header();
    let x = M;
    const y = pdf.y;
    for (const c of cols) { pdf.lineWidth(0.6).rect(x, y, c.w, h).stroke(); text(pdf, String(it[c.k]), x + pad, y + pad, c.w - 2 * pad, { align: c.a }); x += c.w; }
    pdf.y = y + h;
  }
  pdf.y += 6;
}

function totals(pdf, d) {
  const rows = [["Итого:", d.subtotal]];
  if (!d.vat) rows.push(["Без налога (НДС)", "—"]);
  else if (d.vat.included) rows.push([`В том числе НДС (${d.vat.rate}%):`, d.vat.amount]);
  else rows.push([`НДС (${d.vat.rate}%):`, d.vat.amount]);
  rows.push([d.kind === "act" ? "Всего:" : "Всего к оплате:", d.total]);
  ensure(pdf, rows.length * 14 + 10);
  for (const [l, v] of rows) {
    const y = pdf.y;
    text(pdf, l, M, y, W - 90, { font: "B", align: "right" });
    text(pdf, v, M + W - 85, y, 85, { font: "B", align: "right" });
    pdf.y = y + 14;
  }
  pdf.y += 6;
  ensure(pdf, 40);
  text(pdf, d.totalsLine, M, pdf.y, W);
  pdf.y += 2;
  text(pdf, d.words, M, pdf.y, W, { font: "B" });
  pdf.y += 8;
}

function sigLine(pdf, x, y, label, name, w) {
  const lw = Math.min(105, w * 0.4);
  text(pdf, label, x, y, lw);
  const lineX = x + lw + 4, lineW = w - lw - 4 - 82;
  pdf.lineWidth(0.6).moveTo(lineX, y + 10).lineTo(lineX + lineW, y + 10).stroke();
  text(pdf, name || "", lineX + lineW + 6, y, 76);
}

function draw(pdf, d) {
  const s = d.seller, b = d.buyer;
  if (d.kind === "invoice") bankBlock(pdf, s);
  titleLine(pdf, d.title);
  labeled(pdf, d.kind === "act" ? "Исполнитель:" : "Поставщик\n(Исполнитель):", describeParty(s));
  labeled(pdf, d.kind === "act" ? "Заказчик:" : "Покупатель\n(Заказчик):", describeParty(b));
  if (d.basis) labeled(pdf, "Основание:", d.basis);
  itemsTable(pdf, d);
  totals(pdf, d);

  if (d.kind === "act") {
    ensure(pdf, 40);
    text(pdf, "Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.", M, pdf.y, W);
    pdf.y += 6;
  }
  if (d.due) { ensure(pdf, 20); text(pdf, d.due.text, M, pdf.y, W); pdf.y += 4; }
  if (d.comment) { ensure(pdf, 20); text(pdf, d.comment, M, pdf.y, W); pdf.y += 4; }

  pdf.lineWidth(1.5).moveTo(M, pdf.y + 4).lineTo(M + W, pdf.y + 4).stroke();
  pdf.y += 22;

  if (d.kind === "invoice") {
    ensure(pdf, 50);
    const y = pdf.y;
    if (s.isIp) sigLine(pdf, M, y, "Предприниматель", shortName(s.signer_name) || shortName(s.name.replace(/^ИП\s+/i, "")), W / 2 - 10);
    else {
      const half = W / 2 - 10;
      sigLine(pdf, M, y, s.signer_position ? cap(s.signer_position) : "Руководитель", shortName(s.signer_name), half);
      sigLine(pdf, M + W / 2 + 10, y, "Бухгалтер", shortName(s.accountant_name || s.signer_name), half);
    }
    pdf.y = y + 30;
  } else {
    ensure(pdf, 90);
    const y = pdf.y, half = W / 2 - 10;
    const side = (x, title, p) => {
      text(pdf, title, x, y, half, { font: "B" });
      text(pdf, p.name, x, y + 14, half);
      const posY = y + 16 + hOf(pdf, p.name, half);
      if (p.signer_position) text(pdf, cap(p.signer_position), x, posY, half);
      const ly = posY + 26;
      pdf.lineWidth(0.6).moveTo(x, ly).lineTo(x + 110, ly).stroke();
      text(pdf, `/ ${shortName(p.signer_name) || (p.isIp ? shortName(p.name.replace(/^ИП\s+/i, "")) : "")} /`, x + 116, ly - 10, half - 116);
      text(pdf, "М.П.", x, ly + 6, 40, { size: 7 });
    };
    side(M, "ИСПОЛНИТЕЛЬ", s);
    side(M + W / 2 + 10, "ЗАКАЗЧИК", b);
    pdf.y = y + 100;
  }
  // подвал
  pdf.font("R").fontSize(6.5).fillColor("#888").text("Сформировано сервисом «Xonta Документы» — mcp.xonta.ru", M, bottom(pdf) - 8, { width: W, align: "right", lineBreak: false });
  pdf.fillColor("#000");
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
