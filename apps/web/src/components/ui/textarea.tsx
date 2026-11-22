import { cn } from "cn";
import type { ComponentProps } from "react";
import { fieldControlClass } from "./input";
export function Textarea({
  className,
  rows = 3,
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(fieldControlClass, "resize-y", className)}
      {...props}
    />
  );
}
