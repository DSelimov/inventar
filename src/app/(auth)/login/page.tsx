import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getSession } from "@/lib/auth";
import { login } from "@/lib/actions/auth";
import { currentTenant, rootUrl } from "@/lib/tenant";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage() {
  const [session, tenant] = await Promise.all([getSession(), currentTenant()]);
  if (session) redirect(tenant ? "/" : "/portal");
  return (
    <>
      <h1 className="text-xl font-semibold">Вход</h1>
      <p className="mt-1 text-sm text-muted">{tenant ? <>Организация: <strong>{tenant.name}</strong></> : "Влезте с имейл и парола. След това избирате организация."}</p>
      <AuthForm
        action={login}
        submitLabel="Вход"
        fields={[
          { name: "email", label: "Имейл", type: "email", autoComplete: "email" },
          { name: "password", label: "Парола", type: "password", autoComplete: "current-password" },
        ]}
      />
      <p className="mt-6 text-center text-sm text-muted">
        Нямате акаунт?{" "}
        <Link href={tenant ? rootUrl("/register") : "/register"} className="font-medium text-accent hover:underline">
          Създайте организация
        </Link>
      </p>
    </>
  );
}
