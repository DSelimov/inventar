import Link from "next/link";
import { Download, Package, Plus } from "lucide-react";
import type { Metadata } from "next";
import { Badge, ColorBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Input, Select } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/search-form";
import { Table, TableWrap } from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listCategories, listItems, listLocations } from "@/lib/queries";
import { formatDate, formatMoney, formatNumber, isLowStock, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Артикули" };

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const q = first(sp.q);
  const categoryId = Number(first(sp.category)) || undefined;
  const locationId = Number(first(sp.location)) || undefined;
  const status = (first(sp.status) || "active") as "active" | "archived" | "all";
  const low = first(sp.low) === "1";
  const imported = Number(first(sp.imported)) || 0;

  const [rows, categories, locations] = await Promise.all([
    listItems(ctx.db, { q, categoryId, status, low, locationId }),
    listCategories(ctx.db),
    listLocations(ctx.db),
  ]);
  const hasFilters = Boolean(q || categoryId || locationId || low || status !== "active");
  const multiLocation = locations.length > 1;

  return (
    <>
      <PageHeader
        title="Артикули"
        description="Всичко, което държите на склад, с количества и стойности."
        actions={
          <>
            <ButtonLink href="/api/export/items" variant="secondary">
              <Download className="h-4 w-4" />
              CSV
            </ButtonLink>
            {can(ctx.role, "write") && (
              <ButtonLink href="/items/new">
                <Plus className="h-4 w-4" />
                Нов артикул
              </ButtonLink>
            )}
          </>
        }
      />

      {imported > 0 && <p className="mb-4 rounded-xl bg-success-soft px-4 py-2 text-sm text-success">Импортирани са {imported} артикула.</p>}

      <FilterBar action="/items" resetHref={hasFilters ? "/items" : undefined}>
        <div className="min-w-56 flex-1">
          <Input name="q" placeholder="Търсене по име, код, баркод…" defaultValue={q} />
        </div>
        <Select name="category" defaultValue={categoryId ?? ""} className="w-auto">
          <option value="">Всички категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {multiLocation && (
          <Select name="location" defaultValue={locationId ?? ""} className="w-auto">
            <option value="">Всички локации</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
        <Select name="status" defaultValue={status} className="w-auto">
          <option value="active">Активни</option>
          <option value="archived">Архивирани</option>
          <option value="all">Всички</option>
        </Select>
        <div className="flex h-9 items-center px-1">
          <Checkbox name="low" value="1" defaultChecked={low} label="Само ниска наличност" />
        </div>
      </FilterBar>

      <TableWrap>
        {rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title={hasFilters ? "Няма артикули по тези филтри" : "Все още няма артикули"}
            description={hasFilters ? "Опитайте друго търсене или изчистете филтрите." : "Добавете първия артикул или импортирайте CSV от Настройки."}
            action={!hasFilters && can(ctx.role, "write") && <ButtonLink href="/items/new">Добави артикул</ButtonLink>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Категория</th>
                <th className="text-right">Наличност</th>
                {multiLocation && <th>По локации</th>}
                <th className="text-right">Доставна цена</th>
                <th className="text-right">Стойност</th>
                <th>Обновен</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const low = isLowStock(item);
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/items/${item.id}`} className="font-medium hover:text-accent">
                        {item.name}
                        {item.variantLabel && <span className="ml-1 text-muted">· {item.variantLabel}</span>}
                      </Link>
                      <div className="font-mono text-xs text-muted">
                        {item.sku}
                        {item.barcode && <span className="ml-2">▮ {item.barcode}</span>}
                      </div>
                    </td>
                    <td>{item.category ? <ColorBadge color={item.category.color}>{item.category.name}</ColorBadge> : <span className="text-muted">—</span>}</td>
                    <td className="text-right tabular-nums">
                      <span className={low ? "font-semibold text-danger" : ""}>
                        {formatNumber(item.quantity)} {item.unit}
                      </span>
                      {low && (
                        <div>
                          <Badge tone="danger">Ниска · мин. {item.minQuantity}</Badge>
                        </div>
                      )}
                      {item.status === "archived" && (
                        <div>
                          <Badge>Архивиран</Badge>
                        </div>
                      )}
                      {item.tracking !== "none" && (
                        <div>
                          <Badge tone="info">{item.tracking === "lot" ? "партиди" : "сер. №"}</Badge>
                        </div>
                      )}
                    </td>
                    {multiLocation && (
                      <td className="text-xs text-muted">
                        {item.stockLevels
                          .filter((s) => s.quantity !== 0)
                          .map((s) => `${s.location.name}: ${formatNumber(s.quantity)}`)
                          .join(" · ") || "—"}
                      </td>
                    )}
                    <td className="text-right tabular-nums text-muted">{formatMoney(item.unitCost, ctx.org.currency)}</td>
                    <td className="text-right tabular-nums font-medium">{formatMoney(item.quantity * item.unitCost, ctx.org.currency)}</td>
                    <td className="text-muted">{formatDate(item.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </TableWrap>
      <p className="mt-3 text-xs text-muted">
        {rows.length} {plural(rows.length, "артикул", "артикула")}
      </p>
    </>
  );
}
