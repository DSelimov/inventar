import type { Metadata } from "next";
import { PartnerFields } from "@/components/partners/partner-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { createPartner } from "@/lib/actions/partners";
import { requireContext } from "@/lib/auth";
import { Form } from "@/components/ui/form";

export const metadata: Metadata = { title: "Нов партньор" };

export default async function NewPartnerPage() {
  await requireContext("write");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Нов партньор" back={{ href: "/partners", label: "Партньори" }} />
      <Card>
        <CardBody>
          <Form action={createPartner}>
            <PartnerFields submitLabel="Създай партньор" />
          </Form>
        </CardBody>
      </Card>
    </div>
  );
}
