import type { RestrictionConfirmation } from "@kairn/contracts";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type SubmitEvent, useEffect, useState } from "react";
import { PageHeading } from "../components/page-heading";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { authClient } from "../lib/auth";

export const Route = createFileRoute("/account_/reset")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [token, setToken] = useState(search.token);
  const [feedback, setFeedback] = useState<{
    text: string;
    variant: "destructive" | "success" | "warning";
  }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (search.token)
      void navigate({ search: { token: undefined }, replace: true });
  }, [search.token, navigate]);

  async function reset(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const password = String(new FormData(event.currentTarget).get("password"));
    setBusy(true);
    setFeedback(undefined);
    try {
      const { data, error } = await authClient.$fetch<RestrictionConfirmation>(
        "/reset-password",
        { method: "POST", body: { token, newPassword: password } },
      );
      if (error) {
        setFeedback({
          variant: "destructive",
          text: "Couldn’t reset your password. Request a new link if this one has expired.",
        });
        return;
      }
      setToken(undefined);
      const pending = data?.confirmation === "pending";
      setFeedback({
        variant: pending ? "warning" : "success",
        text: pending
          ? "Password changed and devices signed out. Recovery confirmation is pending."
          : "Password changed. Sign in with your new password.",
      });
    } catch {
      setFeedback({
        variant: "destructive",
        text: "Couldn’t reach Kairn. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid max-w-lg gap-6">
      <PageHeading title="Set a new password" />
      {token && (
        <form
          className="grid gap-4 rounded-card control-border bg-card p-4"
          onSubmit={(event) => void reset(event)}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reset-password">New password</FieldLabel>
              <Input
                id="reset-password"
                required
                minLength={12}
                type="password"
                name="password"
                autoComplete="new-password"
                aria-describedby="reset-password-hint"
              />
              <p
                id="reset-password-hint"
                className="text-sm text-muted-foreground"
              >
                Use at least 12 characters.
              </p>
            </Field>
          </FieldGroup>
          <Button type="submit" className="justify-self-start" disabled={busy}>
            {busy ? "Saving password…" : "Save password"}
          </Button>
        </form>
      )}
      {feedback && (
        <Alert variant={feedback.variant} role="status">
          <AlertDescription>{feedback.text}</AlertDescription>
        </Alert>
      )}
      {!token && !feedback && (
        <Alert variant="destructive">
          <AlertDescription>
            This reset link is invalid or has expired.
          </AlertDescription>
        </Alert>
      )}
      <Button asChild variant="link" className="justify-self-start">
        <Link to="/account">Go to account</Link>
      </Button>
    </section>
  );
}
