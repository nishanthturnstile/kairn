import { type RefObject, useEffect, useRef, useState } from "react";

type PopupActions = { close(): void; unmount(): void };
type AndroidWindow = Window & {
  CloseWatcher?: new () => EventTarget & { destroy(): void };
};

// Let the platform dismiss the open popup before Back navigates away from a draft.
export function useAndroidBack<Details extends { isCanceled: boolean }>({
  open,
  defaultOpen,
  onOpenChange,
  actionsRef: externalActions,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (next: boolean, details: Details) => void;
  actionsRef?: RefObject<PopupActions | null>;
}) {
  const localActions = useRef<PopupActions>(null);
  const actionsRef = externalActions ?? localActions;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(
    defaultOpen ?? false,
  );
  const visible = open ?? uncontrolledOpen;

  useEffect(() => {
    const Watcher = (window as AndroidWindow).CloseWatcher;
    if (!visible || !Watcher || !/Android/i.test(navigator.userAgent)) return;
    const watcher = new Watcher();
    watcher.addEventListener("cancel", (event) => {
      // A controlled sheet may stay open while its save is pending.
      if (event.cancelable) event.preventDefault();
      actionsRef.current?.close();
    });
    return () => watcher.destroy();
  }, [visible, actionsRef]);

  return {
    actionsRef,
    onOpenChange(next: boolean, details: Details) {
      onOpenChange?.(next, details);
      if (open === undefined && !details.isCanceled) setUncontrolledOpen(next);
    },
  };
}
