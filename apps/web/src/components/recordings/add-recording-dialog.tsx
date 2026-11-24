import type { RecordingCommit } from "@kairn/contracts/recordings";
import { Plus } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AccountScope } from "@/lib/session";
import { RecordingImportFlow } from "./import-flow";

export function AddRecordingDialog({
  scope,
  journeyId,
  initiallyOpen = false,
  onInitialOpen,
  suspension,
  onComplete,
}: {
  scope: AccountScope;
  journeyId: string;
  initiallyOpen?: boolean;
  onInitialOpen?: () => void;
  suspension?: ReactNode;
  onComplete: (receipt: RecordingCommit) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const importer = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const initialOpening = useRef(initiallyOpen);
  const [open, setOpen] = useState(initiallyOpen);
  const suspended = Boolean(suspension);

  useEffect(() => {
    if (!open || !scope.accountId || !initialOpening.current) return;
    initialOpening.current = false;
    onInitialOpen?.();
  }, [open, scope.accountId, onInitialOpen]);

  useLayoutEffect(() => {
    if (!open) {
      lastFocused.current = null;
      restoreFocus.current = false;
      return;
    }
    const active = document.activeElement;
    if (suspended) {
      if (active === document.body || importer.current?.contains(active)) {
        restoreFocus.current = true;
        title.current?.focus({ preventScroll: true });
      }
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      if (
        active === title.current &&
        importer.current?.contains(lastFocused.current)
      )
        lastFocused.current?.focus();
    }
  }, [open, suspended]);

  if (!scope.accountId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        disabled={suspended}
        render={
          <Button
            ref={trigger}
            type="button"
            variant="outline"
            className="px-2 @min-[18rem]/journey-detail:px-3"
          />
        }
      >
        <Plus
          aria-hidden="true"
          data-icon="inline-start"
          className="hidden @min-[18rem]/journey-detail:block"
        />
        Add recording
      </DialogTrigger>
      <DialogContent
        className="w-[min(40rem,calc(100%-16px))]"
        initialFocus={title}
        finalFocus={() => {
          const button = trigger.current;
          if (!button || button.disabled) return undefined;
          requestAnimationFrame(() => {
            if (button.isConnected && document.activeElement === button)
              button.scrollIntoView({ block: "nearest", inline: "nearest" });
          });
          return button;
        }}
      >
        <DialogTitle ref={title} tabIndex={-1}>
          Add recording
        </DialogTitle>
        {suspended ? (
          suspension
        ) : (
          <DialogDescription>
            Upload a GPX file and review it before adding it to this journey.
          </DialogDescription>
        )}
        {open && (
          <div
            ref={importer}
            hidden={suspended}
            inert={suspended}
            onFocusCapture={(event) => {
              if (event.target instanceof HTMLElement)
                lastFocused.current = event.target;
            }}
          >
            <div className="grid min-w-0 gap-4 pt-3">
              <RecordingImportFlow
                scope={scope}
                accountId={scope.accountId}
                fixedJourney={journeyId}
                onComplete={(receipt) => {
                  setOpen(false);
                  onComplete(receipt);
                }}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
