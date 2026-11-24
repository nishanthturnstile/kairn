import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { journeyResult } from "@/lib/journey-api";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import { JourneyLoading, JourneyRetry } from "../journeys/states";

export function ManageRecordingAccess({
  scope,
  journeyId,
  id,
  sourceId,
  archived,
  changed,
}: {
  scope: AccountScope;
  journeyId: string;
  id: string;
  sourceId: string;
  archived: boolean;
  changed: (message: string) => void;
}) {
  const { refresh } = useSessionAccess();
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);
  const withdraw = useRef<HTMLButtonElement>(null);
  const remove = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState<"withdraw" | "remove">();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const route = "/api/v1/journeys/{journeyId}/sources/{sourceId}/review";
  const params = { path: { journeyId, sourceId } };
  const access = useQuery({
    queryKey: [scope.accountId, "recording-access", journeyId, sourceId],
    staleTime: 0,
    queryFn: async ({ signal }) =>
      journeyResult(
        await scope.api.GET(route, { params, signal }),
        scope,
        refresh,
      ),
  });
  const grant =
    access.isError || access.isFetching || !access.isFetchedAfterMount
      ? undefined
      : access.data;
  useLayoutEffect(() => {
    if (confirm) confirmation.current?.focus();
  }, [confirm]);

  async function apply(action: "share" | "withdraw" | "remove") {
    if (busy || !grant) return;
    setBusy(true);
    setNotice("");
    try {
      if (action === "remove") {
        const result = journeyResult(
          await scope.api.DELETE(
            "/api/v1/journeys/{journeyId}/recordings/{id}",
            {
              params: { path: { journeyId, id } },
              body: { expectedGrantRevision: grant.revision },
            },
          ),
          scope,
          refresh,
        );
        changed(
          result.confirmation === "pending"
            ? "Recording removed. Independent confirmation is pending."
            : "Recording removed. The original is still under Your recordings.",
        );
        return;
      }
      const result = journeyResult(
        await scope.api.POST(route, {
          params,
          body: { action, expectedRevision: grant.revision },
        }),
        scope,
        refresh,
      );
      heading.current?.focus({ preventScroll: true });
      await access.refetch();
      const message =
        action === "share"
          ? "Recording available for journey review."
          : "confirmation" in result && result.confirmation === "pending"
            ? "Access withdrawn. Independent confirmation is pending."
            : "Access withdrawn.";
      changed(message);
    } catch {
      if (!scope.signal.aborted) {
        heading.current?.focus({ preventScroll: true });
        setNotice("Couldn’t confirm this change. Check access and try again.");
        await access.refetch();
      }
    } finally {
      if (!scope.signal.aborted) {
        setConfirm(undefined);
        setBusy(false);
      }
    }
  }

  return (
    <div className="grid min-w-0 gap-2">
      <h3 ref={heading} tabIndex={-1} className="font-semibold">
        Recording access
      </h3>
      {notice && (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {access.isError ? (
        <JourneyRetry
          title="Couldn’t check the recording audience"
          busy={access.isFetching}
          retry={() => void access.refetch()}
        />
      ) : !grant ? (
        <JourneyLoading label="Checking the recording audience" />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {grant.scope === "only_me"
              ? "Only you can see this recording."
              : "This recording is available to active coauthors and designated publishers."}
          </p>
          {confirm ? (
            <>
              <p ref={confirmation} tabIndex={-1}>
                {confirm === "withdraw"
                  ? "Withdraw this recording from the journey’s review audience and shared draft?"
                  : "Remove this recording and its review access from the journey? The original stays under Your recordings."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  focusableWhenDisabled
                  onClick={() => void apply(confirm)}
                >
                  {confirm === "withdraw"
                    ? "Withdraw access"
                    : "Confirm removal"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setConfirm(undefined);
                    requestAnimationFrame(() => {
                      const action = confirm === "withdraw" ? withdraw : remove;
                      action.current?.focus();
                    });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {grant.scope === "only_me" ? (
                !archived && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    focusableWhenDisabled
                    onClick={() => void apply("share")}
                  >
                    Share for journey review
                  </Button>
                )
              ) : (
                <Button
                  ref={withdraw}
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirm("withdraw")}
                >
                  Withdraw from journey
                </Button>
              )}
              <Button
                ref={remove}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirm("remove")}
              >
                Remove recording from journey
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
