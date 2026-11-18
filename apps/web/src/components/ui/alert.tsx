import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";

const alertVariants = cva(
  "group/alert relative grid w-full min-w-0 gap-2 rounded-card control-border bg-card p-4 text-start text-base has-[>svg]:grid-cols-[auto_minmax(0,1fr)] *:[svg]:row-span-2 *:[svg]:size-6",
  {
    variants: {
      variant: {
        default: "text-card-foreground",
        destructive: "border-destructive text-destructive",
        success: "border-success text-success",
        warning: "border-warning text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-semibold group-has-[>svg]/alert:col-start-2",
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("group-has-[>svg]/alert:col-start-2", className)}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn(
        "mt-1 justify-self-start group-has-[>svg]/alert:col-start-2",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertAction, AlertDescription, AlertTitle };
