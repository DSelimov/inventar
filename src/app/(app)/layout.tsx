import { Sidebar } from "@/components/layout/sidebar";
import { requireContext } from "@/lib/auth";
import { rootUrl, tenantUrl } from "@/lib/tenant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  return (
    <div className="flex min-h-screen w-full max-w-full flex-col overflow-x-hidden md:flex-row">
      <Sidebar
        companyName={ctx.org.name}
        userName={ctx.user.name}
        role={ctx.role}
        currentOrgId={ctx.org.id}
        organizations={ctx.memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, url: tenantUrl(m.organization.subdomain) }))}
        portalUrl={rootUrl("/portal")}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
