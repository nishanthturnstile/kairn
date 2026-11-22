import { cn } from "cn";
import type { ComponentProps } from "react";

export const fieldControlClass =
  "min-h-control w-full min-w-0 rounded-control control-border border-input bg-card px-2.5 py-1 text-base font-normal text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(fieldControlClass, className)}
      {...props}
    />
  );
}
