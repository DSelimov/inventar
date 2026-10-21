import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { requireContext } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  return (
    <>
      <PageHeader help="subscription" title="Настройки" description={`${ctx.org.name} · вашата роля: ${ctx.role === "owner" ? "собственик" : ctx.role}`} />
      <SettingsTabs manage={can(ctx.role, "manage")} />
      {children}
    </>
  );
}
