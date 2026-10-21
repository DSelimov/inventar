import { Badge, type Tone } from "@/components/ui/badge";
import type { CountStatus } from "@/db/tenant-schema";

const STATUS: Record<CountStatus, { label: string; tone: Tone }> = {
  open: { label: "В процес", tone: "info" },
  applied: { label: "Приложена", tone: "success" },
  cancelled: { label: "Отказана", tone: "neutral" },
};

export function CountStatusBadge({ status }: { status: CountStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}
