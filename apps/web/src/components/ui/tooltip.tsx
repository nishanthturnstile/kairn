"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "cn";
import { createContext, useContext, useId, useState } from "react";

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  );
}

const Description = createContext<string | undefined>(undefined);
function Tooltip({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: TooltipPrimitive.Root.Props) {
  const id = useId();
  const [shown, setShown] = useState(defaultOpen ?? false);
  return (
    <Description.Provider value={(open ?? shown) ? id : undefined}>
      <TooltipPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={(next, event) => {
          onOpenChange?.(next, event);
          if (!event.isCanceled) setShown(next);
        }}
        {...props}
      />
    </Description.Provider>
  );
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  const description = useContext(Description);
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
      aria-describedby={
        [props["aria-describedby"], description].filter(Boolean).join(" ") ||
        undefined
      }
    />
  );
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 5,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const description = useContext(Description);
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          role="tooltip"
          id={description}
          data-slot="tooltip-content"
          className={cn(
            "z-50 max-w-[min(20rem,calc(100vw-1rem))] wrap-anywhere rounded-control bg-foreground px-2 py-1 text-sm text-background motion-safe:transition-opacity motion-safe:duration-100 data-starting-style:opacity-0 data-ending-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
