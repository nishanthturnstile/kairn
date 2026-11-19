import type {
  IdentityDevices,
  RestrictionConfirmation,
} from "@kairn/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type SubmitEvent, useEffect, useRef, useState } from "react";
import { PageHeading } from "../components/page-heading";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { authClient } from "../lib/auth";
import {
  journeyReturnTo,
  savedJourneyReturnTo,
  saveJourneyReturnTo,
} from "../lib/journey-return";
import { useSessionAccess } from "../lib/session-access";

export const Route = createFileRoute("/account")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    verification?: "confirmed";
    error?: string;
    returnTo?: ReturnType<typeof journeyReturnTo>;
  } => ({
    verification:
      search.verification === "confirmed" ? ("confirmed" as const) : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    returnTo: journeyReturnTo(search.returnTo),
  }),
  component: AccountPage,
});

type FormMode = "sign-in" | "sign-up" | "recover" | "resend";

const modeLabels = {
  "sign-in": "Sign in",
  "sign-up": "Create account",
  recover: "Reset password",
  resend: "Resend verification",
};

type Feedback = {
  text: string;
  variant: "default" | "destructive" | "success" | "warning";
};

const feedbackTextClass = {
  default: "text-muted-foreground",
  destructive: "text-destructive",
  success: "text-success",
  warning: "text-warning",
};

function AccountPage() {
  const { data, isPending, error } = authClient.useSession();
  const verification = Route.useSearch();
  const navigate = Route.useNavigate();
  const { state } = useSessionAccess();
  const { returnTo, verification: confirmed } = verification;
  useEffect(() => {
    if (returnTo) saveJourneyReturnTo(returnTo);
  }, [returnTo]);
  useEffect(() => {
    if (state !== "verified") return;
    const destination =
      returnTo ?? (confirmed ? savedJourneyReturnTo() : undefined);
    if (!destination) return;
    saveJourneyReturnTo(undefined);
    if (destination === "/journeys")
      void navigate({ to: "/journeys", replace: true });
    else
      void navigate({
        to: "/journeys/$journeyId",
        params: { journeyId: destination.slice("/journeys/".length) },
        replace: true,
      });
  }, [confirmed, navigate, returnTo, state]);
  return (
    <section className="grid max-w-lg gap-6">
      <PageHeading title="Account" />
      {verification.error && (
        <Alert variant="destructive">
          <AlertDescription>
            That verification link is invalid or has expired.
          </AlertDescription>
        </Alert>
      )}
      {verification.verification && !verification.error && (
        <Alert variant="success" role="status">
          <AlertDescription>
            Your email is verified. You can sign in now.
          </AlertDescription>
        </Alert>
      )}
      {isPending && (
        <output className="text-muted-foreground">Checking your session</output>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Account access is temporarily unavailable.
          </AlertDescription>
        </Alert>
      )}
      {data?.user ? (
        <SignedInAccount email={data.user.email} id={data.user.id} />
      ) : (
        <AccountForm />
      )}
    </section>
  );
}

