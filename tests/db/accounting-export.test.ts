import { beforeAll, describe, expect, it, vi } from "vitest";
import { partners } from "@/db/tenant-schema";
import { DEFAULT_FORMAT, encodeCsv, purchaseExportRows, readFormat, salesExportRows, SALES_COLUMNS } from "@/lib/accounting-export";
import { localTodayIso } from "@/lib/dates";
import { decodeText } from "@/lib/encoding";
import { cancelInvoice, createDraft, draftNoteFor, issueInvoice, saveDraft } from "@/lib/invoicing";
import { setSetting } from "@/lib/settings";
import { closeConnectionsAfterAll, createTenant, type TestTenant } from "../support/fixtures";

vi.mock("@/lib/webhooks", () => ({ emit: vi.fn() }));
closeConnectionsAfterAll();

const actor = { id: 1, name: "Тест" };
let t: TestTenant;
let partnerId: number;
beforeAll(async () => {
  t = await createTenant("accx");
  for (const [k, v] of Object.entries({ legalName: "Демо ЕООД", eik: "123456786", vatNumber: "BG123456786", address: "София" })) await setSetting(t.db, `company.${k}`, v);
  [{ id: partnerId }] = await t.db.insert(partners).values({ name: "Клиент; ООД", address: "Варна", eik: "205123457", vatNumber: "BG205123457", vatRegistered: true }).$returningId();
});

describe("файл за счетоводна програма", () => {
  it("ред на документ и ставка; кредитното известие с минус и връзка към фактурата; анулираната с нули", async () => {
    const today = localTodayIso();
    const a = await createDraft(t.db, { kind: "invoice", partnerId, currency: "EUR", lines: [{ description: "Стока", quantity: 2, unit: "бр.", unitPrice: 50 }] }, "Тест");
    await issueInvoice(t.db, a, actor);
    const credit = await draftNoteFor(t.db, a, "credit_note", "Тест");
    const [line] = await t.db.query.invoiceLines.findMany({ where: (l, { eq }) => eq(l.invoiceId, credit) });
    await saveDraft(t.db, credit, { partnerId, reason: "Връщане" }, [{ ...line, quantity: 1 }]);
    await issueInvoice(t.db, credit, actor);
    const b = await createDraft(t.db, { kind: "invoice", partnerId, currency: "EUR", lines: [{ description: "Грешка", quantity: 1, unit: "бр.", unitPrice: 9 }] }, "Тест");
    await issueInvoice(t.db, b, actor);
    await cancelInvoice(t.db, b, "Грешка");

    const rows = await salesExportRows(t.db, today, today, DEFAULT_FORMAT);
    const d = `${today.slice(8)}.${today.slice(5, 7)}.${today.slice(0, 4)}`;
    expect(rows).toHaveLength(3);
    expect(rows[0].slice(0, 13)).toEqual(["01", "Фактура", expect.stringMatching(/^\d{10}$/), d, d, "Клиент; ООД", "205123457", "BG205123457", "BG", "20,00", "100,00", "20,00", "120,00"]);
    expect(rows[1].slice(0, 2)).toEqual(["03", "Кредитно известие"]);
    expect(rows[1].slice(10, 13)).toEqual(["-50,00", "-10,00", "-60,00"]);
    expect(rows[1][18]).toBe(rows[0][2]);
    expect(rows[2].slice(10, 17)).toEqual(["0,00", "0,00", "0,00", "EUR", rows[2][14], "", "анулиран"]);
    expect(rows.every((r) => r.length === SALES_COLUMNS.length)).toBe(true);

    const iso = await salesExportRows(t.db, today, today, readFormat(new URLSearchParams("dec=.&date=yyyy-MM-dd&enc=utf8&sep=tab")));
    expect(iso[0].slice(3, 4).concat(iso[0].slice(10, 11))).toEqual([today, "100.00"]);
    expect(await purchaseExportRows(t.db, today, today, DEFAULT_FORMAT)).toEqual([]);
  });

  it("кодировка и разделител: 1251 без BOM, UTF-8 с BOM; полета с разделителя са в кавички", () => {
    const rows = [["Име", "Сума"], ["Клиент; ООД", "1,50"]];
    const cp = encodeCsv(rows, DEFAULT_FORMAT);
    expect(cp[0]).toBe(0xc8); // „И“, без BOM
    expect(decodeText(cp)).toBe('Име;Сума\r\n"Клиент; ООД";"1,50"');
    const tab = encodeCsv(rows, { ...DEFAULT_FORMAT, encoding: "utf8", separator: "\t" });
    expect([...tab.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(decodeText(tab)).toBe('Име\tСума\r\n"Клиент; ООД"\t"1,50"');
  });
});
