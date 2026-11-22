import type { RestrictionConfirmation } from "@kairn/contracts";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type SubmitEvent, useEffect, useState } from "react";
import { PageHeading } from "../components/page-heading";
import { PasswordField } from "../components/password-field";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button, ButtonLink } from "../components/ui/button";
import { authClient } from "../lib/auth";
import { useSessionAccess } from "../lib/session-access";

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
  const { refresh, state } = useSessionAccess();

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
      if (state === "verified") {
        await navigate({
          to: "/account",
          search: { passwordReset: pending ? "pending" : "complete" },
          replace: true,
        });
        refresh();
        return;
      }
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
      <PageHeading
        title="Set a new password"
        description="Use it the next time you sign in to Kairn."
      />
      {token && (
        <form className="grid gap-4" onSubmit={(event) => void reset(event)}>
          <PasswordField id="reset-password" label="New password" isNew />
          <Button
            type="submit"
            disabled={busy}
            feedback={busy ? "pending" : "idle"}
          >
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
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            This reset link is invalid or has expired.
          </AlertDescription>
        </Alert>
      )}
      {!token && !feedback && (
        <ButtonLink
          render={<Link to="/account" search={{ mode: "recover" }} />}
          variant="outline"
          className="justify-self-start"
        >
          Request a new link
        </ButtonLink>
      )}
      <ButtonLink
        render={<Link to="/account" />}
        variant="link"
        className="justify-self-start"
      >
        Back to sign in
      </ButtonLink>
    </section>
  );
}
