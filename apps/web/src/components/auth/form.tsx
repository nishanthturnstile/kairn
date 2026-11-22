import { CheckIcon, Link2OffIcon, MailIcon } from "lucide-react";
import { type SubmitEvent, useRef, useState } from "react";
import { authClient } from "../../lib/auth";
import { bindJourneyReturn } from "../../lib/journey-return";
import { useSessionAccess } from "../../lib/session-access";
import { PasswordField } from "../password-field";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Field, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { AuthScreen } from "./screen";

const authModes = {
  "sign-in": {
    title: "Sign in",
    description: "Continue to your private journey journal.",
    action: "Sign in",
    pending: "Signing in…",
  },
  "sign-up": {
    title: "Create account",
    description: "Choose a display name and verify your email to get started.",
    action: "Create account",
    pending: "Creating account…",
  },
  recover: {
    title: "Reset password",
    description: "Enter the email you use for Kairn to request a reset link.",
    action: "Send reset link",
    pending: "Sending reset link…",
  },
  resend: {
    title: "Resend verification",
    description: "Enter the email you used to create your account.",
    action: "Send verification link",
    pending: "Sending verification link…",
  },
} as const;
export type AuthMode = keyof typeof authModes;

const inboxCopy = {
  "sign-up": "Check your inbox for a verification link.",
  recover: "If that account can receive a reset email, check your inbox.",
  resend:
    "If that account needs verification, check your inbox for a new link.",
} as const;

type AuthOutcome =
  | { kind: "failed"; message: string }
  | { kind: "unverified" }
  | { kind: "sent"; mode: keyof typeof inboxCopy };

