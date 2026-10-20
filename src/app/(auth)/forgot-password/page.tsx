import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { requestPasswordReset } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Забравена парола" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold">Забравена парола</h1>
      {sent ? (
        <div className="mt-6 flex gap-3 rounded-lg bg-accent-soft px-4 py-3 text-sm">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <p>Ако има акаунт с този имейл, изпратихме линк за нова парола. Линкът е валиден 1 час. Проверете и папката за спам.</p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">Въведете имейла си и ще ви изпратим линк за нова парола.</p>
          <AuthForm action={requestPasswordReset} submitLabel="Изпрати линк" fields={[{ name: "email", label: "Имейл", type: "email", autoComplete: "email" }]} />
        </>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Обратно към вход
        </Link>
      </p>
    </>
  );
}
