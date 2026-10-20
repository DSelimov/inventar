"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";
import { useFormPending } from "./form";
import type { ComponentProps } from "react";

export function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const status = useFormStatus();
  const formPending = useFormPending();
  const pending = status.pending || formPending;
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}
