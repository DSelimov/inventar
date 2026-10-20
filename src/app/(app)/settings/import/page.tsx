import type { Metadata } from "next";
import { Download } from "lucide-react";
import { ImportForm } from "@/components/settings/import-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { importItems } from "@/lib/actions/import";
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
        <CardHeader title="Импорт на артикули от CSV" description="Колони: sku, name, barcode, category, quantity, min, unit, cost, price, location, description (български заглавия също се разпознават)." />
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
    </div>
  );
}
