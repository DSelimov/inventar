import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function TableWrap({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("overflow-x-auto bg-surface", className)} {...props} />;
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("table", className)} {...props} />;
}
