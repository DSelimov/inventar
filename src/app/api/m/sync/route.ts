import { NextResponse } from "next/server";
import { getContext } from "@/lib/auth";
import { processAction, type OfflineAction } from "@/lib/offline-sync";
import { can } from "@/lib/permissions";
import { subscriptionState } from "@/lib/plans";

/** Изпраща опашката от мобилния режим; действията се обработват по реда на записване. */
export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Влезте отново." }, { status: 401 });
  if (!can(ctx.role, "write")) return NextResponse.json({ error: "Нямате права за складови движения." }, { status: 403 });
  const sub = subscriptionState(ctx.org);
  if (sub.readOnly) return NextResponse.json({ error: sub.message }, { status: 402 });
  let body: { actions?: OfflineAction[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалиден JSON." }, { status: 400 });
  }
  const actions = (body.actions ?? []).slice(0, 200).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const results = [];
  for (const a of actions) results.push(await processAction(ctx.db, ctx.user, a));
  return NextResponse.json({ results });
}
