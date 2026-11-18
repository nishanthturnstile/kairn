import type { RestrictionConfirmation } from "@kairn/contracts";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type SubmitEvent, useEffect, useState } from "react";
import { Button } from "../components/ui/button";
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
  const [message, setMessage] = useState("");
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
    try {
      const { data, error } = await authClient.$fetch<RestrictionConfirmation>(
        "/reset-password",
        { method: "POST", body: { token, newPassword: password } },
      );
      if (error) {
        setMessage(
          "Couldn’t reset your password. Request a new link if this one has expired.",
        );
        return;
      }
      setToken(undefined);
      setMessage(
        data?.confirmation === "pending"
          ? "Password changed and devices signed out. Recovery confirmation is pending."
          : "Password changed. Sign in with your new password.",
      );
    } catch {
      setMessage("Couldn’t reach Kairn. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid max-w-lg gap-5">
      <h1 className="text-title font-semibold tracking-tight">
        Set a new password
      </h1>
      {token && (
        <form className="grid gap-4" onSubmit={(event) => void reset(event)}>
          <label className="grid gap-1">
            New password
            <input
              className="min-h-11 rounded-md border bg-card px-3"
              required
              minLength={12}
              type="password"
              name="password"
              autoComplete="new-password"
            />
          </label>
          <Button className="min-h-11 justify-self-start" disabled={busy}>
            Save password
          </Button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      {!token && !message && (
        <p role="alert">This reset link is invalid or has expired.</p>
      )}
      <Link className="text-primary underline" to="/account">
        Go to account
      </Link>
    </section>
  );
}