export function AuthForm({
  mode,
  onModeChange,
  canResumeUnbound,
  verification,
  passwordReset,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  canResumeUnbound: boolean;
  verification?: "confirmed" | "invalid";
  passwordReset?: "pending" | "complete";
}) {
  const { setSignInAccount } = useSessionAccess();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  // Results belong to the initiating screen, including when Back revisits a mode.
  const [view, setView] = useState({ mode });
  if (view.mode !== mode) setView({ mode });
  const [result, setResult] = useState<{
    view: typeof view;
    outcome: AuthOutcome;
  }>();
  const outcome = result?.view === view ? result.outcome : undefined;
  const [pendingMode, setPendingMode] = useState<AuthMode>();
  const busy = pendingMode !== undefined;
  const busyRequest = useRef(false);
  const screen = authModes[mode];

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRequest.current) return;
    busyRequest.current = true;
    const input = new FormData(event.currentTarget);
    const address = String(input.get("email")).trim();
    const password = String(input.get("password") ?? "");
    setEmail(address);
    setPendingMode(mode);
    setResult(undefined);
    function fail(message: string) {
      setResult({ view, outcome: { kind: "failed", message } });
    }
    try {
      if (mode === "sign-in") {
        const { data, error } = await authClient.signIn.email(
          { email: address, password },
          { headers: { "X-Kairn-Onboarding": "1" } },
        );
        if (data?.user.id && !error) {
          bindJourneyReturn(data.user.id, canResumeUnbound);
          setSignInAccount(data.user.id);
          return;
        }
        if (error?.code === "EMAIL_NOT_VERIFIED") {
          setResult({ view, outcome: { kind: "unverified" } });
        } else {
          fail("Couldn’t sign in. Check your email and password.");
        }
      } else if (mode === "sign-up") {
        const { error } = await authClient.signUp.email({
          email: address,
          password,
          name: String(input.get("name")).trim(),
        });
        if (error)
          fail(
            "Couldn’t create your account. Check your details and try again.",
          );
        else setResult({ view, outcome: { kind: "sent", mode } });
      } else if (mode === "recover") {
        const { error } = await authClient.requestPasswordReset({
          email: address,
        });
        if (error) fail("Couldn’t request a reset link. Try again later.");
        else setResult({ view, outcome: { kind: "sent", mode } });
      } else {
        const { error } = await authClient.sendVerificationEmail({
          email: address,
        });
        if (error)
          fail("Couldn’t request a verification link. Try again later.");
        else setResult({ view, outcome: { kind: "sent", mode } });
      }
    } catch {
      fail("Couldn’t connect to Kairn. Try again.");
    } finally {
      setPendingMode(undefined);
      busyRequest.current = false;
    }
  }

  if (verification === "invalid" && mode === "sign-in")
    return (
      <AuthScreen
        title="Verification link unavailable"
        description="This link is invalid or has expired. Request a new one for the email you used to sign up."
        icon={Link2OffIcon}
      >
        <Button size="lg" onClick={() => onModeChange("resend")}>
          Resend verification
        </Button>
        <Button
          variant="link"
          className="justify-self-start px-0"
          onClick={() => onModeChange("sign-in")}
        >
          Back to sign in
        </Button>
      </AuthScreen>
    );

  if (outcome?.kind === "sent")
    return (
      <AuthScreen
        title="Check your email"
        description={inboxCopy[outcome.mode]}
        icon={MailIcon}
      >
        <div className="grid gap-4">
          <p className="grid gap-1 rounded-card control-border border-border bg-card p-inset">
            <span className="text-sm text-muted-foreground">Email address</span>
            <strong className="wrap-anywhere">{email}</strong>
          </p>
          <Button size="lg" onClick={() => onModeChange("sign-in")}>
            Back to sign in
          </Button>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {outcome.mode === "sign-up" && (
              <Button
                variant="link"
                className="px-0"
                onClick={() => onModeChange("resend")}
              >
                Resend verification
              </Button>
            )}
            <Button
              variant="link"
              className="px-0"
              onClick={() => setResult(undefined)}
            >
              Change email address
            </Button>
          </div>
        </div>
      </AuthScreen>
    );

  const signInStatus =
    mode === "sign-in" && (verification === "confirmed" || passwordReset);
  return (
    <AuthScreen
      title={screen.title}
      description={signInStatus ? undefined : screen.description}
      status={
        signInStatus && (
          <Alert variant={passwordReset === "pending" ? "warning" : "success"}>
            {passwordReset !== "pending" && <CheckIcon aria-hidden="true" />}
            <AlertDescription>
              {passwordReset === "pending"
                ? "Password changed and devices signed out. Recovery confirmation is pending."
                : passwordReset === "complete"
                  ? "Password changed. Sign in with your new password."
                  : "Your email is verified. You can sign in now."}
            </AlertDescription>
          </Alert>
        )
      }
    >
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          {mode === "sign-up" && (
            <Field>
              <FieldLabel htmlFor="account-name">Display name</FieldLabel>
              <Input
                id="account-name"
                name="name"
                autoComplete="nickname"
                className="min-h-touch"
                maxLength={120}
                pattern={".*\\S.*"}
                title="Enter a display name with at least one non-space character."
                value={displayName}
                onChange={(event) => setDisplayName(event.currentTarget.value)}
                readOnly={busy}
                required
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="account-email">Email</FieldLabel>
            <Input
              id="account-email"
              name="email"
              type="email"
              className="min-h-touch"
              autoComplete={mode === "sign-in" ? "username" : "email"}
              value={email}
              readOnly={busy}
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
            />
          </Field>
          {(mode === "sign-in" || mode === "sign-up") && (
            <PasswordField
              key={mode}
              id="account-password"
              isNew={mode === "sign-up"}
              large
              readOnly={busy}
            />
          )}
          {mode === "sign-in" && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="justify-self-end px-0"
              disabled={busy}
              onClick={() => onModeChange("recover")}
            >
              Reset password
            </Button>
          )}
        </FieldGroup>
        {outcome?.kind === "failed" && (
          <Alert variant="destructive">
            <AlertDescription>{outcome.message}</AlertDescription>
          </Alert>
        )}
        {outcome?.kind === "unverified" && (
          <Alert variant="warning">
            <AlertDescription>
              Verify your email before signing in.
            </AlertDescription>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="justify-self-start px-0"
              onClick={() => onModeChange("resend")}
            >
              Resend verification
            </Button>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={busy}
          focusableWhenDisabled
          feedback={busy ? "pending" : "idle"}
        >
          {busy
            ? pendingMode === mode
              ? screen.pending
              : "Finishing request…"
            : screen.action}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-x-2 border-t border-border pt-3">
        {(mode === "sign-in" || mode === "sign-up") && (
          <p className="text-muted-foreground">
            {mode === "sign-in" ? "New to Kairn?" : "Already have an account?"}
          </p>
        )}
        <Button
          variant="link"
          className="px-0"
          disabled={busy}
          onClick={() =>
            onModeChange(mode === "sign-in" ? "sign-up" : "sign-in")
          }
        >
          {mode === "sign-in"
            ? "Create account"
            : mode === "sign-up"
              ? "Sign in"
              : "Back to sign in"}
        </Button>
      </div>
    </AuthScreen>
  );
}
