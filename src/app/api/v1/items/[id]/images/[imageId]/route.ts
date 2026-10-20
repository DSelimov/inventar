import { ApiError, handler, json, paramId, type ApiContext } from "@/lib/api";
import { deleteItemImage, getItemImage, readItemImage } from "@/lib/item-images";

type Params = { params: Promise<{ id: string; imageId: string }> };

async function find(ctx: ApiContext, params: Params["params"]) {
  const itemId = await paramId(params);
  const imageId = Number((await params).imageId);
  const img = Number.isInteger(imageId) ? await getItemImage(ctx.db, imageId) : null;
  if (!img || img.itemId !== itemId) throw new ApiError(404, "Снимката не е намерена.");
  return img;
}

/** Самото изображение (image/webp). ?size=thumb за миниатюра 400×400. */
export const GET = handler("read", async (req, ctx, { params }: Params) => {
  const img = await find(ctx, params);
  const size = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
  const data = await readItemImage(img, size);
  if (!data) throw new ApiError(404, "Файлът липсва в хранилището.");
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/webp", "Content-Length": String(data.length), "Cache-Control": "private, max-age=31536000, immutable" } });
});

export const DELETE = handler("write", async (_req, ctx, { params }: Params) => {
  const img = await find(ctx, params);
  await deleteItemImage(ctx.db, img);
  return json({ data: { id: img.id, deleted: true } });
});
