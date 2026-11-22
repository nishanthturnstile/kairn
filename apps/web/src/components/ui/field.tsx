import { cn } from "cn";
import type { ComponentProps } from "react";

export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

export function Field({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="field" className={cn("grid gap-1", className)} {...props} />
  );
}

export function FieldLabel({
  children,
  className,
  htmlFor,
  ...props
}: ComponentProps<"label"> & { htmlFor: string }) {
  return (
    <label
      data-slot="field-label"
      className={cn("text-sm font-semibold", className)}
      htmlFor={htmlFor}
      {...props}
    >
      {children}
    </label>
  );
}