function AccountForm() {
  const [mode, setMode] = useState<FormMode>("sign-in");
  const [feedback, setFeedback] = useState<Feedback>();
  const [busy, setBusy] = useState(false);
  const focusHeading = useRef(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const email = String(input.get("email")).trim();
    const password = String(input.get("password") ?? "");
    setBusy(true);
    setFeedback(undefined);
    try {
      if (mode === "sign-in") {
        const { error } = await authClient.signIn.email({ email, password });
        if (error)
          setFeedback({
            variant: "destructive",
            text:
              error.code === "EMAIL_NOT_VERIFIED"
                ? "Verify your email before signing in."
                : "Couldn’t sign in. Check your email and password.",
          });
      } else if (mode === "sign-up") {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name: String(input.get("name")).trim(),
        });
        setFeedback({
          variant: error ? "destructive" : "default",
          text: error
            ? "Couldn’t register. Check your details and try again."
            : "Check your inbox for a verification link.",
        });
      } else if (mode === "recover") {
        const { error } = await authClient.requestPasswordReset({ email });
        setFeedback({
          variant: error ? "destructive" : "default",
          text: error
            ? "Couldn’t request a reset email. Try again later."
            : "If that account can receive a reset email, check your inbox.",
        });
      } else {
        const { error } = await authClient.sendVerificationEmail({ email });
        setFeedback({
          variant: error ? "destructive" : "default",
          text: error
            ? "Couldn’t request a verification email. Try again later."
            : "If that email still needs verification, check your inbox.",
        });
      }
    } catch {
      setFeedback({
        variant: "destructive",
        text: "Couldn’t connect to Kairn. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-4 rounded-card control-border bg-card p-4"
      onSubmit={(event) => void submit(event)}
    >
      <h2
        className="text-xl font-semibold"
        ref={(heading) => {
          if (heading && focusHeading.current) {
            heading.focus();
            focusHeading.current = false;
          }
        }}
        tabIndex={-1}
      >
        {modeLabels[mode]}
      </h2>
      <FieldGroup>
        {mode === "sign-up" && (
          <Field>
            <FieldLabel htmlFor="account-name">Name</FieldLabel>
            <Input id="account-name" name="name" autoComplete="name" required />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="account-email">Email</FieldLabel>
          <Input
            id="account-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </Field>
        {(mode === "sign-in" || mode === "sign-up") && (
          <Field>
            <FieldLabel htmlFor="account-password">Password</FieldLabel>
            <Input
              key={mode}
              id="account-password"
              name="password"
              type="password"
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
              minLength={mode === "sign-up" ? 12 : undefined}
              aria-describedby={
                mode === "sign-up" ? "account-password-hint" : undefined
              }
              required
            />
            {mode === "sign-up" && (
              <p
                id="account-password-hint"
                className="text-sm text-muted-foreground"
              >
                Use at least 12 characters.
              </p>
            )}
          </Field>
        )}
      </FieldGroup>
      <Button type="submit" className="justify-self-start" disabled={busy}>
        {busy ? "Please wait…" : modeLabels[mode]}
      </Button>
      {feedback && (
        <p className={feedbackTextClass[feedback.variant]} role="status">
          {feedback.text}
        </p>
      )}
      <div className="flex flex-wrap gap-1 border-t pt-2">
        {(Object.keys(modeLabels) as FormMode[])
          .filter((option) => option !== mode)
          .map((option) => (
            <Button
              key={option}
              type="button"
              variant="link"
              size="sm"
              disabled={busy}
              onClick={() => {
                focusHeading.current = true;
                setMode(option);
                setFeedback(undefined);
              }}
            >
              {modeLabels[option]}
            </Button>
          ))}
      </div>
    </form>
  );
}

function SignedInAccount({ email, id }: { email: string; id: string }) {
  const { signOut } = Route.useRouteContext();
  const [feedback, setFeedback] = useState<Feedback>();
  const [revoking, setRevoking] = useState(false);
  const devices = useQuery({
    queryKey: [id, "devices"],
    async queryFn({ signal }) {
      const { data, error } = await authClient.$fetch<IdentityDevices>(
        "/devices",
        { signal },
      );
      if (error) throw new Error("Device list unavailable");
      return data;
    },
  });

  async function revoke(deviceId: string) {
    setFeedback(undefined);
    setRevoking(true);
    try {
      const { data, error } = await authClient.$fetch<RestrictionConfirmation>(
        "/devices/revoke",
        { method: "POST", body: { id: deviceId } },
      );
      if (error) {
        setFeedback({
          variant: "destructive",
          text: "Couldn’t revoke this session. Sign in again to refresh your session.",
        });
        return;
      }
      const pending = data?.confirmation === "pending";
      setFeedback({
        variant: pending ? "warning" : "success",
        text: pending
          ? "Device signed out. Recovery confirmation is pending."
          : "Device signed out.",
      });
      await devices.refetch();
    } catch {
      setFeedback({
        variant: "destructive",
        text: "Couldn’t reach Kairn. Try again.",
      });
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-4 rounded-card control-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <p className="min-w-0 font-semibold">{email}</p>
        <Button
          variant="outline"
          onClick={async () => {
            const success = await signOut();
            if (!success)
              setFeedback({
                variant: "destructive",
                text: "Couldn’t sign out. Try again.",
              });
          }}
        >
          Sign out
        </Button>
      </div>
      <h2 className="text-xl font-semibold">Signed-in devices</h2>
      {devices.isPending && (
        <output className="text-muted-foreground">Loading devices</output>
      )}
      {devices.isError && (
        <p className="text-destructive" role="alert">
          Couldn’t load your devices.
        </p>
      )}
      {devices.data && (
        <ul className="grid gap-3">
          {devices.data.devices.map((device) => (
            <li
              key={device.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"
            >
              {device.id === devices.data?.currentDeviceId ? (
                <p>This device</p>
              ) : (
                <>
                  <p>
                    Session started{" "}
                    <time dateTime={device.createdAt}>
                      {new Date(device.createdAt).toLocaleString("en-IN")}
                    </time>
                  </p>
                  <Button
                    variant="outline"
                    disabled={revoking}
                    onClick={() => void revoke(device.id)}
                  >
                    Revoke device
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {feedback && (
        <p className={feedbackTextClass[feedback.variant]} role="status">
          {feedback.text}
        </p>
      )}
      {!feedback && Boolean(devices.data?.pendingRestrictions) && (
        <p className="text-warning" role="status">
          Account changes await recovery confirmation.
        </p>
      )}
    </div>
  );
}
