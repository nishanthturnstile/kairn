import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";
import type * as React from "react";

const buttonVariants = cva(
  "group/button inline-flex min-h-touch min-w-touch max-w-full items-center justify-center rounded-control control-border border-transparent text-center text-base font-semibold transition-colors select-none disabled:cursor-not-allowed disabled:border-border disabled:bg-card disabled:text-muted-foreground aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:underline",
        outline:
          "border-border bg-card text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:underline aria-expanded:underline",
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "border-destructive bg-card text-destructive hover:underline",
        link: "text-primary underline underline-offset-4 hover:bg-muted disabled:border-transparent disabled:no-underline",
      },
      size: {
        default: "gap-2 px-4 py-2",
        xs: "gap-1 px-2 py-1",
        sm: "gap-2 px-3 py-1",
        lg: "gap-2 px-6 py-3",
        icon: "size-touch",
        "icon-xs": "size-touch [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-touch",
        "icon-lg": "size-touch [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
