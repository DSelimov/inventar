import { ExternalLink, RefreshCw } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Organization } from "@/db/control-schema";
import type { Db } from "@/db/tenant";
import type { Shipment } from "@/db/tenant-schema";
import { createWaybillAction, syncCarriersAction } from "@/lib/actions/integrations";
import { getIntegration, PROVIDERS } from "@/lib/integrations/core";
import { COURIERS, type CourierId } from "@/lib/integrations/couriers";
import { courierOffices } from "@/lib/integrations/waybills";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { WaybillForm } from "./waybill-form";

/** Товарителница на изходяща пратка: създаване през включен куриер или статус и етикет на съществуваща. */
export async function WaybillCard({ shipment, db, org, phone, cod, writable }: { shipment: Shipment; db: Db; org: Organization; phone: string; cod: number | null; writable: boolean }) {
  if (shipment.direction !== "outbound") return null;
  if (shipment.carrierProvider && shipment.trackingNumber) {
    return (
      <Card>
        <CardHeader title="Товарителница" description={`${PROVIDERS[shipment.carrierProvider as CourierId]?.name ?? shipment.carrier} · № ${shipment.trackingNumber}`} />
        <CardBody className="space-y-2 text-sm">
          <div>{shipment.carrierStatus ?? "—"}</div>
          {shipment.carrierStatusAt && <div className="text-xs text-muted">{formatDateTime(shipment.carrierStatusAt)}</div>}
          {shipment.codAmount ? (
            <div className="text-xs text-muted">
              Наложен платеж {formatMoney(shipment.codAmount, org.currency)}
              {shipment.codCollectedAmount ? ` · събран ${formatMoney(shipment.codCollectedAmount, org.currency)}` : ""}
              {shipment.codPaidAt ? ` · изплатен ${formatDateTime(shipment.codPaidAt)}` : ""}
            </div>
          ) : null}
          <div className="flex gap-2 pt-1">
            <a href={`/print/carrier-label/${shipment.id}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "sm")}>
              <ExternalLink className="h-4 w-4" /> Етикет
            </a>
            {writable && (shipment.status === "pending" || shipment.status === "in_transit") && (
              <Form action={syncCarriersAction}>
                <SubmitButton variant="ghost" size="sm">
                  <RefreshCw className="h-4 w-4" /> Обнови статуса
                </SubmitButton>
              </Form>
            )}
          </div>
        </CardBody>
      </Card>
    );
  }
  if (!writable || shipment.status === "delivered" || shipment.status === "cancelled") return null;
  const enabled = [];
  for (const id of Object.keys(COURIERS) as CourierId[]) {
    const cfg = await getIntegration(db, id);
    if (!cfg.enabled) continue;
    let offices: Awaited<ReturnType<typeof courierOffices>> = [];
    try {
      offices = await courierOffices(db, id, String(org.id));
    } catch {
      /* без списък — кодът се въвежда ръчно */
    }
    enabled.push({ id, name: PROVIDERS[id].name, officesOnly: id === "boxnow", offices: offices.map(({ code, name, city, locker }) => ({ code, name, city, locker })) });
  }
  if (!enabled.length) return null;
  return (
    <Card>
      <CardHeader title="Товарителница" description="Създава се при куриера; при „доставена“ пратката се приключва сама." />
      <CardBody>
        <WaybillForm couriers={enabled} phone={phone} cod={cod} weight={1} action={createWaybillAction.bind(null, shipment.id)} />
      </CardBody>
    </Card>
  );
}
