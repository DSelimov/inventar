import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getContext } from "@/lib/auth";
import { register } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Регистрация" };

export default async function RegisterPage() {
  if (await getContext()) redirect("/");
  return (
    <>
      <h1 className="text-xl font-semibold">Нова организация</h1>
      <p className="mt-1 text-sm text-muted">Създайте фирмен акаунт. Вие ставате собственик и можете да добавите колеги по-късно.</p>
      <AuthForm
        action={register}
        submitLabel="Създай организация"
        fields={[
          { name: "organization", label: "Име на фирмата", type: "text", autoComplete: "organization" },
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
