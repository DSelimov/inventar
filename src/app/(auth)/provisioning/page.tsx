import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { currentTenant, rootUrl } from "@/lib/tenant";

export const metadata: Metadata = { title: "Подготовка" };

export default async function ProvisioningPage() {
  const tenant = await currentTenant();
  if (!tenant) redirect(rootUrl("/portal"));
  if (tenant.status === "active") redirect("/");
  const failed = tenant.status === "failed";
  return (
    <>
      {!failed && <meta httpEquiv="refresh" content="5" />}
      <div className="flex items-center gap-3">
        {!failed && <Loader2 className="h-5 w-5 animate-spin text-accent" />}
        <h1 className="text-xl font-semibold">{failed ? "Подготовката не успя" : tenant.status === "suspended" ? "Организацията е спряна" : "Подготвяме организацията"}</h1>
      </div>
      <p className="mt-2 text-sm text-muted">
        {failed
          ? "Базата данни на организацията не можа да бъде създадена. Свържете се с администратора на системата."
          : tenant.status === "suspended"
            ? "Достъпът до тази организация е временно спрян."
            : `Създаваме базата данни за „${tenant.name}“. Страницата ще се опресни автоматично.`}
      </p>
      <a href={rootUrl("/portal")} className="mt-6 inline-block text-sm font-medium text-accent hover:underline">
        Към портала
      </a>
    </>
  );
}
