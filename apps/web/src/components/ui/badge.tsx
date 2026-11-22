import { cn } from "cn";
import type { ComponentProps } from "react";
export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex w-fit items-center rounded-tag border bg-muted px-1.5 text-sm font-semibold text-foreground",
        className,
      )}
      {...props}
    />
  );
}
