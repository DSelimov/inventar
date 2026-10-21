import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, BellOff, CalendarClock, PackageMinus, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { EXPIRY_WARNING_DAYS, listAlerts } from "@/lib/alerts";
import { requireContext } from "@/lib/auth";
import { daysBetween, formatDate, formatNumber, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Известия" };

function Section({ icon: Icon, title, count, tone, children }: { icon: LucideIcon; title: string; count: number; tone: "danger" | "warning"; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${tone === "danger" ? "text-danger" : "text-warning"}`} />
            {title}
            <Badge tone={tone}>{count}</Badge>
          </span>
        }
      />
      {children}
    </Card>
  );
}

export default async function NotificationsPage() {
  const ctx = await requireContext();
  const today = todayIso();
  const a = await listAlerts(ctx.db, today);
  const days = (d: string) => daysBetween(new Date(today), new Date(d));

  return (
    <>
      <PageHeader title="Известия" description="Какво изисква внимание сега. Мениджърите получават и дневен имейл с тези известия (Настройки › Вашият профил)." />
      {a.total === 0 ? (
        <Card>
          <EmptyState icon={BellOff} title="Няма известия" description="Наличностите са над минимума, няма закъснели пратки и изтичащи партиди." />
        </Card>
      ) : (
        <div className="space-y-6">
          <Section icon={PackageMinus} title="Ниска наличност" count={a.lowStock.length} tone="danger">
            <Table>
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th className="text-right">Наличност</th>
                  <th className="text-right">Минимум</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {a.lowStock.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link href={`/items/${i.id}`} className="font-medium hover:text-accent">
                        {i.name}
                        {i.variantLabel && <span className="text-muted"> · {i.variantLabel}</span>}
                      </Link>
                      <div className="font-mono text-xs text-muted">{i.sku}</div>
                    </td>
                    <td className="text-right font-medium tabular-nums text-danger">
                      {formatNumber(i.quantity)} {i.unit}
                    </td>
                    <td className="text-right tabular-nums text-muted">{formatNumber(i.minQuantity)}</td>
                    <td className="text-right">
                      <Link href={`/orders/new?type=purchase&item=${i.id}`} className="text-xs font-medium text-accent hover:underline">
                        Поръчай
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section icon={Truck} title="Закъснели пратки" count={a.overdue.length} tone="warning">
            <Table>
              <thead>
                <tr>
                  <th>Пратка</th>
                  <th>Партньор</th>
                  <th>Очаквана</th>
                  <th className="text-right">Закъснение</th>
                </tr>
              </thead>
              <tbody>
                {a.overdue.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/shipments/${s.id}`} className="font-medium hover:text-accent">
                        {s.reference}
                      </Link>
                      <div className="text-xs text-muted">{s.direction === "inbound" ? "входяща" : "изходяща"}</div>
                    </td>
                    <td>{s.partnerRecord?.name ?? s.partner ?? "—"}</td>
                    <td className="text-muted">{formatDate(s.expectedDate)}</td>
                    <td className="text-right font-medium tabular-nums text-warning">{-days(s.expectedDate!)} дни</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section icon={AlertTriangle} title="Партиди с изтекъл срок" count={a.expired.length} tone="danger">
            <LotTable lots={a.expired} days={days} />
          </Section>
          <Section icon={CalendarClock} title={`Партиди, изтичащи до ${EXPIRY_WARNING_DAYS} дни`} count={a.expiring.length} tone="warning">
            <LotTable lots={a.expiring} days={days} />
          </Section>
        </div>
      )}
    </>
  );
}

function LotTable({ lots, days }: { lots: Awaited<ReturnType<typeof listAlerts>>["expiring"]; days: (d: string) => number }) {
  return (
    <Table>
      <thead>
        <tr>
          <th>Артикул</th>
          <th>Партида</th>
          <th>Локация</th>
          <th>Срок</th>
          <th className="text-right">Количество</th>
        </tr>
      </thead>
      <tbody>
        {lots.map((l) => {
          const d = days(l.expiryDate!);
          return (
            <tr key={l.id}>
              <td>
                <Link href={`/items/${l.itemId}`} className="font-medium hover:text-accent">
                  {l.item.name}
                </Link>
              </td>
              <td className="font-mono text-xs">{l.lotNumber}</td>
              <td className="text-muted">{l.location.name}</td>
              <td className={d < 0 ? "text-danger" : "text-warning"}>
                {formatDate(l.expiryDate)} · {d < 0 ? `изтекъл преди ${-d} дни` : d === 0 ? "днес" : `след ${d} дни`}
              </td>
              <td className="text-right tabular-nums">
                {formatNumber(l.quantity)} {l.item.unit}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
