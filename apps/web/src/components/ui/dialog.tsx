import { Dialog as Primitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useAndroidBack } from "@/hooks/use-android-back";
import { Button } from "./button";

export function Dialog<Payload>(props: Primitive.Root.Props<Payload>) {
  const back = useAndroidBack(props);
  return <Primitive.Root {...props} {...back} />;
}
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof Primitive.Title>) {
  return (
    <Primitive.Title
      data-slot="dialog-title"
      className={cn(
        "col-start-1 row-start-1 @max-[14rem]/dialog:col-span-full @max-[14rem]/dialog:row-start-2 self-center font-heading text-xl font-semibold",
        className,
      )}
      {...props}
    />
  );
}
export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof Primitive.Description>) {
  return (
    <Primitive.Description
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}
export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Popup>) {
  return (
    <Primitive.Portal>
      <Primitive.Backdrop className="fixed inset-0 z-50 bg-scrim" />
      <Primitive.Popup
        data-slot="dialog-content"
        className={cn(
          "@container/dialog fixed left-1/2 top-1/2 z-50 grid grid-cols-[minmax(0,1fr)_auto] items-start wrap-anywhere [&>:not([data-slot=dialog-title],[data-slot=dialog-close])]:col-span-full max-h-[85dvh] w-[min(26rem,calc(100%-16px))] -translate-x-1/2 -translate-y-1/2 gap-2 overflow-auto rounded-card border border-input bg-popover p-[min(1rem,4vw)] text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      >
        {children}
        <Primitive.Close
          data-slot="dialog-close"
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="col-start-2 row-start-1 justify-self-end"
              aria-label="Close"
            />
          }
        >
          <XIcon aria-hidden="true" />
        </Primitive.Close>
      </Primitive.Popup>
    </Primitive.Portal>
  );
}
