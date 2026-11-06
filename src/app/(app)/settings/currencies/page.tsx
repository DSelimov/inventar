import type { Metadata } from "next";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { addCurrency, deleteCurrency, refreshCurrencyRates, updateCurrencyRate } from "@/lib/actions/currencies";
import { requireContext } from "@/lib/auth";
import { COMMON_CURRENCIES, listCurrencies } from "@/lib/fx";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Валути" };

export default async function CurrenciesPage() {
  const ctx = await requireContext("manage");
  const list = await listCurrencies(ctx.db);
  const base = ctx.org.currency;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title={`Валути спрямо ${base}`}
          description="Поръчка в чужда валута пази курса към датата си. Себестойността, салдата, маржът и фактурата са в основната валута по този курс."
          actions={
            list.length > 0 && (base === "EUR" || base === "BGN") ? (
              <Form action={refreshCurrencyRates}>
                <SubmitButton variant="secondary" size="sm">
                  <RefreshCw className="h-3.5 w-3.5" /> Курсове от ЕЦБ
                </SubmitButton>
              </Form>
            ) : undefined
          }
        />
        {list.length === 0 ? (
          <CardBody className="text-sm text-muted">Всички документи са в {base}. Добавете валута за поръчки от/към чужбина.</CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Валута</th>
                <th>Курс (1 единица = … {base})</th>
                <th>Обновен</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.code}>
                  <td>
                    <div className="font-mono font-semibold">{c.code}</div>
                    <div className="text-xs text-muted">{c.name}</div>
                  </td>
                  <td>
                    <Form action={updateCurrencyRate.bind(null, c.code)} className="flex items-center gap-2">
                      <Input name="rate" type="number" step="0.00000001" min={0} defaultValue={c.rate} className="w-36 tabular-nums" aria-label={`Курс ${c.code}`} />
                      <SubmitButton variant="ghost" size="sm">
                        Запази
                      </SubmitButton>
                    </Form>
                  </td>
                  <td className="text-xs text-muted">
                    {formatDateTime(c.updatedAt)} {c.source === "ecb" && <Badge tone="info">ЕЦБ</Badge>}
                  </td>
                  <td className="text-right">
                    <Form action={deleteCurrency.bind(null, c.code)}>
                      <ConfirmButton variant="ghost" size="sm" message={`Да премахна ли ${c.code}? Старите поръчки пазят своя курс.`} aria-label="Премахни">
                        <Trash2 className="h-3.5 w-3.5" />
                      </ConfirmButton>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card className="h-fit">
        <CardHeader title="Добави валута" />
        <CardBody>
          <Form action={addCurrency} className="space-y-3">
            <Field label="Код" hint="ISO 4217 — USD, GBP, RON, TRY…">
              <Input name="code" required maxLength={3} list="currency-codes" className="font-mono uppercase" placeholder="USD" />
              <datalist id="currency-codes">
                {Object.entries(COMMON_CURRENCIES)
                  .filter(([code]) => code !== base)
                  .map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
              </datalist>
            </Field>
            <Field label={`Курс (1 единица = … ${base})`} hint="Празно = днешният курс на ЕЦБ.">
              <Input name="rate" type="number" step="0.00000001" min={0} />
            </Field>
            <SubmitButton className="w-full">
              <Plus className="h-4 w-4" /> Добави
            </SubmitButton>
          </Form>
        </CardBody>
      </Card>
    </div>
  );
}
