import type { RestrictionConfirmation } from "@kairn/contracts";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { CheckIcon, Link2OffIcon } from "lucide-react";
import { type SubmitEvent, useEffect, useRef, useState } from "react";
import { AuthScreen } from "../components/auth/screen";
import { PasswordField } from "../components/password-field";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button, ButtonLink } from "../components/ui/button";
import { ContentLoading } from "../components/ui/loading";
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
  const completion = useRouterState({
    select: ({ location }) => {
      const result =
        "passwordReset" in location.state
          ? location.state.passwordReset
          : undefined;
      return result === "complete" || result === "pending" ? result : undefined;
    },
  });
  const [errorMessage, setErrorMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const requestInFlight = useRef(false);
  const { refresh, state } = useSessionAccess();

  useEffect(() => {
    // The initial session check can replace the account scope and remount this form.
    if (search.token && state !== "checking") {
      setToken(search.token);
      setErrorMessage(undefined);
      void navigate({
        search: { token: undefined },
        state: (previous) => ({ ...previous, passwordReset: undefined }),
        replace: true,
      });
    }
  }, [search.token, navigate, state]);

  async function reset(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || requestInFlight.current) return;
    requestInFlight.current = true;
    const password = String(new FormData(event.currentTarget).get("password"));
    setBusy(true);
    setErrorMessage(undefined);
    try {
      const { data, error } = await authClient.$fetch<
        RestrictionConfirmation,
        { code?: string }
      >("/reset-password", {
        method: "POST",
        body: { token, newPassword: password },
      });
      if (error) {
        if (error.code === "INVALID_TOKEN" || error.code === "TOKEN_EXPIRED") {
          setToken(undefined);
        } else {
          setErrorMessage(
            "Couldn’t reset your password. Try again or request a new link.",
          );
        }
        return;
      }
      setToken(undefined);
      const result = data?.confirmation === "pending" ? "pending" : "complete";
      // Keep completion available across the session-scope reset.
      await navigate({
        search: { token: undefined },
        state: (previous) => ({ ...previous, passwordReset: result }),
        replace: true,
      });
      refresh();
    } catch {
      setErrorMessage("Couldn’t reach Kairn. Try again.");
    } finally {
      setBusy(false);
      requestInFlight.current = false;
    }
  }

  if (search.token && state === "checking")
    return (
      <AuthScreen title="Set a new password">
        <ContentLoading label="Checking your session" />
      </AuthScreen>
    );

  if (completion && !search.token)
    return (
      <AuthScreen
        title="Password changed"
        icon={CheckIcon}
        status={
          <Alert variant={completion === "pending" ? "warning" : "success"}>
            <AlertDescription>
              {completion === "pending"
                ? "Password changed and devices signed out. Recovery confirmation is pending."
                : "Devices for this account were signed out. Use the new password the next time you sign in."}
            </AlertDescription>
          </Alert>
        }
      >
        {state === "checking" ? (
          <output className="text-muted-foreground">
            Checking your session…
          </output>
        ) : (
          <ButtonLink render={<Link to="/account" />} size="lg">
            {state === "verified" ? "Return to Account" : "Back to sign in"}
          </ButtonLink>
        )}
      </AuthScreen>
    );

  if (!token)
    return (
      <AuthScreen
        title="Reset link unavailable"
        description="This reset link is invalid or has expired. Request a new link to continue."
        icon={Link2OffIcon}
      >
        <ButtonLink
          render={<Link to="/account" search={{ mode: "recover" }} />}
          size="lg"
        >
          Request a new link
        </ButtonLink>
        <ButtonLink
          render={<Link to="/account" />}
          variant="link"
          className="justify-self-start px-0"
        >
          Back to sign in
        </ButtonLink>
      </AuthScreen>
    );

  return (
    <AuthScreen
      title="Set a new password"
      description="Saving a new password signs out the devices on that account."
    >
      <form className="grid gap-4" onSubmit={(event) => void reset(event)}>
        <PasswordField
          id="reset-password"
          label="New password"
          isNew
          large
          readOnly={busy}
        />
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={busy}
          focusableWhenDisabled
          feedback={busy ? "pending" : "idle"}
        >
          {busy ? "Saving password…" : "Save password"}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3">
        <ButtonLink
          render={<Link to="/account" />}
          variant="link"
          className="px-0"
        >
          Back to sign in
        </ButtonLink>
        {errorMessage && (
          <ButtonLink
            render={<Link to="/account" search={{ mode: "recover" }} />}
            variant="link"
            className="px-0"
          >
            Request a new link
          </ButtonLink>
        )}
      </div>
    </AuthScreen>
  );
}
