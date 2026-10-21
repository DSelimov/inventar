import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import bwipjs from "bwip-js/node";
import PDFDocument from "pdfkit";

/** PDF документи (етикети, стокови разписки, справки). Шрифтът е DejaVu Sans Condensed — с кирилица. */
const FONTS = path.join(/* turbopackIgnore: true */ process.cwd(), "src", "assets", "fonts");
let fontCache: { regular: Buffer; bold: Buffer } | null = null;
const fonts = () => (fontCache ??= { regular: readFileSync(path.join(FONTS, "DejaVuSansCondensed.ttf")), bold: readFileSync(path.join(FONTS, "DejaVuSansCondensed-Bold.ttf")) });

export const mm = (v: number) => (v * 72) / 25.4;

export function createDoc(opts: { title: string; margin?: number; layout?: "portrait" | "landscape" }) {
  const doc = new PDFDocument({ size: "A4", layout: opts.layout ?? "portrait", margin: opts.margin ?? mm(15), info: { Title: opts.title, Producer: "Инвентар", Creator: "Инвентар" }, bufferPages: true });
  doc.registerFont("regular", fonts().regular);
  doc.registerFont("bold", fonts().bold);
  doc.font("regular");
  return doc;
}

/** Завършва документа и връща PDF отговор (inline — отваря се в браузъра). */
export async function pdfResponse(doc: PDFKit.PDFDocument, filename: string) {
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));
  doc.end();
  await done;
  const body = Buffer.concat(chunks);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Номер на страница в долния десен ъгъл на всяка страница (след като всичко е изрисувано). */
export function pageNumbers(doc: PDFKit.PDFDocument, footer: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - doc.page.margins.bottom + mm(5);
    const { left, right } = doc.page.margins;
    const width = doc.page.width - left - right;
    // временно без долно поле, иначе pdfkit добавя нова страница при писане под него
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("regular").fontSize(7).fillColor("#6b7280");
    doc.text(footer, left, bottom, { width, align: "left", lineBreak: false });
    doc.text(`Стр. ${i - range.start + 1} от ${range.count}`, left, bottom, { width, align: "right", lineBreak: false });
    doc.page.margins.bottom = saved;
  }
  doc.fillColor("black");
}

// ----------------------------------------------------------------- таблица
export type Column = { header: string; width: number; align?: "left" | "right" | "center"; bold?: boolean };

/** Таблица с повтаряне на заглавния ред на всяка нова страница. Ширините са в pt; последната колона запълва остатъка. */
export function table(doc: PDFKit.PDFDocument, columns: Column[], rows: string[][], opts: { fontSize?: number; zebra?: boolean } = {}) {
  const size = opts.fontSize ?? 8.5;
  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const fixed = columns.slice(0, -1).reduce((a, c) => a + c.width, 0);
  const widths = columns.map((c, i) => (i === columns.length - 1 ? Math.max(c.width, usable - fixed) : c.width));
  const pad = 3;

  const rowHeight = (cells: string[], font: string) => {
    doc.font(font).fontSize(size);
    return Math.max(...cells.map((t, i) => doc.heightOfString(t || " ", { width: widths[i] - pad * 2 }))) + pad * 2;
  };
  const drawRow = (cells: string[], y: number, h: number, header: boolean, shade: boolean) => {
    if (header) doc.rect(left, y, usable, h).fill("#eef2ff");
    else if (shade) doc.rect(left, y, usable, h).fill("#f9fafb");
    doc.fillColor(header ? "#3730a3" : "#111827");
    let x = left;
    cells.forEach((t, i) => {
      doc.font(header || columns[i].bold ? "bold" : "regular").fontSize(size);
      doc.text(t, x + pad, y + pad, { width: widths[i] - pad * 2, align: columns[i].align ?? "left" });
      x += widths[i];
    });
    doc.moveTo(left, y + h).lineTo(left + usable, y + h).lineWidth(0.4).strokeColor("#e5e7eb").stroke();
    doc.fillColor("black");
  };
  const headers = columns.map((c) => c.header);
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  let y = doc.y;
  let h = rowHeight(headers, "bold");
  drawRow(headers, y, h, true, false);
  y += h;
  rows.forEach((r, idx) => {
    const rh = rowHeight(r, "regular");
    if (y + rh > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
      h = rowHeight(headers, "bold");
      drawRow(headers, y, h, true, false);
      y += h;
    }
    drawRow(r, y, rh, false, Boolean(opts.zebra) && idx % 2 === 1);
    y += rh;
  });
  doc.x = left;
  doc.y = y + 6;
}

// ----------------------------------------------------------------- баркод
export function validEan(code: string) {
  if (!/^\d{8}$|^\d{13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** EAN-13/EAN-8 при валиден код, иначе Code 128. PNG с висока резолюция за печат. */
export async function barcodePng(code: string) {
  const bcid = validEan(code) ? (code.length === 13 ? "ean13" : "ean8") : "code128";
  return bwipjs.toBuffer({ bcid, text: code, scale: 4, height: 12, includetext: true, textsize: 9, textfont: "Helvetica" } as Parameters<typeof bwipjs.toBuffer>[0]);
}

// ----------------------------------------------------------------- заглавие
/** Фирмени данни горе вляво, заглавие и подзаглавие под тях. */
export function documentHeader(doc: PDFKit.PDFDocument, o: { company: { legalName: string; eik: string; vatNumber: string; address: string; phone: string }; orgName: string; title: string; subtitle?: string; right?: string[] }) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const top = doc.page.margins.top;
  doc.font("bold").fontSize(11).fillColor("#111827").text(o.company.legalName || o.orgName, left, top, { width: width * 0.6 });
  doc.font("regular").fontSize(8).fillColor("#4b5563");
  const lines = [o.company.address, [o.company.eik && `ЕИК ${o.company.eik}`, o.company.vatNumber && `ДДС № ${o.company.vatNumber}`].filter(Boolean).join(" · "), o.company.phone && `тел. ${o.company.phone}`].filter(Boolean);
  for (const l of lines) doc.text(l, { width: width * 0.6 });
  const afterCompany = doc.y;
  if (o.right?.length) {
    doc.font("regular").fontSize(8).fillColor("#4b5563");
    doc.text(o.right.join("\n"), left + width * 0.6, top, { width: width * 0.4, align: "right" });
  }
  doc.y = Math.max(afterCompany, doc.y) + mm(6);
  doc.x = left;
  doc.font("bold").fontSize(15).fillColor("#111827").text(o.title, left, doc.y, { width });
  if (o.subtitle) doc.font("regular").fontSize(9).fillColor("#4b5563").text(o.subtitle, { width });
  doc.fillColor("black");
  doc.moveDown(0.8);
}

/** QR код като data URL (PNG) — напр. за настройка на двуфакторна защита. */
export async function qrPngDataUrl(text: string) {
  const png = await bwipjs.toBuffer({ bcid: "qrcode", text, scale: 5, paddingwidth: 2, paddingheight: 2 } as Parameters<typeof bwipjs.toBuffer>[0]);
  return `data:image/png;base64,${png.toString("base64")}`;
}
