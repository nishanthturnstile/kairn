import type {
  IdentityDevices,
  RestrictionConfirmation,
} from "@kairn/contracts";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { mobileAuth } from "../auth";
import {
  AccountAccess,
  type SignOutStatus,
} from "../components/account-access";
import { AppearancePicker } from "../components/fold/appearance";
import {
  Action,
  AppText,
  type Notice,
  Panel,
  StatusNotice,
} from "../components/fold/primitives";
import { ReceiptProvider } from "../components/fold/receipt";
import { InviteDiscoverySetting } from "../components/invite-discovery-setting";
import { ProfileName } from "../components/profile-name";
import { clearInvitationHandoff } from "../invitation-handoff";
import { useMobileSession } from "../mobile-session";
import { useWorkspace } from "../workspace";

type Client = NonNullable<typeof mobileAuth>;
const sessionDate = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
  const { width, fontScale } = useWindowDimensions();
  const [signOutAttempt, setSignOutAttempt] = useState<{
    accountId: string;
    status: SignOutStatus;
  }>();
  const wide = width >= 800 && fontScale <= 1.3;
  const stacked = width < 365 || fontScale > 1.4;
  const user =
    session.data?.user.id === scope?.accountId ? session.data?.user : undefined;
  const showMember = state === "verified" && user && scope;
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
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.screen}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
      >
        {user && (
          <View
            key={scope.accountId}
            accessibilityElementsHidden={!showMember}
            importantForAccessibility={
              showMember ? "auto" : "no-hide-descendants"
            }
            style={showMember ? styles.group : styles.hidden}
          >
            {entry?.accountId === scope.accountId && progress.isError && (
              <Panel>
                <StatusNotice
                  notice={{ text: "Couldn’t check your setup.", tone: "error" }}
                />
                <Action
                  label="Try again"
                  disabled={progress.isFetching}
                  onPress={() => void progress.refetch()}
                />
              </Panel>
            )}
            {progress.data?.state === "pending" && (
              <Action
                label="Resume setup"
                variant="primary"
                onPress={() => router.dismissTo("/onboarding")}
              />
            )}
            <View style={wide ? styles.columns : styles.group}>
              <View style={wide && styles.column}>
                <ProfileName
                  scope={scope}
                  account={{ email: user.email, stacked }}
                />
              </View>
              <View style={wide && styles.column}>
                <Devices
                  client={client}
                  accountId={user.id}
                  stacked={stacked}
                  signOut={() => void leave(user.id)}
                  signOutStatus={
                    signOutAttempt?.accountId === user.id
                      ? signOutAttempt.status
                      : undefined
                  }
                />
              </View>
            </View>
            <InviteDiscoverySetting scope={scope} />
            <Panel>
              <AppearancePicker />
              <AppText
                text="Outdoor increases contrast in bright light."
                variant="caption"
                subdued
              />
            </Panel>
            <Action
              label="Design system"
              onPress={() => router.push("/design-system")}
            />
          </View>
        )}
        {state === "checking" && (
          <StatusNotice
            notice={{ text: "Checking your session", tone: "info" }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Devices({
  client,
  accountId,
  stacked,
  signOut,
  signOutStatus,
}: {
  client: Client;
  accountId: string;
  stacked: boolean;
  signOut: () => void;
  signOutStatus?: SignOutStatus;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const signingOut = signOutStatus === "pending";
  const devices = useQuery({
    queryKey: [accountId, "devices"],
    async queryFn({ signal }) {
      const { data, error } = await client.$fetch<IdentityDevices>("/devices", {
        signal,
      });
      if (error) throw new Error("Devices unavailable");
      return data;
    },
  });
  const currentDeviceId = devices.data?.currentDeviceId;
  const sessions = devices.data?.devices
    .slice()
    .sort(
      (a, b) =>
        Number(b.id === currentDeviceId) - Number(a.id === currentDeviceId),
    );
  const signOutAction = (
    <Action
      label={signingOut ? "Signing out…" : "Sign out"}
      variant="danger"
      disabled={busy || signingOut}
      accessibilityState={{ busy: signingOut }}
      onPress={signOut}
    />
  );

  async function revoke(deviceId: string) {
    setBusy(true);
    setNotice(null);
    try {
      const { data, error } = await client.$fetch<RestrictionConfirmation>(
        "/devices/revoke",
        { method: "POST", body: { id: deviceId } },
      );
      setNotice({
        text: error
          ? "Couldn’t revoke this session. Sign in again to refresh your session."
          : data?.confirmation === "pending"
            ? "Device signed out. Recovery confirmation is pending."
            : "Device signed out.",
        tone: error
          ? "error"
          : data?.confirmation === "pending"
            ? "warning"
            : "success",
      });
      await devices.refetch();
    } catch {
      setNotice({ text: "Couldn’t reach Kairn. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <AppText
        text="Signed-in devices"
        accessibilityRole="header"
        variant="section"
      />
      {devices.isPending && (
        <StatusNotice notice={{ text: "Loading devices", tone: "info" }} />
      )}
      {devices.isError && (
        <View style={styles.deviceList}>
          <StatusNotice
            notice={{ text: "Couldn’t load your devices.", tone: "error" }}
          />
          <View style={styles.start}>
            <Action
              label="Try again"
              disabled={devices.isFetching || busy || signingOut}
              onPress={() => void devices.refetch()}
            />
          </View>
        </View>
      )}
      <StatusNotice
        notice={
          signOutStatus === "error"
            ? {
                text: "Couldn’t sign out on the server. Try again.",
                tone: "error",
              }
            : null
        }
      />
      {!sessions?.some((device) => device.id === currentDeviceId) && (
        <View style={styles.signOut}>{signOutAction}</View>
      )}
      {!!sessions?.length && (
        <View style={styles.deviceList}>
          {sessions.map((device) => {
            const current = device.id === currentDeviceId;
            const started = sessionDate.format(new Date(device.createdAt));
            return (
              <View
                key={device.id}
                style={[
                  styles.deviceRow,
                  stacked && styles.deviceStack,
                  current && styles.currentDevice,
                ]}
              >
                <View
                  style={[styles.deviceCopy, !stacked && styles.deviceInline]}
                >
                  <AppText
                    text={current ? "This device" : "Other device"}
                    variant="label"
                  />
                  <AppText
                    text={`Signed in ${started}`}
                    variant="caption"
                    subdued
                  />
                </View>
                {current ? (
                  signOutAction
                ) : (
                  <Action
                    label="Revoke device"
                    accessibilityLabel={`Revoke device, signed in ${started}`}
                    disabled={busy || signingOut}
                    onPress={() => void revoke(device.id)}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
      {sessions?.length === 0 && (
        <AppText text="No signed-in devices to show." subdued />
      )}
      <StatusNotice
        notice={
          notice ??
          (devices.data?.pendingRestrictions
            ? {
                text: "Account changes await recovery confirmation.",
                tone: "warning",
              }
            : null)
        }
      />
    </Panel>
  );
}

const styles = StyleSheet.create(({ semantic: { color, radius, space } }) => ({
  screen: { flex: 1, backgroundColor: color.canvas },
  container: {
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
    padding: space.step16,
    paddingBottom: space.step24,
    gap: space.step16,
  },
  group: { gap: space.step16 },
  columns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.step16,
  },
  column: { flex: 1 },
  hidden: { display: "none" },
  deviceList: { gap: space.step8 },
  deviceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.step12,
    padding: space.step12,
    borderRadius: radius.control,
    backgroundColor: color.canvas,
  },
  deviceStack: { flexDirection: "column", alignItems: "stretch" },
  deviceCopy: { gap: space.step4 },
  deviceInline: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 164,
    minWidth: 164,
  },
  currentDevice: { backgroundColor: color.actionWash },
  start: { alignItems: "flex-start" },
  signOut: {
    alignItems: "flex-start",
    paddingTop: space.step8,
  },
}));
