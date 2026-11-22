import { Tabs as Primitive } from "@base-ui/react/tabs";
import { cn } from "cn";
import type { ComponentProps } from "react";
export const Tabs = Primitive.Root;
export const TabsContent = Primitive.Panel;
export function TabsList({
  className,
  ...props
}: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List
      activateOnFocus
      data-slot="tabs-list"
      className={cn(
        "inline-flex max-w-full flex-wrap items-stretch gap-0.5 rounded-card bg-dock p-1 text-dock-foreground data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}
export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof Primitive.Tab>) {
  return (
    <Primitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex min-h-control items-center gap-1.5 rounded-control px-2 text-(length:--text-control) font-semibold not-data-active:enabled:hover:bg-dock-foreground/10 not-data-active:enabled:active:bg-dock-foreground/20 focus-visible:outline-dock-foreground focus-visible:-outline-offset-2 motion-safe:transition-colors",
        className,
      )}
      {...props}
    />
  );
}
