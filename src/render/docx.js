// DOCX счёта и акта (библиотека docx) — та же структура, что в PDF, чтобы документ можно было поправить в Word.
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, VerticalAlign, TableLayoutType,
} from "docx";
import { describeParty, shortName } from "../tools/documents.js";

const FONT = "Arial";
const PAGE_W = 10466; // ширина рабочей области A4 (11906) минус поля 2×720, в twip (1/20 pt)
const run = (t, o = {}) => new TextRun({ text: t, font: FONT, size: o.size ?? 18, bold: o.bold, color: o.color });
const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], alignment: o.align, spacing: { after: o.after ?? 0, before: o.before ?? 0 } });
const line = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const borders = { top: line, bottom: line, left: line, right: line };
const noBorders = { top: none, bottom: none, left: none, right: none };

function cell(content, w, o = {}) {
  const paras = (Array.isArray(content) ? content : [content]).map((c) => (c instanceof Paragraph ? c : para(run(String(c ?? ""), o), { align: o.align })));
  return new TableCell({
    children: paras, width: { size: w, type: WidthType.DXA }, borders: o.borders ?? borders, verticalAlign: o.valign ?? VerticalAlign.TOP,
    columnSpan: o.span, rowSpan: o.rowSpan, margins: { top: 40, bottom: 40, left: 60, right: 60 },
  });
}
const table = (rows, widths) => new Table({ rows, width: { size: PAGE_W, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED });

function bankBlock(s) {
  const w = [2750, 2750, 900, 4066];
  const small = (t) => para(run(t, { size: 14 }));
  return table([
    new TableRow({ children: [cell([para(run(s.bank_name)), small("Банк получателя")], w[0] + w[1], { span: 2, rowSpan: 2 }), cell("БИК", w[2]), cell(s.bik, w[3])] }),
    new TableRow({ children: [cell("Сч. №", w[2]), cell(s.corr_account || "", w[3])] }),
    new TableRow({ children: [cell(`ИНН ${s.inn || ""}`, w[0]), cell(s.isIp ? "" : `КПП ${s.kpp || ""}`, w[1]), cell("Сч. №", w[2], { rowSpan: 2 }), cell(s.account, w[3], { rowSpan: 2 })] }),
    new TableRow({ children: [cell([para(run(s.name)), small("Получатель")], w[0] + w[1], { span: 2 })] }),
  ], w);
}

function labeled(label, value) {
  const w = [2000, PAGE_W - 2000];
  return table([new TableRow({ children: [cell(label, w[0], { borders: noBorders }), cell(value, w[1], { borders: noBorders, bold: true })] })], w);
}

function itemsTable(d) {
  const w = [500, 0, 1000, 800, 1500, 1700];
  w[1] = PAGE_W - w.reduce((a, b) => a + b, 0);
  const head = ["№", d.kind === "act" ? "Наименование работ, услуг" : "Товары (работы, услуги)", "Кол-во", "Ед.", "Цена", "Сумма"];
  const al = [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.RIGHT];
  return table([
    new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, w[i], { bold: true, align: AlignmentType.CENTER })) }),
    ...d.items.map((it) => new TableRow({ children: [it.n, it.name, it.qty, it.unit, it.price, it.sum].map((v, i) => cell(String(v), w[i], { align: al[i] })) })),
  ], w);
}

function totals(d) {
  const rows = [["Итого:", d.subtotal]];
  if (!d.vat) rows.push(["Без налога (НДС)", "—"]);
  else rows.push([d.vat.included ? `В том числе НДС (${d.vat.rate}%):` : `НДС (${d.vat.rate}%):`, d.vat.amount]);
  rows.push([d.kind === "act" ? "Всего:" : "Всего к оплате:", d.total]);
  const w = [PAGE_W - 1700, 1700];
  return table(rows.map(([l, v]) => new TableRow({ children: [cell(l, w[0], { borders: noBorders, bold: true, align: AlignmentType.RIGHT }), cell(v, w[1], { borders: noBorders, bold: true, align: AlignmentType.RIGHT })] })), w);
}

const spacer = () => para(run("", { size: 8 }), { after: 40 });
const rule = () => new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000", space: 1 } }, spacing: { after: 160 }, children: [] });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function signatures(d) {
  const s = d.seller, b = d.buyer;
  const half = PAGE_W / 2;
  if (d.kind === "invoice") {
    const sig = (label, name) => para([run(`${label} `), run("______________ "), run(name || "")]);
    if (s.isIp) return [sig("Предприниматель", shortName(s.signer_name) || shortName(s.name.replace(/^ИП\s+/i, "")))];
    return [table([new TableRow({ children: [
      cell(sig(s.signer_position ? cap(s.signer_position) : "Руководитель", shortName(s.signer_name)), half, { borders: noBorders }),
      cell(sig("Бухгалтер", shortName(s.accountant_name || s.signer_name)), half, { borders: noBorders }),
    ] })], [half, half])];
  }
  const side = (title, p) => [
    para(run(title, { bold: true })),
    para(run(p.name)),
    para(run(p.signer_position ? cap(p.signer_position) : " "), { after: 240 }),
    para(run(`____________________ / ${shortName(p.signer_name) || (p.isIp ? shortName(p.name.replace(/^ИП\s+/i, "")) : "")} /`)),
    para(run("М.П.", { size: 14 })),
  ];
  return [table([new TableRow({ children: [cell(side("ИСПОЛНИТЕЛЬ", s), half, { borders: noBorders }), cell(side("ЗАКАЗЧИК", b), half, { borders: noBorders })] })], [half, half])];
}

export async function renderDocx(d) {
  const s = d.seller, b = d.buyer;
  const body = [];
  if (d.kind === "invoice") body.push(bankBlock(s), para(run(""), { after: 200 }));
  body.push(new Paragraph({ children: [run(d.title, { size: 28, bold: true })], border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000", space: 4 } }, spacing: { after: 160 } }));
  body.push(labeled(d.kind === "act" ? "Исполнитель:" : "Поставщик (Исполнитель):", describeParty(s)), spacer());
  body.push(labeled(d.kind === "act" ? "Заказчик:" : "Покупатель (Заказчик):", describeParty(b)), spacer());
  if (d.basis) body.push(labeled("Основание:", d.basis), spacer());
  body.push(itemsTable(d), para(run(""), { after: 80 }), totals(d));
  body.push(para(run(d.totalsLine), { before: 120 }), para(run(d.words, { bold: true }), { after: 120 }));
  if (d.kind === "act") body.push(para(run("Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет."), { after: 120 }));
  if (d.due) body.push(para(run(d.due.text), { after: 80 }));
  if (d.comment) body.push(para(run(d.comment), { after: 80 }));
  body.push(rule(), ...signatures(d));
  body.push(para(run("Сформировано сервисом «Xonta Документы» — mcp.xonta.ru", { size: 12, color: "888888" }), { before: 400, align: AlignmentType.RIGHT }));

  const doc = new Document({
    creator: "Xonta Документы — mcp.xonta.ru",
    title: d.title,
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 720, right: 720 } } }, children: body }],
  });
  return Packer.toBuffer(doc);
}
