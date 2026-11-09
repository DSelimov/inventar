import type { Metadata } from "next";
import { PartnerFields } from "@/components/partners/partner-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { createPartner } from "@/lib/actions/partners";
import { requireContext } from "@/lib/auth";
import { Form } from "@/components/ui/form";
import { listPriceGroups } from "@/lib/queries";

export const metadata: Metadata = { title: "Нов партньор" };

export default async function NewPartnerPage() {
  const ctx = await requireContext("write");
  const priceGroups = await listPriceGroups(ctx.db);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader help="partners" title="Нов партньор" back={{ href: "/partners", label: "Партньори" }} />
      <Card>
        <CardBody>
          <Form action={createPartner}>
            <PartnerFields submitLabel="Създай партньор" priceGroups={priceGroups} />
          </Form>
        </CardBody>
      </Card>
    </div>
  );
}
