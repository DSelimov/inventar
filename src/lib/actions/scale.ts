"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { SCALE_FORMATS_KEY } from "@/lib/scale";
import { DEFAULT_SCALE_FORMATS, SCALE_KINDS, type ScaleFormat, type ScaleKind } from "@/lib/scale-barcode";
import { setSetting } from "@/lib/settings";

/** Формати на баркодовете от везни: редове prefix_i / pluLength_i / kind_i; празен префикс = без ред. */
export const saveScaleFormats = act(async (fd: FormData) => {
  const ctx = await requireContext("manage");
  const formats: ScaleFormat[] = [];
  if (fd.get("preset") === "1") formats.push(...DEFAULT_SCALE_FORMATS);
  else
    for (let i = 0; i < 4; i++) {
      const prefix = String(fd.get(`prefix_${i}`) ?? "").trim();
      if (!prefix) continue;
      const pluLength = Number(fd.get(`pluLength_${i}`));
      const kind = String(fd.get(`kind_${i}`)) as ScaleKind;
      if (!/^\d{1,3}$/.test(prefix)) throw new UserError(`Ред ${i + 1}: префиксът е 1–3 цифри (обикновено 20–29).`);
      if (!Number.isInteger(pluLength) || pluLength < 3 || pluLength > 7 || prefix.length + pluLength > 10) throw new UserError(`Ред ${i + 1}: PLU е 3–7 цифри и остават поне 2 за стойността.`);
      if (!SCALE_KINDS.includes(kind)) throw new UserError(`Ред ${i + 1}: изберете вид.`);
      if (formats.some((f) => f.prefix === prefix)) throw new UserError(`Префикс ${prefix} е въведен два пъти.`);
      formats.push({ prefix, pluLength, kind });
    }
  await setSetting(ctx.db, SCALE_FORMATS_KEY, JSON.stringify(formats));
  await audit(ctx, "update", "settings", null, { scaleFormats: formats });
  revalidatePath("/settings");
  return formats.length ? "Форматите на везните са запазени." : "Разпознаването на етикети от везни е изключено.";
});
