import type { Metadata } from "next";
import { Download } from "lucide-react";
import { ImportForm } from "@/components/settings/import-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PartnerImportForm } from "@/components/settings/partner-import-form";
import { importItems, importPartners } from "@/lib/actions/import";
import { requireContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Импорт / Експорт" };

const EXPORTS = [
  { href: "/api/export/items", label: "Артикули", hint: "код, име, баркод, категория, наличност, цени" },
  { href: "/api/export/stock", label: "Наличности по локации", hint: "артикул × локация × количество" },
  { href: "/api/export/movements", label: "Складови движения", hint: "последните 5000 движения" },
  { href: "/api/export/template", label: "Шаблон за импорт", hint: "празен CSV с правилните колони" },
];

export default async function ImportPage() {
  await requireContext("manage");
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Импорт на артикули от CSV"
          description="Колони: sku, name, barcode, category, quantity, min, unit, cost, price, location, description. Разпознават се и българските заглавия, и списъкът със стоки, експортиран от Microinvest Склад Pro (Код, Име, Баркод1, Мярка, Група, Доставна цена, Цена на дребно, Количество)."
        />
        <CardBody>
          <ImportForm action={importItems} />
        </CardBody>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Експорт" description="CSV с разделител „;“, отваря се директно в Excel." />
        <ul className="divide-y divide-line">
          {EXPORTS.map((e) => (
            <li key={e.href}>
              <a href={e.href} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                <Download className="h-4 w-4 text-muted" />
                <span className="flex-1">
                  <span className="font-medium">{e.label}</span>
                  <span className="block text-xs text-muted">{e.hint}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="Импорт на партньори от CSV" description="Клиенти и доставчици — напр. списъкът с партньори от Microinvest Склад Pro (Фирма, Булстат, Данъчен номер, МОЛ, Град, Адрес, Телефон)." />
        <CardBody>
          <PartnerImportForm action={importPartners} />
        </CardBody>
      </Card>
    </div>
  );
}
