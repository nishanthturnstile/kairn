import { cn } from "cn";
import type { ComponentProps } from "react";
import { fieldControlClass } from "./input";
export function NativeSelect({
  className,
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        fieldControlClass,
        "enabled:hover:border-foreground",
        className,
      )}
      {...props}
    />
  );
}
