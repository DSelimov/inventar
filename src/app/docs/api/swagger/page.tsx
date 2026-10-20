import type { Metadata } from "next";
import { SwaggerUi } from "@/components/docs/swagger-ui";

export const metadata: Metadata = { title: "Swagger UI" };

/** Swagger UI върху OpenAPI 3.1 спецификацията на /api/v1/openapi.json. */
export default function SwaggerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-4 md:px-8">
      <p className="mb-3 rounded-xl border border-line bg-surface px-4 py-2 text-xs text-muted">
        Натиснете <strong>Authorize</strong>, поставете вашия API ключ (само стойността, без „Bearer“) и използвайте <strong>Try it out</strong> на всяка крайна точка. Заявките се изпращат към тази инсталация. Swagger UI се зарежда от CDN и изисква интернет.
      </p>
      <div className="rounded-2xl border border-line bg-surface px-2 py-1">
        <SwaggerUi specUrl="/api/v1/openapi.json" />
      </div>
    </div>
  );
}
