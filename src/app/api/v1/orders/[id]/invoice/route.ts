import { handler, json, paramId, readJson } from "@/lib/api";
import { draftFromOrder } from "@/lib/invoicing";
import { getInvoice } from "@/lib/queries";

/** Чернова на фактура (или проформа) от клиентска поръчка; издаването е в приложението. */
export const POST = handler("write", async (req, ctx, { params }: { params: Promise<{ id: string }> }) => {
  const body = await readJson<{ kind?: string }>(req).catch(() => ({}) as { kind?: string });
  const id = await draftFromOrder(ctx.db, await paramId(params), ctx.org.currency, "API", body.kind === "proforma" ? "proforma" : "invoice");
  return json({ data: await getInvoice(ctx.db, id) }, 201);
});
