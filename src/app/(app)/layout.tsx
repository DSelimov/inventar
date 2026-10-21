import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import { alertCounts } from "@/lib/alerts";
import { requireContext } from "@/lib/auth";
import { subscriptionState } from "@/lib/plans";
import { todayIso } from "@/lib/utils";
import { rootUrl, tenantUrl } from "@/lib/tenant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const alerts = await alertCounts(ctx.db, todayIso());
  const sub = subscriptionState(ctx.org);
  return (
    <div className="flex min-h-screen w-full max-w-full flex-col overflow-x-hidden md:flex-row">
      <Sidebar
        companyName={ctx.org.name}
        userName={ctx.user.name}
        role={ctx.role}
        currentOrgId={ctx.org.id}
        organizations={ctx.memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, url: tenantUrl(m.organization.subdomain) }))}
        portalUrl={rootUrl("/portal")}
        alertCount={alerts.total}
      />
      <main className="min-w-0 flex-1">
        {(sub.message || sub.warning) && (
          <div className={`px-4 py-2 text-center text-sm md:px-8 ${sub.readOnly ? "bg-danger text-white" : "bg-warning-soft text-warning"}`}>
            {sub.message ?? sub.warning}{" "}
            <Link href="/settings/plan" className="font-medium underline">
              Абонамент
            </Link>
          </div>
        )}
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
