import { NextResponse } from "next/server";
import { buildOpenApi } from "@/lib/openapi";

/** Публична машинно четима спецификация (OpenAPI 3.1). Не изисква ключ. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return NextResponse.json(buildOpenApi(process.env.NEXT_PUBLIC_APP_URL ?? origin), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
