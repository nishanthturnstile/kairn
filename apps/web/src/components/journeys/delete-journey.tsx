import type { PrivateJourney } from "@kairn/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useReceiptToast } from "@/components/ui/toast";
import { refreshJourneyViews } from "@/lib/journey-access";
import { JourneyRequestError, journeyResult } from "@/lib/journey-api";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";

export function DeleteJourney({
  journey,
  scope,
}: {
  journey: PrivateJourney;
  scope: AccountScope;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<
    "fresh-session" | "unavailable" | "retry"
  >();
  const deleting = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const receipt = useReceiptToast();
  const { refresh } = useSessionAccess();

  async function removeJourney() {
    if (deleting.current) return;
    deleting.current = true;
    setPending(true);
    setError(undefined);

    try {
      const result = journeyResult(
        await scope.api.DELETE("/api/v1/journeys/{journeyId}", {
          params: { path: { journeyId: journey.id } },
        }),
        scope,
        refresh,
      );
      await refreshJourneyViews(scope);
      setOpen(false);
      await navigate({ to: "/journeys", replace: true });
      receipt(
        result.confirmation === "confirmed"
          ? "Journey deleted"
          : "Journey deleted. Recovery confirmation pending.",
      );
    } catch (cause) {
      if (scope.signal.aborted) return;
      const failure = cause instanceof JourneyRequestError ? cause : undefined;
      setError(
        failure?.code === "fresh_session_required"
          ? "fresh-session"
          : failure?.status === 404
            ? "unavailable"
            : "retry",
      );
    } finally {
      deleting.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (deleting.current) details.cancel();
        else {
          setOpen(next);
          if (next) setError(undefined);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="text-destructive"
          />
        }
      >
        <Trash2 aria-hidden="true" data-icon="inline-start" />
        Delete journey
      </DialogTrigger>
      <DialogContent initialFocus={cancel}>
        <DialogTitle>Delete journey?</DialogTitle>
        <DialogDescription>
          Permanently delete{" "}
          <strong className="font-semibold">{journey.title}</strong>? Members
          will lose access and pending invitations will stop working. Recording
          links and sharing permissions will be removed. Original recordings
          will stay in their owners’ accounts.
        </DialogDescription>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error === "fresh-session"
                ? "For this action, sign out and sign back in, then reopen the journey."
                : error === "unavailable"
                  ? "This journey is unavailable or you no longer have permission to delete it."
                  : "Couldn’t confirm deletion. Try again to check the result."}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <DialogClose
            render={
              <Button
                ref={cancel}
                type="button"
                variant="outline"
                disabled={pending}
              />
            }
          >
            Cancel
          </DialogClose>
          {error === "fresh-session" ? (
            <ButtonLink render={<Link to="/account" />}>
              Go to Account
            </ButtonLink>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={pending || error === "unavailable"}
              onClick={() => void removeJourney()}
            >
              {pending ? "Deleting…" : "Delete journey"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
