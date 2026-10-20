import { ApiError, handler, json, paramId } from "@/lib/api";
import { addItemImages, apiImage, ImageError, listItemImages } from "@/lib/item-images";
import { emit } from "@/lib/webhooks";

type Params = { params: Promise<{ id: string }> };

export const GET = handler("read", async (_req, ctx, { params }: Params) => {
  const id = await paramId(params);
  return json({ data: (await listItemImages(ctx.db, id)).map(apiImage) });
});

/** multipart/form-data, едно или повече полета „file“. */
export const POST = handler("write", async (req, ctx, { params }: Params) => {
  const id = await paramId(params);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "Тялото трябва да е multipart/form-data с поле „file“.");
  }
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  try {
    await addItemImages(ctx.db, ctx.org, id, files);
  } catch (e) {
    if (e instanceof ImageError) throw new ApiError(e.message === "Артикулът не е намерен." ? 404 : 422, e.message);
    throw e;
  }
  emit(ctx.db, "item.updated", { id, images: files.length, source: "api" });
  return json({ data: (await listItemImages(ctx.db, id)).map(apiImage) }, 201);
});
