import { useRouter } from "expo-router";
import { useState } from "react";
import { mobileAuth } from "../auth";
import { AccountSettings } from "../components/account/settings";
import {
  AccountAccess,
  type SignOutStatus,
} from "../components/account-access";
import { ReceiptProvider } from "../components/fold/receipt";
import { clearInvitationHandoff } from "../invitation-handoff";
import { useMobileSession } from "../mobile-session";
import { useWorkspace } from "../workspace";

type Client = NonNullable<typeof mobileAuth>;
export default function AccountRoute() {
  return (
    <ReceiptProvider>
      {mobileAuth ? <Account client={mobileAuth} /> : <AccountAccess />}
    </ReceiptProvider>
  );
}

function Account({ client }: { client: Client }) {
  const { state, scope, signOut } = useMobileSession();
  const session = client.useSession();
  const router = useRouter();
  const { entry, progress, signedIn } = useWorkspace();
  const [signOutAttempt, setSignOutAttempt] = useState<{
    accountId: string;
    status: SignOutStatus;
  }>();
  const user =
    session.data?.user.id === scope?.accountId ? session.data?.user : undefined;
  if (!scope) {
    return (
      <AccountAccess
        client={client}
        signOutStatus={signOutAttempt?.status}
        onSignIn={(accountId) => {
          setSignOutAttempt(undefined);
          signedIn({ accountId });
        }}
      />
    );
  }

  async function leave(accountId: string) {
    clearInvitationHandoff();
    setSignOutAttempt({ accountId, status: "pending" });
    const success = await signOut().catch(() => false);
    setSignOutAttempt({ accountId, status: success ? "done" : "error" });
  }

  return (
    <AccountSettings
      key={scope.accountId}
      scope={scope}
      email={user?.email}
      active={state === "verified" && Boolean(user)}
      setupUnavailable={
        entry?.accountId === scope.accountId && progress.isError
      }
      retrySetup={() => void progress.refetch()}
      checkingSetup={progress.isFetching}
      resumeSetup={
        progress.data?.state === "pending"
          ? () => router.dismissTo("/onboarding")
          : undefined
      }
      signOut={() => void leave(scope.accountId)}
      signOutStatus={
        signOutAttempt?.accountId === scope.accountId
          ? signOutAttempt.status
          : undefined
      }
    />
  );
}
