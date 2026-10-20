import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { resetPassword } from "@/lib/actions/auth";
import { findPasswordLink } from "@/lib/password-tokens";

export const metadata: Metadata = { title: "Нова парола" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const found = await findPasswordLink(token);
  if (!found) {
    return (
      <>
        <h1 className="text-xl font-semibold">Линкът е невалиден</h1>
        <p className="mt-2 text-sm text-muted">Линкът е изтекъл или вече е използван. Заявете нов линк за парола или помолете администратора да изпрати поканата отново.</p>
        <p className="mt-6 text-center text-sm">
          <Link href="/forgot-password" className="font-medium text-accent hover:underline">
            Заявете нов линк
          </Link>
        </p>
      </>
    );
  }
  const invite = found.link.purpose === "invite";
  return (
    <>
      <h1 className="text-xl font-semibold">{invite ? "Добре дошли!" : "Нова парола"}</h1>
      <p className="mt-1 text-sm text-muted">
        {invite && found.organization ? <>Задайте парола, за да влезете в <strong>{found.organization.name}</strong>. </> : null}
        Акаунт: <strong>{found.user.email}</strong>
      </p>
      <AuthForm
        action={resetPassword}
        hidden={{ token }}
        submitLabel={invite ? "Задай парола и влез" : "Смени паролата"}
        fields={[
          { name: "password", label: "Нова парола", type: "password", autoComplete: "new-password", hint: "Поне 8 знака." },
          { name: "confirm", label: "Повторете паролата", type: "password", autoComplete: "new-password" },
        ]}
      />
      {!invite && <p className="mt-4 text-center text-xs text-muted">След смяната ще излезете от всички устройства.</p>}
    </>
  );
}
