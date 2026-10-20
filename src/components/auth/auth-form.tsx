"use client";

import { useActionState } from "react";
import { Field, Input } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";

export type AuthField = { name: string; label: string; type: string; autoComplete?: string };
export type AuthAction = (prev: string | undefined, fd: FormData) => Promise<string | undefined>;

export function AuthForm({ action, fields, submitLabel }: { action: AuthAction; fields: AuthField[]; submitLabel: string }) {
  const [error, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="mt-6 space-y-4">
      {fields.map((f) => (
        <Field key={f.name} label={f.label}>
          <Input name={f.name} type={f.type} required autoComplete={f.autoComplete} minLength={f.type === "password" ? 8 : undefined} />
        </Field>
      ))}
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <SubmitButton className="w-full">{submitLabel}</SubmitButton>
    </form>
  );
}
