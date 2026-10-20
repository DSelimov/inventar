import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parse, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { EVENT_TYPES } from "@/db/tenant-schema";
import { createEvent, deleteEvent } from "@/lib/actions/calendar";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listCalendarEntries, type CalendarEntry } from "@/lib/queries";
import { LOCALE, cn, label, plural, todayIso } from "@/lib/utils";

export const metadata: Metadata = { title: "Календар" };

const KIND_CLASS: Record<CalendarEntry["kind"], string> = {
  event: "bg-accent-soft text-accent",
  reminder: "bg-warning-soft text-warning",
  deadline: "bg-danger-soft text-danger",
  inbound: "bg-info-soft text-info",
  outbound: "bg-surface-2 text-text border border-line",
  expiry: "bg-danger-soft text-danger",
};

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const ctx = await requireContext();
  const writable = can(ctx.role, "write");
  const sp = await searchParams;
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? parse(sp.m, "yyyy-MM", new Date()) : new Date();
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const entries = await listCalendarEntries(ctx.db, format(gridStart, "yyyy-MM-dd"), format(gridEnd, "yyyy-MM-dd"));
  const byDate = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const today = todayIso();
  const monthEntries = entries.filter((e) => e.date.startsWith(format(month, "yyyy-MM")));

  return (
    <>
      <PageHeader
        title="Календар"
        description="Очаквани пратки, напомняния и крайни срокове на едно място."
        actions={
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm">
            <ButtonLink href={`/calendar?m=${format(subMonths(month, 1), "yyyy-MM")}`} variant="ghost" size="sm" aria-label="Предишен месец">
              <ChevronLeft className="h-4 w-4" />
            </ButtonLink>
            <span className="min-w-36 text-center text-sm font-semibold first-letter:uppercase">{format(month, "LLLL yyyy", { locale: LOCALE })}</span>
            <ButtonLink href={`/calendar?m=${format(addMonths(month, 1), "yyyy-MM")}`} variant="ghost" size="sm" aria-label="Следващ месец">
              <ChevronRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/calendar" variant="secondary" size="sm">
              Днес
            </ButtonLink>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-xs font-medium uppercase tracking-wide text-muted">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const iso = format(day, "yyyy-MM-dd");
              const list = byDate.get(iso) ?? [];
              const inMonth = isSameMonth(day, month);
              return (
                <div key={iso} className={cn("min-h-24 border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-surface-2/60")}>
                  <div className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", iso === today ? "bg-accent font-semibold text-white" : inMonth ? "text-text" : "text-muted/60")}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((e) => {
                      const chip = (
                        <span className={cn("block truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight", KIND_CLASS[e.kind])} title={e.title}>
                          {e.title}
                        </span>
                      );
                      return e.href ? (
                        <Link key={e.key} href={e.href}>
                          {chip}
                        </Link>
                      ) : (
                        <div key={e.key}>{chip}</div>
                      );
                    })}
                    {list.length > 3 && <span className="block px-1 text-[11px] text-muted">+{list.length - 3} още</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          {writable && <Card>
            <CardHeader title="Добави в календара" />
            <CardBody>
              <form action={createEvent} className="space-y-3">
                <Field label="Заглавие">
                  <Input name="title" required placeholder="Инвентаризация, посещение на доставчик…" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Дата">
                    <Input name="date" type="date" required defaultValue={today} />
                  </Field>
                  <Field label="Тип">
                    <Select name="type" defaultValue="event">
                      {EVENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {label(t)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Бележки">
                  <Textarea name="notes" className="min-h-16" />
                </Field>
                <SubmitButton className="w-full">
                  <Plus className="h-4 w-4" />
                  Добави
                </SubmitButton>
              </form>
            </CardBody>
          </Card>}

          <Card>
            <CardHeader title="Този месец" description={`${monthEntries.length} ${plural(monthEntries.length, "запис", "записа")}`} />
            {monthEntries.length === 0 ? (
              <CardBody className="text-sm text-muted">Няма нищо планирано този месец.</CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {monthEntries.map((e) => (
                  <li key={e.key} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="w-12 shrink-0 text-xs tabular-nums text-muted">{format(parse(e.date, "yyyy-MM-dd", new Date()), "d MMM", { locale: LOCALE })}</span>
                    <span className="min-w-0 flex-1 truncate">{e.href ? <Link href={e.href} className="hover:text-accent">{e.title}</Link> : e.title}</span>
                    <Badge tone={statusTone[e.kind] ?? "neutral"}>{label(e.kind)}</Badge>
                    {e.id && writable && (
                      <form action={deleteEvent.bind(null, e.id)}>
                        <Button type="submit" variant="ghost" size="sm" aria-label="Изтрий">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
