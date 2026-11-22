import type {
  IdentityDevices,
  RestrictionConfirmation,
} from "@kairn/contracts";
import { useQuery } from "@tanstack/react-query";
import { parseJSON } from "better-auth/client";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { useId, useRef, useState } from "react";
import { authClient } from "@/lib/auth";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { ContentLoading } from "../ui/loading";

type Device = IdentityDevices["devices"][number];
type DeviceError = { code?: string };
type Feedback = {
  text: string;
  variant: "destructive" | "success" | "warning";
};
const sessionDate = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "medium",
});

function DeviceDetails({
  device,
  current,
  descriptionId,
}: {
  device?: Device;
  current?: boolean;
  descriptionId?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <MonitorSmartphone
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0"
      />
      <div className="grid min-w-0 gap-0.5">
        <p className="font-semibold">
          {current ? "This device" : "Other device"}
        </p>
        {device && (
          <p id={descriptionId} className="text-sm text-muted-foreground">
            Signed in{" "}
            <time dateTime={device.createdAt}>
              {sessionDate.format(new Date(device.createdAt))}
            </time>
          </p>
        )}
      </div>
    </div>
  );
}

function OtherDevice({
  device,
  disabled,
  onSelect,
}: {
  device: Device;
  disabled: boolean;
  onSelect: (trigger: HTMLButtonElement) => void;
}) {
  const descriptionId = useId();
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 first:pt-0 last:pb-0">
      <DeviceDetails device={device} descriptionId={descriptionId} />
      <Button
        type="button"
        variant="outline"
        className="min-h-touch"
        aria-describedby={descriptionId}
        disabled={disabled}
        focusableWhenDisabled
        onClick={(event) => onSelect(event.currentTarget)}
      >
        Revoke device
      </Button>
    </li>
  );
}

