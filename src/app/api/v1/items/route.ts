import { eq, like, or, sql } from "drizzle-orm";
import { items, TRACKING_MODES } from "@/db/tenant-schema";
import { ApiError, handler, json, readJson } from "@/lib/api";
import { slugSku } from "@/lib/utils";
import { emit } from "@/lib/webhooks";

export const GET = handler("read", async (req, ctx) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") ?? 50)));
  const where = q ? or(like(items.name, `%${q}%`), like(items.sku, `%${q}%`), like(items.barcode, `%${q}%`)) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    ctx.db.query.items.findMany({ where, with: { category: true, stockLevels: { with: { location: true } } }, orderBy: [items.name], limit: pageSize, offset: (page - 1) * pageSize }),
    ctx.db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(items).where(where),
  ]);
  return json({ data: rows, page, pageSize, total });
});

type Body = Partial<{ sku: string; name: string; barcode: string; description: string; categoryId: number; unit: string; unitCost: number; unitPrice: number; minQuantity: number; tracking: string }>;

export const POST = handler("write", async (req, ctx) => {
  const body = await readJson<Body>(req);
  if (!body.name) throw new ApiError(422, "Полето name е задължително.");
  const sku = body.sku?.trim() || slugSku(body.name);
  const dup = await ctx.db.query.items.findFirst({ where: eq(items.sku, sku) });
  if (dup) throw new ApiError(409, `Вече има артикул с код „${sku}“.`);
  const [{ id }] = await ctx.db
    .insert(items)
    .values({
      sku,
      name: body.name,
      barcode: body.barcode ?? null,
      description: body.description ?? null,
      categoryId: body.categoryId ?? null,
      unit: body.unit ?? "бр.",
      unitCost: body.unitCost ?? 0,
      unitPrice: body.unitPrice ?? 0,
      minQuantity: body.minQuantity ?? 0,
      tracking: (TRACKING_MODES as readonly string[]).includes(body.tracking ?? "") ? (body.tracking as (typeof TRACKING_MODES)[number]) : "none",
    })
    .$returningId();
  const row = await ctx.db.query.items.findFirst({ where: eq(items.id, id) });
  emit(ctx.db, "item.created", { id, sku, name: body.name, source: "api" });
  return json({ data: row }, 201);
});
