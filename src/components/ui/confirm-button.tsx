"use client";

import type { ComponentProps } from "react";
import { Button } from "./button";
import { useFormPending } from "./form";

/** Submit button that asks for confirmation before submitting its form. */
export function ConfirmButton({
  message = "Сигурни ли сте? Действието е необратимо.",
  ...props
}: ComponentProps<typeof Button> & { message?: string }) {
  const pending = useFormPending();
  return (
    <Button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      {...props}
      disabled={pending || props.disabled}
    />
  );
}