export function SignedInDevices({
  accountId,
  scope,
}: {
  accountId: string;
  scope: AccountScope;
}) {
  const { refresh, signOut } = useSessionAccess();
  const [feedback, setFeedback] = useState<Feedback>();
  const [selected, setSelected] = useState<Device>();
  const [revoking, setRevoking] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);
  const key = [accountId, "devices"];
  const devices = useQuery({
    queryKey: key,
    async queryFn({ signal }) {
      const { data, error } = await authClient.$fetch<
        IdentityDevices,
        DeviceError
      >("/devices", {
        headers: { "X-Expected-Account": accountId },
        signal: AbortSignal.any([signal, scope.signal]),
        // Preserve ISO timestamps for sorting and the time element.
        jsonParser: (text) => parseJSON(text, { parseDates: false }),
      });
      scope.signal.throwIfAborted();
      if (error?.status === 401 || error?.code === "account_changed")
        refresh(scope);
      if (error || !data) throw new Error("Device list unavailable");
      return data;
    },
  });

  async function retry(
    button: HTMLButtonElement,
    checkingConfirmation = false,
  ) {
    const hadFocus = document.activeElement === button;
    const result = await devices.refetch();
    const focusHeading = checkingConfirmation
      ? result.isError || result.data?.pendingRestrictions === 0
      : result.isSuccess;
    if (
      hadFocus &&
      focusHeading &&
      (document.activeElement === button ||
        document.activeElement === document.body)
    )
      heading.current?.focus();
  }

  async function revoke(device: Device) {
    if (confirmed.current) return;
    confirmed.current = true;
    returnFocus.current = heading.current;
    setSelected(undefined);
    setFeedback(undefined);
    setRevoking(true);
    try {
      const { data, error } = await authClient.$fetch<
        RestrictionConfirmation,
        DeviceError
      >("/devices/revoke", {
        method: "POST",
        body: { id: device.id },
        headers: { "X-Expected-Account": accountId },
        signal: scope.signal,
      });
      scope.signal.throwIfAborted();
      if (error || data?.status !== true) {
        if (error?.status === 401 || error?.code === "account_changed") {
          refresh(scope);
          return;
        }
        const gone = error?.status === 404;
        setFeedback({
          variant: gone ? "warning" : "destructive",
          text: gone
            ? "This device is already signed out."
            : error?.code === "SESSION_NOT_FRESH"
              ? "Sign out and sign in again to revoke this device."
              : "Couldn’t revoke this device. Try again.",
        });
        if (gone) await devices.refetch();
        return;
      }
      const pending = data.confirmation === "pending";
      await scope.queryClient.cancelQueries({ queryKey: key });
      scope.signal.throwIfAborted();
      scope.queryClient.setQueryData<IdentityDevices>(
        key,
        (previous) =>
          previous && {
            ...previous,
            devices: previous.devices.filter((item) => item.id !== device.id),
            pendingRestrictions: pending
              ? Math.max(previous.pendingRestrictions, 1)
              : previous.pendingRestrictions,
          },
      );
      setFeedback({
        variant: "success",
        text: "Device signed out.",
      });
      await devices.refetch();
    } catch {
      if (!scope.signal.aborted)
        setFeedback({
          variant: "destructive",
          text: "Couldn’t reach Kairn. Try again.",
        });
    } finally {
      confirmed.current = false;
      if (!scope.signal.aborted) setRevoking(false);
    }
  }

  const currentId = devices.data?.currentDeviceId;
  const current = devices.data?.devices.find(
    (device) => device.id === currentId,
  );
  const others = devices.data?.devices
    .filter((device) => device.id !== currentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <section aria-labelledby="account-devices" className="min-w-0">
      <Card className="gap-4 [--card-spacing:--spacing(4)]">
        <CardHeader>
          <h2
            id="account-devices"
            ref={heading}
            tabIndex={-1}
            className="scroll-mt-20 font-heading text-xl font-semibold"
          >
            Signed-in devices
          </h2>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4">
          <ul>
            <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-control bg-muted p-3">
              <DeviceDetails device={current} current />
              <Button
                type="button"
                variant="outline"
                className="min-h-touch"
                onClick={() => void signOut()}
              >
                <LogOut aria-hidden="true" data-icon="inline-start" />
                Sign out
              </Button>
            </li>
          </ul>
          {revoking && <ContentLoading label="Revoking device" />}
          {feedback && (
            <Alert
              variant={feedback.variant}
              role={feedback.variant === "destructive" ? "alert" : "status"}
            >
              <AlertDescription>{feedback.text}</AlertDescription>
            </Alert>
          )}
          {!devices.isError && Boolean(devices.data?.pendingRestrictions) && (
            <Alert variant="warning" role="status">
              <AlertDescription>
                Account changes await recovery confirmation.
              </AlertDescription>
              <AlertAction>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-touch"
                  focusableWhenDisabled
                  disabled={devices.isFetching || revoking}
                  onClick={(event) => void retry(event.currentTarget, true)}
                >
                  Check confirmation
                </Button>
              </AlertAction>
            </Alert>
          )}
          {devices.isPending && <ContentLoading label="Loading devices" />}
          {devices.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>Couldn’t load your devices.</AlertDescription>
              <AlertAction>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-touch"
                  focusableWhenDisabled
                  disabled={devices.isFetching}
                  onClick={(event) => void retry(event.currentTarget)}
                >
                  {devices.isFetching ? "Retrying…" : "Try again"}
                </Button>
              </AlertAction>
            </Alert>
          )}
          {others && !devices.isError && (
            <>
              <hr className="border-border" />
              <div className="grid gap-2">
                <h3 className="font-semibold">Other sessions</h3>
                {others.length ? (
                  <ul
                    aria-label="Other sessions"
                    className="divide-y divide-border"
                  >
                    {others.map((device) => (
                      <OtherDevice
                        key={device.id}
                        device={device}
                        disabled={revoking}
                        onSelect={(button) => {
                          returnFocus.current = button;
                          setSelected(device);
                        }}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No other devices are signed in.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <DialogContent
          initialFocus={cancel}
          finalFocus={() =>
            returnFocus.current?.isConnected
              ? returnFocus.current
              : heading.current
          }
        >
          <DialogTitle>Revoke device?</DialogTitle>
          <DialogDescription>
            {selected && (
              <>
                The device signed in on{" "}
                {sessionDate.format(new Date(selected.createdAt))} will need to
                sign in again.
              </>
            )}
          </DialogDescription>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              ref={cancel}
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setSelected(undefined)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              onClick={() => {
                if (selected) void revoke(selected);
              }}
            >
              Revoke device
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
