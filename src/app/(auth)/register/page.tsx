import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getSession } from "@/lib/auth";
import { register } from "@/lib/actions/auth";
import { APP_DOMAIN, APP_PROTOCOL, currentTenant, rootUrl } from "@/lib/tenant";

export const metadata: Metadata = { title: "Регистрация" };

export default async function RegisterPage() {
  const [session, tenant] = await Promise.all([getSession(), currentTenant()]);
  if (tenant) redirect(rootUrl("/register"));
  if (session) redirect("/portal");
  return (
    <>
      <h1 className="text-xl font-semibold">Нова организация</h1>
      <p className="mt-1 text-sm text-muted">Всяка организация получава собствена база данни и собствен адрес. Вие ставате собственик и добавяте колеги по-късно.</p>
      <AuthForm
        action={register}
        submitLabel="Създай организация"
        fields={[
          { name: "organization", label: "Име на фирмата", type: "text", autoComplete: "organization" },
          { name: "subdomain", label: "Адрес (поддомейн)", type: "text", required: false, placeholder: "moyafirma", pattern: "[a-z0-9-]{3,63}", hint: `Ще получите ${APP_PROTOCOL}://<поддомейн>.${APP_DOMAIN}. Малки латински букви, цифри и тире. Празно = от името.` },
          { name: "name", label: "Вашето име", type: "text", autoComplete: "name" },
          { name: "email", label: "Имейл", type: "email", autoComplete: "email" },
          { name: "password", label: "Парола (мин. 8 знака)", type: "password", autoComplete: "new-password" },
        ]}
      />
      <p className="mt-6 text-center text-sm text-muted">
        Вече имате акаунт?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Вход
        </Link>
      </p>
    </>
  );
}
