import { cn } from "cn";
import type { ComponentProps } from "react";
export function Progress({ className, ...props }: ComponentProps<"progress">) {
  return (
    <progress
      data-slot="progress"
      className={cn(
        "h-2 w-full overflow-hidden rounded-tag bg-muted accent-primary [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary",
        className,
      )}
      {...props}
    />
  );
}
