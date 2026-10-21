import Link from "next/link";
import { Download, ImageOff, Package, Plus, Printer } from "lucide-react";
import type { Metadata } from "next";
import { Badge, ColorBadge } from "@/components/ui/badge";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Input, Select } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/components/ui/search-form";
import { Table, TableWrap } from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { imageUrl, primaryImages } from "@/lib/item-images";
import { can } from "@/lib/permissions";
import { pageParam } from "@/lib/paging";
import { listCategories, listLocations, pageItems } from "@/lib/queries";
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

  const [{ rows, total, page, pageSize }, categories, locations] = await Promise.all([
    pageItems(ctx.db, { q, categoryId, status, low, locationId }, pageParam(sp)),
    listCategories(ctx.db),
    listLocations(ctx.db),
  ]);
  const photos = await primaryImages(ctx.db, [...new Set(rows.flatMap((r) => (r.parentId ? [r.id, r.parentId] : [r.id])))]);
  const labelQuery = new URLSearchParams(Object.entries({ q, category: categoryId ? String(categoryId) : "", location: locationId ? String(locationId) : "", status, low: low ? "1" : "" }).filter(([, v]) => v)).toString();
  const hasFilters = Boolean(q || categoryId || locationId || low || status !== "active");
  const multiLocation = locations.length > 1;

  return (
    <>
      <PageHeader
        title="Артикули"
        description="Всичко, което държите на склад, с количества и стойности."
        actions={
          <>
            <a href={`/print/labels?${labelQuery}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary")} title="Етикети за артикулите по текущия филтър">
              <Printer className="h-4 w-4" />
              Етикети
            </a>
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
                const photo = photos.get(item.id) ?? (item.parentId ? photos.get(item.parentId) : undefined);
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Thumb src={photo && imageUrl(photo, "thumb")} />
                        <div className="min-w-0">
                          <Link href={`/items/${item.id}`} className="font-medium hover:text-accent">
                            {item.name}
                            {item.variantLabel && <span className="ml-1 text-muted">· {item.variantLabel}</span>}
                          </Link>
                          <div className="font-mono text-xs text-muted">
                            {item.sku}
                            {item.barcode && <span className="ml-2">▮ {item.barcode}</span>}
                          </div>
                        </div>
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
      <Pagination basePath="/items" searchParams={sp} page={page} pageSize={pageSize} total={total} noun={plural(total, "артикул", "артикула")} />
    </>
  );
}

function Thumb({ src }: { src?: string }) {
  if (!src)
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-line">
        <ImageOff className="h-4 w-4" />
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element -- защитени файлове, без оптимизатора на Next
  return <img src={src} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover" />;
}
