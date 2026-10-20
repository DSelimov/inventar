import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getContext } from "@/lib/auth";
import { login } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage() {
  if (await getContext()) redirect("/");
  return (
    <>
      <h1 className="text-xl font-semibold">Вход</h1>
      <p className="mt-1 text-sm text-muted">Влезте с имейл и парола.</p>
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
        <Link href="/register" className="font-medium text-accent hover:underline">
          Създайте организация
        </Link>
      </p>
    </>
  );
}
