import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { verifyTwoFactor } from "@/lib/actions/auth";
import { readTwoFactor } from "@/lib/auth";

export const metadata: Metadata = { title: "Код за вход" };

export default async function TwoFactorPage() {
  if (!(await readTwoFactor())) redirect("/login?expired=1");
  return (
    <>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-accent" />
        <h1 className="text-xl font-semibold">Двуфакторна защита</h1>
      </div>
      <p className="mt-1 text-sm text-muted">Въведете 6-цифрения код от приложението за удостоверяване. Ако нямате достъп до телефона, използвайте някой от кодовете за възстановяване.</p>
      <AuthForm action={verifyTwoFactor} submitLabel="Потвърди" fields={[{ name: "code", label: "Код", type: "text", autoComplete: "one-time-code", placeholder: "123456", pattern: "[0-9 ]{6,7}|[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}" }]} />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-muted hover:text-accent">
          Обратно към вход
        </Link>
      </p>
    </>
  );
}
