import { Toast } from "@base-ui/react/toast";
import { CheckIcon, XIcon } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { Button } from "./button";

export function useReceiptToast() {
  const { add } = Toast.useToastManager();
  return useCallback(
    (title: string) => {
      add({ id: "fold-receipt", title, priority: "low" });
    },
    [add],
  );
}

function ReceiptViewport() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport aria-keyshortcuts="F6" className="fold-toast-viewport">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            data-slot="receipt-toast"
            className="flex min-w-0 items-center gap-2 rounded-card control-border border-receipt bg-receipt p-1 ps-2 text-receipt-foreground shadow-md"
          >
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-[3px] bg-key text-key-foreground"
            >
              <CheckIcon size={16} />
            </span>
            <Toast.Title className="min-w-0 flex-1 wrap-anywhere font-semibold">
              {toast.title}
            </Toast.Title>
            <Toast.Close
              aria-hidden={false}
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-inherit hover:bg-receipt-foreground/15 focus-visible:outline-current"
                  aria-label="Dismiss notification"
                />
              }
            >
              <XIcon aria-hidden="true" />
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={5000} limit={1}>
      {children}
      <ReceiptViewport />
    </Toast.Provider>
  );
}
