import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { alertCounts } from "@/lib/alerts";
import { requireContext } from "@/lib/auth";
import { subscriptionState } from "@/lib/plans";
import { formatDate, todayIso } from "@/lib/utils";
import { DELETION_GRACE_DAYS } from "@/lib/legal";
import { rootUrl, tenantUrl } from "@/lib/tenant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const alerts = await alertCounts(ctx.db, todayIso());
  const sub = subscriptionState(ctx.org);
  return (
    <div className="flex min-h-screen w-full max-w-full flex-col overflow-x-clip">
      <Topbar
        companyName={ctx.org.name}
        userName={ctx.user.name}
        role={ctx.role}
        currentOrgId={ctx.org.id}
        organizations={ctx.memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, url: tenantUrl(m.organization.subdomain) }))}
        portalUrl={rootUrl("/portal")}
        alertCount={alerts.total}
      />
      <div className="flex min-w-0 flex-1 flex-col md:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1">
          {ctx.org.deletionRequestedAt && (
            <div className="bg-danger px-4 py-2 text-center text-sm text-white md:px-8">
              Организацията ще бъде изтрита окончателно на {formatDate(new Date(ctx.org.deletionRequestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000))}.{" "}
              <Link href="/settings" className="font-medium underline">
                Откажи
              </Link>
            </div>
          )}
          {(sub.message || sub.warning) && (
            <div className={`px-4 py-2 text-center text-sm md:px-8 ${sub.readOnly ? "bg-danger text-white" : "bg-warning-soft text-warning"}`}>
              {sub.message ?? sub.warning}{" "}
              <Link href="/settings/plan" className="font-medium underline">
                Абонамент
              </Link>
            </div>
          )}
          <div className="w-full px-4 py-5 md:px-7 md:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
