import { Directory, File, Paths } from "expo-file-system";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { mobileAuth } from "../auth";
import { Destination } from "../components/destination";

type Client = NonNullable<typeof mobileAuth>;
const testPassword = "Synthetic-password-before-reset";
const replacement = "Synthetic-password-after-reset";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function mailLink(email: string, subject: string) {
  const inbox = "http://127.0.0.1:58025";
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = await fetch(
      `${inbox}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    ).then((response) => response.json());
    const match = list.messages?.find(
      (entry: { Subject: string }) => entry.Subject === subject,
    );
    if (match) {
      const mail = await fetch(`${inbox}/api/v1/message/${match.ID}`).then(
        (response) => response.json(),
      );
      const link = String(mail.Text).match(
        /http:\/\/127\.0\.0\.1:58080\/api\/auth\/\S+/,
      )?.[0];
      assert(link, "Mailpit did not contain the expected local link.");
      return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Mailpit did not receive the account email.");
}

async function register(client: Client, email: string) {
  assert(
    !(
      await client.signUp.email({
        email,
        name: "Synthetic native account",
        password: testPassword,
      })
    ).error,
    "Registration failed.",
  );
  const verify = await fetch(await mailLink(email, "Verify your Kairn email"));
  assert(verify.ok, "Verification did not return successfully.");
}

async function run() {
  const client = mobileAuth;
  assert(client, "Mobile auth origin is unavailable.");
  const id = `${Platform.OS}-${Date.now()}`;
  const first = `native-${id}-a@example.test`;
  const second = `native-${id}-b@example.test`;
  await client.signOut();

  await register(client, first);
  assert(
    !(await client.signIn.email({ email: first, password: testPassword }))
      .error,
    "Sign-in failed.",
  );
  assert(
    (await client.getSession()).data?.user.email === first,
    "The first account's session did not load.",
  );
  assert(
    (await client.getCookie()).includes("session_token"),
    "The Expo client did not persist a session cookie.",
  );
  assert(
    !(await client.requestPasswordReset({ email: first })).error,
    "Reset request failed.",
  );
  const link = await mailLink(first, "Reset your Kairn password");
  const token = link.match(/\/reset-password\/([a-zA-Z0-9]+)/)?.[1];
  assert(token, "Reset email did not identify a token.");
  const reset = await client.$fetch<{ confirmation: string }>(
    "/reset-password",
    { method: "POST", body: { token, newPassword: replacement } },
  );
  assert(
    reset.data?.confirmation === "pending",
    "The local reset did not report pending recovery confirmation.",
  );
  assert(
    !(await client.getSession()).data?.user,
    "An old session survived the password reset.",
  );
  assert(
    !(await client.signIn.email({ email: first, password: replacement })).error,
    "Sign-in with the new password failed.",
  );
  assert(!(await client.$fetch("/devices")).error, "Device list did not load.");
  assert(!(await client.signOut()).error, "Sign-out failed.");
  assert(
    !(await client.getSession()).data?.user,
    "A session survived sign-out.",
  );

  await register(client, second);
  assert(
    !(await client.signIn.email({ email: second, password: testPassword }))
      .error,
    "The second account could not sign in.",
  );
  assert(
    (await client.getSession()).data?.user.email === second,
    "Switching accounts returned the stale session.",
  );
  await client.signOut();
}

export default function AuthCheckRoute() {
  if (!__DEV__ || process.env.EXPO_PUBLIC_KAIRN_AUTH_FIXTURE !== "1")
    return <Redirect href="/account" />;
  return <AuthCheck />;
}

function AuthCheck() {
  const [message, setMessage] = useState("Checking authentication");
  useEffect(() => {
    async function check() {
      const result = await run().then(
        () => ({
          passed: true,
          message:
            "Registration, email, recovery, sign-out, and account switching passed.",
        }),
        (error: unknown) => ({
          passed: false,
          message:
            error instanceof Error
              ? error.message
              : "Authentication fixture failed.",
        }),
      );
      const directory = new Directory(Paths.document, "kairn-device-fixtures");
      directory.create({ idempotent: true });
      const file = new File(directory, "identity.json");
      file.create({ overwrite: true });
      file.write(JSON.stringify(result));
      setMessage(result.message);
    }
    void check();
  }, []);
  return (
    <Destination
      title="Account check"
      description="Synthetic native development fixture."
      stateTitle={message}
      stateDescription="Better Auth, the Expo adapter, and Mailpit."
    />
  );
}
