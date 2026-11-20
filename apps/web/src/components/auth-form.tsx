import { type SubmitEvent, useEffect, useId, useRef, useState } from "react";
import { authClient } from "../lib/auth";
import { bindJourneyReturn } from "../lib/journey-return";
import { useSessionAccess } from "../lib/session-access";
import { PasswordField } from "./password-field";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

const authModes = {
  "sign-in": {
    label: "Sign in",
    description: "Open your Kairn workspace.",
    pending: "Signing in…",
  },
  "sign-up": {
    label: "Create account",
    description: "Verify your email to start using Kairn.",
    pending: "Creating account…",
  },
  recover: {
    label: "Reset password",
    description:
      "Enter the email you use for Kairn and we’ll send a reset link.",
    pending: "Sending reset link…",
  },
  resend: {
    label: "Resend verification",
    description: "Request a new verification link for your email address.",
    pending: "Sending verification link…",
  },
} as const;
export type AuthMode = keyof typeof authModes;

export function AuthForm({
  mode,
  onModeChange,
  canResumeUnbound,
  emailVerificationConfirmed,
  showResend,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  canResumeUnbound: boolean;
  emailVerificationConfirmed: boolean;
  showResend: boolean;
}) {
  const { setSignInAccount } = useSessionAccess();
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const [needsVerification, setNeedsVerification] = useState(false);
  const [emailSent, setSent] = useState<"verify" | "reset">();
  const sent =
    (mode === "sign-up" && emailSent === "verify") ||
    (mode === "recover" && emailSent === "reset")
      ? emailSent
      : undefined;
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const busyRequest = useRef(false);
  const description = authModes[mode];
  const verificationStatusId = useId();
  const showVerificationStatus =
    mode === "sign-in" && emailVerificationConfirmed;

  useEffect(() => {
    if (mode || sent) heading.current?.focus();
  }, [mode, sent]);

  function changeMode(next: AuthMode) {
    setFeedback(undefined);
    setNeedsVerification(false);
    setSent(undefined);
    onModeChange(next);
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRequest.current) return;
    busyRequest.current = true;
    const input = new FormData(event.currentTarget);
    const address = String(input.get("email")).trim();
    const password = String(input.get("password") ?? "");
    setEmail(address);
    setBusy(true);
    setFeedback(undefined);
    setNeedsVerification(false);
    try {
      if (mode === "sign-in") {
        const { data, error } = await authClient.signIn.email(
          { email: address, password },
          {
            headers: { "X-Kairn-Onboarding": "1" },
          },
        );
        if (data?.user.id && !error) {
          bindJourneyReturn(data.user.id, canResumeUnbound);
          setSignInAccount(data.user.id);
          return;
        }
        const unverified = error?.code === "EMAIL_NOT_VERIFIED";
        setNeedsVerification(unverified);
        setFeedback({
          error: true,
          text: unverified
            ? "Verify your email before signing in."
            : "Couldn’t sign in. Check your email and password.",
        });
      } else if (mode === "sign-up") {
        const { error } = await authClient.signUp.email({
          email: address,
          password,
          name: String(input.get("name")).trim(),
        });
        if (error)
          setFeedback({
            error: true,
            text: "Couldn’t register. Check your details and try again.",
          });
        else setSent("verify");
      } else if (mode === "recover") {
        const { error } = await authClient.requestPasswordReset({
          email: address,
        });
        if (error)
          setFeedback({
            error: true,
            text: "Couldn’t request a reset link. Try again later.",
          });
        else setSent("reset");
      } else {
        const { error } = await authClient.sendVerificationEmail({
          email: address,
        });
        if (error)
          setFeedback({
            error: true,
            text: "Couldn’t request a verification link. Try again later.",
          });
        else
          setFeedback({
            text: "If that account needs verification, check your inbox for a new link.",
          });
      }
    } catch {
      setFeedback({
        error: true,
        text: "Couldn’t connect to Kairn. Try again.",
      });
    } finally {
      setBusy(false);
      busyRequest.current = false;
    }
  }

  if (sent)
    return (
      <section className="grid gap-4">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-4xl font-semibold outline-none"
        >
          Check your email
        </h1>
        {sent === "verify" ? (
          <>
            <p>Check your inbox for a verification link.</p>
            <p className="text-muted-foreground">
              We used <strong>{email}</strong>. Open the link before signing in.
            </p>
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() => changeMode("resend")}
            >
              Resend verification
            </Button>
          </>
        ) : (
          <p>If that account can receive a reset email, check your inbox.</p>
        )}
        <Button
          variant="link"
          className="justify-self-start px-0"
          onClick={() => changeMode("sign-in")}
        >
          Back to sign in
        </Button>
      </section>
    );

  return (
    <section className="grid gap-6 sm:gap-8">
      <header className="grid gap-2">
        <h1
          ref={heading}
          tabIndex={-1}
          aria-describedby={
            showVerificationStatus ? verificationStatusId : undefined
          }
          className="text-4xl font-semibold outline-none"
        >
          {description.label}
        </h1>
        {showVerificationStatus ? (
          <p
            id={verificationStatusId}
            role="status"
            className="flex items-start gap-2.5 text-success"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/12"
            >
              <span className="confirmation-check" />
            </span>
            <span>
              <strong>Your email is verified.</strong> You can sign in now.
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground">{description.description}</p>
        )}
      </header>
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          {mode === "sign-up" && (
            <Field>
              <FieldLabel htmlFor="account-name">Display name</FieldLabel>
              <Input
                id="account-name"
                name="name"
                autoComplete="nickname"
                maxLength={120}
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
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
            />
          </Field>
          {(mode === "sign-in" || mode === "sign-up") && (
            <PasswordField
              key={mode}
              id="account-password"
              isNew={mode === "sign-up"}
              action={
                mode === "sign-in" && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="px-0"
                    disabled={busy}
                    onClick={() => changeMode("recover")}
                  >
                    Reset password
                  </Button>
                )
              }
            />
          )}
        </FieldGroup>
        {feedback && (
          <Alert
            variant={feedback.error ? "destructive" : "default"}
            role={feedback.error ? "alert" : "status"}
          >
            <AlertDescription>{feedback.text}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? description.pending : description.label}
        </Button>
      </form>
      {mode === "sign-in" ? (
        <div className="grid gap-2">
          {(needsVerification || showResend) && (
            <Button
              variant="link"
              size="sm"
              className="justify-self-start px-0"
              disabled={busy}
              onClick={() => changeMode("resend")}
            >
              Resend verification
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-1 border-t pt-3">
            <p className="text-muted-foreground">New to Kairn?</p>
            <Button
              variant="link"
              size="sm"
              className="px-2"
              disabled={busy}
              onClick={() => changeMode("sign-up")}
            >
              Create account
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="link"
          className="justify-self-start px-0"
          disabled={busy}
          onClick={() => changeMode("sign-in")}
        >
          Back to sign in
        </Button>
      )}
    </section>
  );
}
