import { getContext } from "@/lib/auth";
import { getItemImage, IMAGE_SIZES, readItemImage, type ImageSize } from "@/lib/item-images";

/** Снимка на артикул за интерфейса: само за членове на организацията от поддомейна. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; size: string }> }) {
  const { id, size } = await params;
  const ctx = await getContext();
  if (!ctx) return new Response("Неоторизиран достъп.", { status: 401 });
  if (!(IMAGE_SIZES as readonly string[]).includes(size) || !/^\d+$/.test(id)) return new Response("Не е намерено.", { status: 404 });
  const img = await getItemImage(ctx.db, Number(id));
  if (!img) return new Response("Не е намерено.", { status: 404 });

  // Снимките не се променят на място (нова снимка = нов id), затова кешът е дълъг.
  const etag = `"${img.id}-${size}"`;
  const headers = { "Cache-Control": "private, max-age=31536000, immutable", ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  const data = await readItemImage(img, size as ImageSize);
  if (!data) return new Response("Файлът липсва в хранилището.", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(data.length) } });
}
