import { cn } from "cn";
import type { ComponentProps } from "react";

type ChoiceProps = Omit<ComponentProps<"input">, "type">;
const choiceClass =
  "size-[1.125rem] shrink-0 accent-primary disabled:cursor-not-allowed";

export function Checkbox({ className, ...props }: ChoiceProps) {
  return (
    <input
      {...props}
      type="checkbox"
      data-slot="checkbox"
      className={cn(choiceClass, className)}
    />
  );
}
export function Radio({ className, ...props }: ChoiceProps) {
  return (
    <input
      {...props}
      type="radio"
      data-slot="radio"
      className={cn(choiceClass, className)}
    />
  );
}
export function Switch({ className, ...props }: ChoiceProps) {
  return (
    <input
      {...props}
      type="checkbox"
      // biome-ignore lint/a11y/useAriaPropsForRole: The native checkbox exposes live checked state, including uncontrolled changes.
      role="switch"
      data-slot="switch"
      className={cn(
        "relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full border border-input bg-card before:absolute before:start-0.5 before:top-1/2 before:size-3.5 before:-translate-y-1/2 before:rounded-full before:bg-muted-foreground checked:border-primary checked:bg-primary checked:before:start-auto checked:before:end-0.5 checked:before:bg-primary-foreground disabled:cursor-not-allowed disabled:opacity-55 forced-colors:appearance-auto forced-colors:before:hidden",
        className,
      )}
    />
  );
}
export function ChoiceLabel({
  className,
  htmlFor,
  children,
  ...props
}: ComponentProps<"label">) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "flex min-h-control cursor-pointer items-center gap-2 has-disabled:cursor-not-allowed has-disabled:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}
