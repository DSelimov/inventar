import Link from "next/link";
import { Package, Plus } from "lucide-react";
import type { Metadata } from "next";
import { Badge, ColorBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Input, Select } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/search-form";
import { Table, TableWrap } from "@/components/ui/table";
import { listCategories, listItems } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { formatDate, formatMoney, formatNumber, isLowStock, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Артикули" };

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = first(sp.q);
  const categoryId = Number(first(sp.category)) || undefined;
  const status = (first(sp.status) || "active") as "active" | "archived" | "all";
  const low = first(sp.low) === "1";

  const [rows, categories, settings] = await Promise.all([
    listItems({ q, categoryId, status, low }),
    listCategories(),
    getSettings(),
  ]);
  const hasFilters = Boolean(q || categoryId || low || status !== "active");

  return (
    <>
      <PageHeader
        title="Артикули"
        description="Всичко, което държите на склад, с количества и стойности."
        actions={
          <ButtonLink href="/items/new">
            <Plus className="h-4 w-4" />
            Нов артикул
          </ButtonLink>
        }
      />

      <FilterBar action="/items" resetHref={hasFilters ? "/items" : undefined}>
        <div className="min-w-56 flex-1">
          <Input name="q" placeholder="Търсене по име, код или локация…" defaultValue={q} />
        </div>
        <Select name="category" defaultValue={categoryId ?? ""} className="w-auto">
          <option value="">Всички категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
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
            description={hasFilters ? "Опитайте друго търсене или изчистете филтрите." : "Добавете първия артикул, за да започнете да следите наличността."}
            action={!hasFilters && <ButtonLink href="/items/new">Добави артикул</ButtonLink>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Категория</th>
                <th className="text-right">Наличност</th>
                <th className="text-right">Доставна цена</th>
                <th className="text-right">Стойност</th>
                <th>Локация</th>
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
                      </Link>
                      <div className="font-mono text-xs text-muted">{item.sku}</div>
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
                    </td>
                    <td className="text-right tabular-nums text-muted">{formatMoney(item.unitCost, settings.currency)}</td>
                    <td className="text-right tabular-nums font-medium">{formatMoney(item.quantity * item.unitCost, settings.currency)}</td>
                    <td className="text-muted">{item.location ?? "—"}</td>
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
