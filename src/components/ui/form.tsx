"use client";

import { createContext, startTransition, useActionState, useContext, useRef, type ComponentProps } from "react";
import type { ActionResult } from "@/lib/action";
import { consumeFlash, toast } from "./toaster";

type State = (NonNullable<ActionResult> & { inline?: boolean }) | undefined;

const PendingContext = createContext(false);
/** true докато формата около компонента се изпраща (за SubmitButton/ConfirmButton). */
export const useFormPending = () => useContext(PendingContext);

/**
 * Заместител на <form action={serverAction}>: показва { error } до полетата (или като toast, ако
 * формата е само бутон), { ok } като toast, не позволява двойно изпращане и не изчиства полетата при грешка.
 */
export function Form({
  action,
  resetOnSuccess = true,
  children,
  ...props
}: Omit<ComponentProps<"form">, "action"> & { action: (fd: FormData) => Promise<ActionResult | void>; resetOnSuccess?: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState(async (_prev: State, fd: FormData): Promise<State> => {
    const result = (await action(fd)) ?? undefined;
    const form = ref.current;
    // форма само с бутони (изтриване, смяна на статус): грешката като toast, иначе до полетата
    const hasFields = Boolean(form?.querySelector("input:not([type=hidden]), select, textarea"));
    if (result?.error) {
      if (!hasFields) toast(result.error, "error");
    } else {
      if (result?.ok) toast(result.ok);
      if (resetOnSuccess && form?.isConnected) form.reset();
    }
    consumeFlash();
    return { ...result, inline: Boolean(result?.error && hasFields) };
  }, undefined);

  const inlineError = state?.inline ? state.error : null;

  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={ref}
        {...props}
        aria-busy={pending || undefined}
        onSubmit={(e) => {
          props.onSubmit?.(e);
          if (e.defaultPrevented) return; // отказано от onSubmit на формата
          e.preventDefault();
          if (pending) return; // без двойно изпращане
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => dispatch(fd));
        }}
      >
        {children}
        {inlineError && (
          <p role="alert" data-form-error className="basis-full rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {inlineError}
          </p>
        )}
      </form>
    </PendingContext.Provider>
  );
}
