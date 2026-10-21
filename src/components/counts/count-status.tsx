import { Badge, statusTone } from "@/components/ui/badge";
import type { CountStatus } from "@/db/tenant-schema";
import { label } from "@/lib/utils";

export function CountStatusBadge({ status }: { status: CountStatus }) {
  return <Badge tone={statusTone[status]}>{label(status)}</Badge>;
}
