import type { Metadata } from "next";
import { headers } from "next/headers";
import { Badge, type Tone } from "@/components/ui/badge";
import { Code, SchemaTable, refName, typeLabel } from "@/components/docs/schema-table";
import { WEBHOOK_EVENTS } from "@/db/schema";
import { WEBHOOK_PAYLOAD_EXAMPLES, buildOpenApi } from "@/lib/openapi";
import { WEBHOOK_EVENT_LABELS } from "@/lib/webhook-labels";

export const metadata: Metadata = { title: "API документация" };

type Schema = Record<string, unknown>;
type Operation = {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: Array<{ name: string; in: string; required?: boolean; description?: string; schema?: Schema }>;
  requestBody?: { content: Content };
  responses: Record<string, { description: string; content?: Content }>;
};
/** Ключ = media type (application/json, multipart/form-data, image/webp…). */
type Content = Record<string, { schema: Schema; example?: unknown }>;

/** Първият media type на тялото/отговора. */
const media = (content?: Content) => {
  const [type, value] = Object.entries(content ?? {})[0] ?? [];
  return type ? { type, ...value } : undefined;
};

const METHOD_TONE: Record<string, Tone> = { get: "info", post: "success", patch: "warning", delete: "danger" };
const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();

async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`;
}

export default async function ApiDocsPage() {
  const server = await baseUrl();
  const spec = buildOpenApi(server);
  const schemas = spec.components.schemas as Record<string, Schema>;
  const paths = spec.paths as Record<string, Record<string, Operation>>;

  const byTag = new Map<string, Array<{ method: string; path: string; op: Operation }>>();
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const tag = op.tags?.[0] ?? "Други";
      byTag.set(tag, [...(byTag.get(tag) ?? []), { method, path, op }]);
    }
  }
  const tags = spec.tags.filter((t) => byTag.has(t.name));

  const curlFor = (method: string, path: string, op: Operation) => {
    const url = `${server}${path.replace(/\{\w+\}/g, "1")}`;
    const qs = (op.parameters ?? []).filter((p) => p.in === "query").slice(0, 1).map((p) => `${p.name}=…`);
    const req = media(op.requestBody?.content);
    const multipart = req?.type === "multipart/form-data";
    const ex = req?.example;
    const binary = media(op.responses["200"]?.content)?.type.startsWith("image/");
    const extra = multipart ? [`  -F "file=@snimka.jpg"`] : ex ? [`  -H "Content-Type: application/json" \\`, `  -d '${JSON.stringify(ex)}'`] : binary ? [`  -o snimka.webp`] : [];
    return [
      `curl ${method !== "get" && !multipart ? `-X ${method.toUpperCase()} ` : ""}"${url}${qs.length ? `?${qs.join("&")}` : ""}" \\`,
      `  -H "Authorization: Bearer inv_…"${extra.length ? " \\" : ""}`,
      ...extra,
    ].join("\n");
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-8 md:grid-cols-[14rem_1fr] md:px-8">
      {/* ---------------------------------------------------------- TOC */}
      <nav className="hidden md:block">
        <div className="sticky top-20 space-y-5 text-sm">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Общи</div>
            <ul className="space-y-1">
              {[
                ["#intro", "Въведение"],
                ["#auth", "Автентикация"],
                ["#errors", "Грешки и формати"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="text-muted hover:text-text">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Крайни точки</div>
            <ul className="space-y-1">
              {tags.map((t) => (
                <li key={t.name}>
                  <a href={`#tag-${slug(t.name)}`} className="text-muted hover:text-text">
                    {t.name}
                  </a>
                  <ul className="mt-0.5 space-y-0.5 border-l border-line pl-2">
                    {byTag.get(t.name)!.map(({ method, path, op }) => (
                      <li key={method + path}>
                        <a href={`#${op.operationId}`} className="block truncate text-xs text-muted hover:text-text">
                          <span className="font-mono uppercase">{method}</span> {path.replace("/api/v1", "")}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Други</div>
            <ul className="space-y-1">
              <li>
                <a href="#webhooks" className="text-muted hover:text-text">
                  Webhooks
                </a>
              </li>
              <li>
                <a href="#schemas" className="text-muted hover:text-text">
                  Схеми
                </a>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------ content */}
      <article className="min-w-0 space-y-14">
        <section id="intro" className="scroll-mt-24 space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">{spec.info.title}</h1>
          <div className="prose-sm max-w-none space-y-3 text-sm leading-relaxed text-text/90">
            {spec.info.description.split("\n\n").map((p, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: md(p) }} />
            ))}
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Базов адрес</div>
            <code className="font-mono">{server}/api/v1</code>
            <p className="mt-2 text-muted">
              Машинно четима спецификация:{" "}
              <a href="/api/v1/openapi.json" className="text-accent hover:underline">
                /api/v1/openapi.json
              </a>{" "}
              (OpenAPI 3.1). Може да се импортира в Postman, Insomnia или генератор на клиенти. За интерактивно изпробване:{" "}
              <a href="/docs/api/swagger" className="text-accent hover:underline">
                Swagger UI
              </a>
              .
            </p>
          </div>
        </section>

        <section id="auth" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">Автентикация</h2>
          <p className="text-sm text-text/90">
            Всяка заявка носи API ключ в заглавието <code className="rounded bg-surface-2 px-1 font-mono text-xs">Authorization</code>. Ключовете се създават от <strong>Настройки › API</strong> в приложението (роля администратор или собственик), показват се еднократно и имат право <em>четене</em> (GET) или <em>четене и запис</em> (и POST/PATCH). Ключът е обвързан с една организация.
          </p>
          <Code lang="bash">{`curl "${server}/api/v1/items?q=мишка" \\\n  -H "Authorization: Bearer inv_0123456789abcdef0123456789abcdef0123456789abcdef"`}</Code>
        </section>

        <section id="errors" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold">Грешки и формати</h2>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Значение</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["400", "Невалидна заявка по същество: недостатъчна наличност, липсваща партида, непозволен преход на статус."],
                  ["401", "Липсва или е невалиден API ключ."],
                  ["403", "Ключът няма нужното право (напр. запис с ключ само за четене)."],
                  ["404", "Записът не съществува или е в друга организация."],
                  ["409", "Конфликт: дублиран код на артикул."],
                  ["422", "Липсващо или невалидно поле в тялото."],
                ].map(([c, d]) => (
                  <tr key={c}>
                    <td className="font-mono text-xs">{c}</td>
                    <td className="text-muted">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Code lang="json">{`{ "error": "Недостатъчна наличност в локацията (има 3 бр.)." }`}</Code>
          <ul className="list-disc space-y-1 pl-5 text-sm text-text/90">
            <li>
              Успешните отговори обвиват резултата в <code className="font-mono text-xs">data</code>; списъкът артикули добавя <code className="font-mono text-xs">page</code>, <code className="font-mono text-xs">pageSize</code> и <code className="font-mono text-xs">total</code>.
            </li>
            <li>Дати: ГГГГ-ММ-ДД. Моменти във времето: ISO 8601 в UTC. Числа: десетичните цени са с точка.</li>
            <li>Идентификаторите са цели числа и са стабилни; кодовете (sku) могат да се сменят от потребителите.</li>
          </ul>
        </section>

        {tags.map((t) => (
          <section key={t.name} id={`tag-${slug(t.name)}`} className="scroll-mt-24 space-y-8">
            <div>
              <h2 className="text-xl font-semibold">{t.name}</h2>
              <p className="text-sm text-muted">{t.description}</p>
            </div>
            {byTag.get(t.name)!.map(({ method, path, op }) => {
              const req = media(op.requestBody?.content);
              return (
                <div key={method + path} id={op.operationId} className="scroll-mt-24 rounded-2xl border border-line bg-surface shadow-sm">
                  <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
                    <Badge tone={METHOD_TONE[method] ?? "neutral"}>{method.toUpperCase()}</Badge>
                    <code className="font-mono text-sm">{path}</code>
                    <span className="ml-auto text-sm font-semibold">{op.summary}</span>
                  </div>
                  <div className="grid gap-6 p-5 lg:grid-cols-2">
                    <div className="space-y-5">
                      {op.description && (
                        <div className="space-y-2 text-sm leading-relaxed text-text/90">
                          {op.description.split("\n\n").map((p, i) =>
                            p.startsWith("- ") ? (
                              <ul key={i} className="list-disc space-y-1 pl-5">
                                {p.split("\n").map((li, j) => (
                                  <li key={j} dangerouslySetInnerHTML={{ __html: md(li.replace(/^- /, "")) }} />
                                ))}
                              </ul>
                            ) : (
                              <p key={i} dangerouslySetInnerHTML={{ __html: md(p) }} />
                            ),
                          )}
                        </div>
                      )}
                      {op.parameters && op.parameters.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Параметри</h4>
                          <div className="overflow-x-auto rounded-xl border border-line">
                            <table className="table">
                              <tbody>
                                {op.parameters.map((p) => (
                                  <tr key={p.name}>
                                    <td className="whitespace-nowrap font-mono text-xs">
                                      {p.name} <span className="text-muted">({p.in === "path" ? "път" : "query"})</span>
                                    </td>
                                    <td className="whitespace-nowrap">{typeLabel(p.schema, schemas)}</td>
                                    <td className="text-muted">
                                      {p.description}
                                      {p.schema?.default !== undefined && <span className="ml-1 font-mono text-xs">по подразбиране {String(p.schema.default)}</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {req && (
                        <div>
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                            Тяло на заявката · {req.type === "application/json" ? typeLabel(req.schema, schemas) : req.type}
                          </h4>
                          <SchemaTable schema={req.schema} schemas={schemas} />
                        </div>
                      )}
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Отговори</h4>
                        <ul className="space-y-1 text-sm">
                          {Object.entries(op.responses).map(([code, r]) => (
                            <li key={code} className="flex gap-3">
                              <Badge tone={code.startsWith("2") ? "success" : "neutral"}>{code}</Badge>
                              <span className="text-muted">
                                {r.description}
                                {r.content && code.startsWith("2") && <span className="ml-1">→ {media(r.content)!.type === "application/json" ? typeLabel(media(r.content)!.schema, schemas) : media(r.content)!.type}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Пример</h4>
                        <Code lang="bash">{curlFor(method, path, op)}</Code>
                      </div>
                      {Object.entries(op.responses)
                        .filter(([code, r]) => code.startsWith("2") && media(r.content)?.type === "application/json")
                        .slice(0, 1)
                        .map(([code, r]) => (
                          <div key={code}>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Отговор {code}</h4>
                            <SchemaTable schema={media(r.content)!.schema} schemas={schemas} compact />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ))}

        <section id="webhooks" className="scroll-mt-24 space-y-5">
          <div>
            <h2 className="text-xl font-semibold">Webhooks</h2>
            <p className="text-sm text-muted">Системата изпраща събития към ваш URL. Настройват се от Настройки › Webhooks: адрес, таен ключ и списък събития (празен = всички).</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 text-sm text-text/90">
              <h3 className="font-semibold">Доставка</h3>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  HTTP <strong>POST</strong> с <code className="font-mono text-xs">Content-Type: application/json</code>, изпратен веднага след като действието приключи (не блокира потребителя).
                </li>
                <li>
                  Заглавия: <code className="font-mono text-xs">X-Inventory-Event</code> (типът) и <code className="font-mono text-xs">X-Inventory-Signature: sha256=&lt;hex&gt;</code> (HMAC-SHA256 на суровото тяло с тайния ключ).
                </li>
                <li>Всеки 2xx отговор е успех. Време за изчакване 8 секунди. Един опит без автоматично повторение; резултатът (код, грешка) се вижда в журнала в Настройки › Webhooks.</li>
                <li>Обработвайте идемпотентно: едно и също събитие може да се повтори при ръчно „Изпрати тестово събитие“ или при повторна операция.</li>
              </ul>
              <h3 className="pt-2 font-semibold">Тяло</h3>
              <SchemaTable schema={{ $ref: "#/components/schemas/WebhookEnvelope" }} schemas={schemas} />
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Проверка на подписа</h3>
              <Code lang="js">{`// Node.js (Express): проверете подписа върху суровото тяло
import { createHmac, timingSafeEqual } from "node:crypto";

app.post("/hooks/inventory", express.raw({ type: "application/json" }), (req, res) => {
  const expected = "sha256=" + createHmac("sha256", process.env.INVENTORY_SECRET)
    .update(req.body).digest("hex");
  const given = req.get("X-Inventory-Signature") ?? "";
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return res.status(401).end();
  }
  const { event, data } = JSON.parse(req.body);
  // ... обработка
  res.status(200).end();
});`}</Code>
              <Code lang="python">{`# Python (Flask)
import hmac, hashlib
from flask import request, abort

@app.post("/hooks/inventory")
def inventory_hook():
    expected = "sha256=" + hmac.new(SECRET.encode(), request.get_data(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-Inventory-Signature", "")):
        abort(401)
    payload = request.get_json()
    return "", 200`}</Code>
              <Code lang="php">{`<?php // PHP
$body = file_get_contents('php://input');
$expected = 'sha256=' . hash_hmac('sha256', $body, $secret);
if (!hash_equals($expected, $_SERVER['HTTP_X_INVENTORY_SIGNATURE'] ?? '')) { http_response_code(401); exit; }
$payload = json_decode($body, true);`}</Code>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">Събития и примерни данни</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {WEBHOOK_EVENTS.map((e) => (
                <div key={e} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <code className="font-mono text-sm">{e}</code>
                    <span className="text-xs text-muted">{WEBHOOK_EVENT_LABELS[e]}</span>
                  </div>
                  <Code lang="json">{JSON.stringify({ event: e, createdAt: "2026-10-20T08:00:00.000Z", data: WEBHOOK_PAYLOAD_EXAMPLES[e] }, null, 2)}</Code>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="schemas" className="scroll-mt-24 space-y-6">
          <h2 className="text-xl font-semibold">Схеми</h2>
          {Object.entries(schemas).map(([name, schema]) => (
            <div key={name} id={`schema-${name}`} className="scroll-mt-24 space-y-2">
              <h3 className="font-mono text-sm font-semibold">
                {name}
                {Array.isArray(schema.allOf) && <span className="ml-2 font-sans text-xs font-normal text-muted">включва {(schema.allOf as Schema[]).map((s) => refName(s)).filter(Boolean).join(", ")}</span>}
              </h3>
              {schema.description ? <p className="text-sm text-muted">{String(schema.description)}</p> : null}
              <SchemaTable schema={schema} schemas={schemas} />
            </div>
          ))}
        </section>
      </article>
    </div>
  );
}

/** Минимален markdown: **bold**, *italic*, `code`. Входът е наш собствен текст от спецификацията. */
function md(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="rounded bg-surface-2 px-1 font-mono text-xs">$1</code>');
}
