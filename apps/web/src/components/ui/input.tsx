import { cn } from "cn";
import type { ComponentProps } from "react";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "min-h-touch w-full min-w-0 rounded-control control-border border-input bg-card px-3 py-2 text-base font-normal placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
