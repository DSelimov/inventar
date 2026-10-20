"use client";

import type { ComponentProps } from "react";
import { Button } from "./button";

/** Submit button that asks for confirmation before submitting its form. */
export function ConfirmButton({
  message = "Сигурни ли сте? Действието е необратимо.",
  ...props
}: ComponentProps<typeof Button> & { message?: string }) {
  return (
    <Button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      {...props}
    />
  );
}
