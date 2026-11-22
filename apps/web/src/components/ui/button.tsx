import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { FoldMark } from "./fold-mark";

const buttonVariants = cva(
  "fold-button group/button inline-flex min-w-0 max-w-full items-center justify-center gap-2 rounded-control control-border border-transparent text-center font-semibold leading-tight select-none transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground has-[[data-slot=button-key]]:pe-1",
        outline:
          "border-input bg-card text-foreground not-disabled:not-aria-disabled:hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground not-disabled:not-aria-disabled:hover:bg-accent aria-expanded:bg-accent",
        ghost:
          "text-foreground not-disabled:not-aria-disabled:hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "border-destructive bg-card text-destructive not-disabled:not-aria-disabled:hover:bg-destructive/10",
        link: "text-primary underline underline-offset-4 not-disabled:not-aria-disabled:hover:bg-muted",
      },
      size: {
        default: "min-h-control px-3 py-1 text-(length:--text-control)",
        xs: "min-h-[max(var(--fold-target-floor),1.5rem)] px-1.5 py-0.5 text-sm",
        sm: "min-h-[max(var(--fold-target-floor),1.875rem)] px-2 py-1 text-sm",
        lg: "min-h-touch px-4 py-2 text-base",
        icon: "size-control",
        "icon-xs": "size-[max(var(--fold-target-floor),1.5rem)]",
        "icon-sm": "size-[max(var(--fold-target-floor),1.875rem)]",
        "icon-lg": "size-touch",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonStyle = VariantProps<typeof buttonVariants>;
type Feedback = "idle" | "pending" | "success";

function Button({
  className,
  children,
  variant = "default",
  size = "default",
  feedback = "idle",
  ...props
}: Omit<ComponentProps<typeof ButtonPrimitive>, "className"> & {
  className?: string;
} & ButtonStyle & {
    feedback?: Feedback;
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-busy={feedback === "pending" || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
      <ButtonKey variant={variant} size={size} feedback={feedback} />
    </ButtonPrimitive>
  );
}

function ButtonKey({
  variant,
  size,
  feedback = "idle",
}: ButtonStyle & { feedback?: Feedback }) {
  if (variant !== "default" || size?.startsWith("icon")) return null;
  return (
    <span
      data-slot="button-key"
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-[3px] bg-key text-key-foreground motion-safe:transition-transform motion-safe:duration-150 "
    >
      {feedback === "pending" ? (
        <FoldMark moving />
      ) : feedback === "success" ? (
        <CheckIcon />
      ) : (
        <ArrowRightIcon />
      )}
    </span>
  );
}

function ButtonLink({
  render,
  variant = "default",
  size = "default",
  className,
  children,
  ...props
}: Omit<ComponentProps<"a">, "className"> &
  ButtonStyle & {
    className?: string;
    render?: useRender.ComponentProps<"a">["render"];
  }) {
  return useRender({
    defaultTagName: "a",
    render,
    state: { slot: "button", variant, size },
    props: {
      ...props,
      className: cn(buttonVariants({ variant, size }), className),
      children: (
        <>
          {children}
          <ButtonKey variant={variant} size={size} />
        </>
      ),
    },
  });
}

export { Button, ButtonLink, buttonVariants };
