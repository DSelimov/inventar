import { Badge, type Tone } from "@/components/ui/badge";
import type { OrgStatus } from "@/db/control-schema";

export const ORG_STATUS: Record<OrgStatus, { label: string; tone: Tone }> = {
  active: { label: "Активна", tone: "success" },
  provisioning: { label: "Подготвя се", tone: "info" },
  suspended: { label: "Спряна", tone: "warning" },
  failed: { label: "Неуспешна подготовка", tone: "danger" },
};

export function OrgStatusBadge({ status }: { status: OrgStatus }) {
  return <Badge tone={ORG_STATUS[status].tone}>{ORG_STATUS[status].label}</Badge>;
}
