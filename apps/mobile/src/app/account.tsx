import type {
  IdentityDevices,
  RestrictionConfirmation,
} from "@kairn/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useAppearancePreference } from "../appearance";
import { mobileAuth } from "../auth";
import {
  Action,
  AppText,
  Field,
  type Notice,
  Panel,
  StatusNotice,
} from "../components/ui";
import type { AppearancePreference } from "../theme";

type Client = NonNullable<typeof mobileAuth>;
const labels = {
  signIn: "Sign in",
  signUp: "Create account",
  recover: "Reset password",
  resend: "Resend verification",
};
type Mode = keyof typeof labels;

export default function AccountRoute() {
  const { theme } = useUnistyles();

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.semantic.color.canvas }}
    >
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        style={styles.screen}
        contentContainerStyle={styles.container}
      >
        {mobileAuth ? (
          <Account client={mobileAuth} />
        ) : (
          <StatusNotice
            notice={{ text: "Account access is unavailable.", tone: "error" }}
          />
        )}
        <AppearanceSettings />
      </ScrollView>
    </SafeAreaView>
  );
}

function Account({ client }: { client: Client }) {
  const session = client.useSession();
  const user = session.data?.user;
  return (
    <View style={styles.group}>
      {session.error && (
        <Panel>
          <StatusNotice
            notice={{
              text: "Account access is temporarily unavailable.",
              tone: "error",
            }}
          />
          <Action
            label="Try again"
            disabled={session.isPending}
            onPress={() => void session.refetch()}
          />
        </Panel>
      )}
      {user ? (
        <Devices client={client} email={user.email} accountId={user.id} />
      ) : session.isPending ? (
        <StatusNotice
          notice={{ text: "Checking your session", tone: "info" }}
        />
      ) : (
        <AccountForm client={client} />
      )}
    </View>
  );
}

function AccountForm({ client }: { client: Client }) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signIn") {
        const { error } = await client.signIn.email({
          email: email.trim(),
          password,
        });
        if (error) {
          setNotice({
            text:
              error.code === "EMAIL_NOT_VERIFIED"
                ? "Verify your email before signing in."
                : "Couldn’t sign in. Check your email and password.",
            tone: error.code === "EMAIL_NOT_VERIFIED" ? "warning" : "error",
          });
        }
      } else if (mode === "signUp") {
        const { error } = await client.signUp.email({
          email: email.trim(),
          name: name.trim(),
          password,
        });
        setNotice({
          text: error
            ? "Couldn’t register. Check your details and try again."
            : "Open the verification link in your email, then return to sign in.",
          tone: error ? "error" : "info",
        });
      } else if (mode === "recover") {
        const { error } = await client.requestPasswordReset({
          email: email.trim(),
        });
        setNotice({
          text: error
            ? "Couldn’t request a reset email."
            : "If the account can receive a reset email, open its link to set a new password.",
          tone: error ? "error" : "info",
        });
      } else {
        const { error } = await client.sendVerificationEmail({
          email: email.trim(),
        });
        setNotice({
          text: error
            ? "Couldn’t request a verification email."
            : "If your email still needs verification, check your inbox.",
          tone: error ? "error" : "info",
        });
      }
    } catch {
      setNotice({
        text: "Couldn’t connect to Kairn. Try again.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const withPassword = mode === "signIn" || mode === "signUp";
  return (
    <Panel>
      <View style={styles.group}>
        <AppText
          text={labels[mode]}
          accessibilityRole="header"
          variant="section"
        />
        {mode === "signUp" && (
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            autoComplete="name"
            editable={!busy}
          />
        )}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        {withPassword && (
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!busy}
            autoComplete={
              mode === "signUp" ? "new-password" : "current-password"
            }
          />
        )}
        {mode === "signUp" && (
          <AppText
            text="Use at least 12 characters for your password."
            subdued
          />
        )}
        <Action
          label={labels[mode]}
          variant="primary"
          accessibilityState={{ busy }}
          disabled={
            busy ||
            !email.trim() ||
            (withPassword && !password) ||
            (mode === "signUp" && (!name.trim() || password.length < 12))
          }
          onPress={() => void submit()}
        />
        <StatusNotice notice={notice} />
        <View style={styles.actions}>
          {(Object.keys(labels) as Mode[])
            .filter((option) => option !== mode)
            .map((option) => (
              <Action
                key={option}
                label={labels[option]}
                disabled={busy}
                onPress={() => {
                  setMode(option);
                  setNotice(null);
                  setPassword("");
                }}
              />
            ))}
        </View>
      </View>
    </Panel>
  );
}

function Devices({
  client,
  email,
  accountId,
}: {
  client: Client;
  email: string;
  accountId: string;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
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

  async function act(deviceId?: string) {
    setBusy(true);
    setNotice(null);
    try {
      if (!deviceId) {
        await queryClient.cancelQueries();
        queryClient.clear();
        const { error } = await client.signOut();
        if (error) {
          setNotice({
            text: "Couldn’t sign out on the server. Try again.",
            tone: "error",
          });
        }
      } else {
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
      }
    } catch {
      setNotice({ text: "Couldn’t reach Kairn. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.group}>
      <AppText
        text="Signed-in devices"
        accessibilityRole="header"
        variant="section"
      />
      <AppText text={email} subdued />
      <View style={styles.actions}>
        <Action label="Sign out" disabled={busy} onPress={() => void act()} />
      </View>
      {devices.isPending && (
        <StatusNotice notice={{ text: "Loading devices", tone: "info" }} />
      )}
      {devices.isError && (
        <Panel>
          <StatusNotice
            notice={{ text: "Couldn’t load your devices.", tone: "error" }}
          />
          <Action
            label="Try again"
            disabled={devices.isFetching || busy}
            onPress={() => void devices.refetch()}
          />
        </Panel>
      )}
      {devices.data?.devices.map((device) => {
        const current = device.id === devices.data?.currentDeviceId;
        const started = new Date(device.createdAt).toLocaleString("en-IN");
        return (
          <Panel key={device.id}>
            <AppText
              text={current ? "This device" : `Session started ${started}`}
              variant="label"
            />
            {!current && (
              <View style={styles.actions}>
                <Action
                  label="Revoke device"
                  variant="danger"
                  accessibilityLabel={`Revoke device, session started ${started}`}
                  disabled={busy}
                  onPress={() => void act(device.id)}
                />
              </View>
            )}
          </Panel>
        );
      })}
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
    </View>
  );
}

const appearances: readonly [AppearancePreference, string][] = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
  ["outdoor", "Outdoor"],
];

function AppearanceSettings() {
  const { preference, selectAppearance } = useAppearancePreference();
  return (
    <Panel>
      <AppText text="Appearance" accessibilityRole="header" variant="section" />
      <AppText text="Outdoor uses stronger outlines for glare." subdued />
      <View accessibilityRole="radiogroup" style={styles.actions}>
        {appearances.map(([value, label]) => (
          <Action
            key={value}
            label={label}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === preference }}
            variant={value === preference ? "primary" : "secondary"}
            onPress={() => selectAppearance(value)}
          />
        ))}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create(({ semantic: { color, space } }) => ({
  screen: { flex: 1, backgroundColor: color.canvas },
  container: {
    padding: space.step24,
    gap: space.step24,
  },
  group: { gap: space.step16 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.step8,
  },
}));
