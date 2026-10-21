import { getContext } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { organizationExport } from "@/lib/org-export";

/** Пълен експорт на организацията (ZIP) — само за собственика; работи и при абонамент само за преглед. */
export async function GET() {
  const ctx = await getContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (ctx.role !== "owner") return new Response("Само собственикът може да изтегли пълния експорт.", { status: 403 });
  const zip = await organizationExport(ctx.org, ctx.db);
  await audit(ctx, "export", "organization", ctx.org.id, { bytes: zip.length });
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${ctx.org.subdomain}-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
