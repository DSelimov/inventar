import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { items, TRACKING_MODES } from "@/db/schema";
import { ApiError, handler, json, readJson } from "@/lib/api";
import { slugSku } from "@/lib/utils";
import { emit } from "@/lib/webhooks";

export const GET = handler("read", async (req, ctx) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") ?? 50)));
  const where = and(eq(items.organizationId, ctx.orgId), q ? or(ilike(items.name, `%${q}%`), ilike(items.sku, `%${q}%`), ilike(items.barcode, `%${q}%`)) : undefined);
  const [rows, [{ total }]] = await Promise.all([
    db.query.items.findMany({ where, with: { category: true, stockLevels: { with: { location: true } } }, orderBy: [items.name], limit: pageSize, offset: (page - 1) * pageSize }),
    db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(items).where(where),
  ]);
  return json({ data: rows, page, pageSize, total });
});

type Body = Partial<{ sku: string; name: string; barcode: string; description: string; categoryId: number; unit: string; unitCost: number; unitPrice: number; minQuantity: number; tracking: string }>;

export const POST = handler("write", async (req, ctx) => {
  const body = await readJson<Body>(req);
  if (!body.name) throw new ApiError(422, "Полето name е задължително.");
  const sku = body.sku?.trim() || slugSku(body.name);
  const dup = await db.query.items.findFirst({ where: and(eq(items.organizationId, ctx.orgId), eq(items.sku, sku)) });
  if (dup) throw new ApiError(409, `Вече има артикул с код „${sku}“.`);
  const [row] = await db
    .insert(items)
    .values({
      organizationId: ctx.orgId,
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
    .returning();
  emit(ctx.orgId, "item.created", { id: row.id, sku: row.sku, name: row.name, source: "api" });
  return json({ data: row }, 201);
});
