"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { addItemImages, deleteItemImage, getItemImage, ImageError, makePrimaryImage } from "@/lib/item-images";
import { act } from "@/lib/action";
import { UserError } from "@/lib/errors";

export type UploadState = { error?: string; added?: number; at?: number };

function revalidate(itemId: number) {
  revalidatePath("/items");
  revalidatePath(`/items/${itemId}`);
}

export async function uploadItemImages(itemId: number, _prev: UploadState, fd: FormData): Promise<UploadState> {
  const ctx = await requireContext("write");
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File);
  try {
    const ids = await addItemImages(ctx.db, ctx.org, itemId, files);
    await audit(ctx, "update", "item", itemId, { photosAdded: ids.length });
    revalidate(itemId);
    return { added: ids.length, at: Date.now() };
  } catch (e) {
    if (e instanceof ImageError) return { error: e.message, at: Date.now() };
    throw e;
  }
}

export const removeItemImage = act(async (imageId: number) => {
  const ctx = await requireContext("write");
  const img = await getItemImage(ctx.db, imageId);
  if (!img) throw new UserError("Снимката не е намерена.");
  await deleteItemImage(ctx.db, img);
  await audit(ctx, "update", "item", img.itemId, { photoRemoved: img.id });
  revalidate(img.itemId);
  return "Снимката е изтрита.";
});

export const setPrimaryImage = act(async (imageId: number) => {
  const ctx = await requireContext("write");
  const img = await getItemImage(ctx.db, imageId);
  if (!img) throw new UserError("Снимката не е намерена.");
  await makePrimaryImage(ctx.db, img);
  revalidate(img.itemId);
  return "Главната снимка е сменена.";
});
