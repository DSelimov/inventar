import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type Schema = Record<string, unknown>;
type Schemas = Record<string, Schema>;

export function refName(s: Schema | undefined): string | null {
  const r = s?.$ref;
  return typeof r === "string" ? r.split("/").pop()! : null;
}

/** Текстово описание на тип: integer, string | null, Item[], "a" | "b". */
export function typeLabel(s: Schema | undefined, schemas: Schemas): React.ReactNode {
  if (!s) return "—";
  const name = refName(s);
  if (name) return <SchemaLink name={name} />;
  if (Array.isArray(s.allOf)) {
    return (s.allOf as Schema[]).map((p, i) => (
      <span key={i}>
        {i > 0 && " & "}
        {typeLabel(p, schemas)}
      </span>
    ));
  }
  if (s.type === "array") {
    return (
      <>
        {typeLabel(s.items as Schema, schemas)}
        []
      </>
    );
  }
  if (Array.isArray(s.enum)) return <span className="font-mono text-xs">{(s.enum as string[]).map((v) => `"${v}"`).join(" | ")}</span>;
  const t = Array.isArray(s.type) ? (s.type as string[]).join(" | ") : String(s.type ?? "object");
  return (
    <span className="font-mono text-xs">
      {t}
      {s.format ? ` (${s.format})` : ""}
    </span>
  );
}

export function SchemaLink({ name }: { name: string }) {
  return (
    <Link href={`#schema-${name}`} className="font-mono text-xs text-accent hover:underline">
      {name}
    </Link>
  );
}

/** Събира свойствата на схема, включително allOf от референции. */
export function collectProperties(s: Schema, schemas: Schemas): { properties: Record<string, Schema>; required: string[] } {
  let properties: Record<string, Schema> = {};
  let required: string[] = [];
  const visit = (x: Schema) => {
    const name = refName(x);
    if (name && schemas[name]) return visit(schemas[name]);
    if (Array.isArray(x.allOf)) (x.allOf as Schema[]).forEach(visit);
    if (x.properties) properties = { ...properties, ...(x.properties as Record<string, Schema>) };
    if (Array.isArray(x.required)) required = [...required, ...(x.required as string[])];
  };
  visit(s);
  return { properties, required };
}

export function SchemaTable({ schema, schemas, compact = false }: { schema: Schema; schemas: Schemas; compact?: boolean }) {
  const { properties, required } = collectProperties(schema, schemas);
  const rows = Object.entries(properties);
  if (!rows.length) return <p className="text-sm text-muted">{String(schema.description ?? "Обект без фиксирани полета.")}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="table">
        <thead>
          <tr>
            <th>Поле</th>
            <th>Тип</th>
            {!compact && <th>Описание</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, prop]) => (
            <tr key={name}>
              <td className="whitespace-nowrap font-mono text-xs">
                {name}
                {required.includes(name) && (
                  <span className="ml-2">
                    <Badge tone="warning">задължително</Badge>
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap">{typeLabel(prop, schemas)}</td>
              {!compact && (
                <td className="text-muted">
                  {String(prop.description ?? "")}
                  {prop.example !== undefined && <span className="ml-1 font-mono text-xs text-text/70">напр. {JSON.stringify(prop.example)}</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-line bg-[#0f172a] p-4 text-xs leading-relaxed text-slate-100" data-lang={lang}>
      <code>{children}</code>
    </pre>
  );
}
