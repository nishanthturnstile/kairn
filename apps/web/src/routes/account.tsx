import type {
  IdentityDevices,
  RestrictionConfirmation,
} from "@kairn/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button } from "../components/ui/button";
import { authClient } from "../lib/auth";

export const Route = createFileRoute("/account")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { verification?: "confirmed"; error?: string } => ({
    verification:
      search.verification === "confirmed" ? ("confirmed" as const) : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
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

function AccountPage() {
  const { data, isPending, error } = authClient.useSession();
  const verification = Route.useSearch();
  return (
    <section className="grid max-w-lg gap-6">
      <h1 className="text-title font-semibold tracking-tight">Account</h1>
      {verification.error && (
        <p role="alert">That verification link is invalid or has expired.</p>
      )}
      {verification.verification && !verification.error && (
        <p role="status">Your email is verified. You can sign in now.</p>
      )}
      {isPending && <output>Checking your session</output>}
      {error && <p role="alert">Account access is temporarily unavailable.</p>}
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
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const email = String(input.get("email")).trim();
    const password = String(input.get("password") ?? "");
    setBusy(true);
    setMessage("");
    try {
      if (mode === "sign-in") {
        const { error } = await authClient.signIn.email({ email, password });
        if (error)
          setMessage(
            error.code === "EMAIL_NOT_VERIFIED"
              ? "Verify your email before signing in."
              : "Couldn’t sign in. Check your email and password.",
          );
      } else if (mode === "sign-up") {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name: String(input.get("name")).trim(),
        });
        setMessage(
          error
            ? "Couldn’t register. Check your details and try again."
            : "Check your inbox for a verification link.",
        );
      } else if (mode === "recover") {
        const { error } = await authClient.requestPasswordReset({ email });
        setMessage(
          error
            ? "Couldn’t request a reset email. Try again later."
            : "If that account can receive a reset email, check your inbox.",
        );
      } else {
        const { error } = await authClient.sendVerificationEmail({ email });
        setMessage(
          error
            ? "Couldn’t request a verification email. Try again later."
            : "If that email still needs verification, check your inbox.",
        );
      }
    } catch {
      setMessage("Couldn’t connect to Kairn. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-4 rounded-lg border bg-card p-6"
      onSubmit={(event) => void submit(event)}
    >
      <h2 className="text-lg font-semibold">{modeLabels[mode]}</h2>
      {mode === "sign-up" && (
        <label className="grid gap-1">
          Name
          <input
            name="name"
            autoComplete="name"
            className="min-h-11 rounded-md border px-3"
            required
          />
        </label>
      )}
      <label className="grid gap-1">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          className="min-h-11 rounded-md border px-3"
          required
        />
      </label>
      {(mode === "sign-in" || mode === "sign-up") && (
        <label className="grid gap-1">
          Password
          <input
            key={mode}
            name="password"
            type="password"
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
            minLength={mode === "sign-up" ? 12 : undefined}
            className="min-h-11 rounded-md border px-3"
            required
          />
        </label>
      )}
      <Button className="min-h-11 justify-self-start" disabled={busy}>
        {modeLabels[mode]}
      </Button>
      {message && <p role="status">{message}</p>}
      <div className="flex flex-wrap gap-1">
        {(Object.keys(modeLabels) as FormMode[])
          .filter((option) => option !== mode)
          .map((option) => (
            <Button
              key={option}
              type="button"
              variant="link"
              className="min-h-11"
              disabled={busy}
              onClick={() => {
                setMode(option);
                setMessage("");
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
  const [message, setMessage] = useState("");
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
    setMessage("");
    setRevoking(true);
    try {
      const { data, error } = await authClient.$fetch<RestrictionConfirmation>(
        "/devices/revoke",
        { method: "POST", body: { id: deviceId } },
      );
      if (error) {
        setMessage(
          "Couldn’t revoke this session. Sign in again to refresh your session.",
        );
        return;
      }
      setMessage(
        data?.confirmation === "pending"
          ? "Device signed out. Recovery confirmation is pending."
          : "Device signed out.",
      );
      await devices.refetch();
    } catch {
      setMessage("Couldn’t reach Kairn. Try again.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="grid gap-5 rounded-lg border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>{email}</p>
        <Button
          className="min-h-11"
          variant="outline"
          onClick={async () => {
            const success = await signOut();
            if (!success) setMessage("Couldn’t sign out. Try again.");
          }}
        >
          Sign out
        </Button>
      </div>
      <h2 className="text-lg font-semibold">Signed-in devices</h2>
      {devices.isPending && <output>Loading devices</output>}
      {devices.isError && <p role="alert">Couldn’t load your devices.</p>}
      {devices.data?.devices.map((device) => (
        <div
          key={device.id}
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
        >
          {device.id === devices.data?.currentDeviceId ? (
            <p>This device</p>
          ) : (
            <>
              <p>
                Session started {new Date(device.createdAt).toLocaleString()}
              </p>
              <Button
                className="min-h-11"
                variant="outline"
                disabled={revoking}
                onClick={() => void revoke(device.id)}
              >
                Revoke device
              </Button>
            </>
          )}
        </div>
      ))}
      {message && <p role="status">{message}</p>}
      {!message && Boolean(devices.data?.pendingRestrictions) && (
        <p role="status">Account changes await recovery confirmation.</p>
      )}
    </div>
  );
}
