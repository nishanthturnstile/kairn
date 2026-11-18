import type {
  IdentityDevices,
  RestrictionConfirmation,
} from "@kairn/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { mobileAuth } from "../auth";

type Client = NonNullable<typeof mobileAuth>;
const labels = {
  signIn: "Sign in",
  signUp: "Create account",
  recover: "Reset password",
  resend: "Resend verification",
};
type Mode = keyof typeof labels;

export default function AccountRoute() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {mobileAuth ? (
        <Account client={mobileAuth} />
      ) : (
        <Text style={styles.text}>Account access is unavailable.</Text>
      )}
    </ScrollView>
  );
}

function Account({ client }: { client: Client }) {
  const session = client.useSession();
  return (
    <View style={styles.group}>
      {session.isPending && (
        <Text style={styles.text}>Checking your session</Text>
      )}
      {session.error && (
        <View style={styles.group}>
          <Text style={styles.text}>
            Account access is temporarily unavailable.
          </Text>
          <Action label="Try again" onPress={() => void session.refetch()} />
        </View>
      )}
      {session.data?.user ? (
        <Devices
          client={client}
          email={session.data.user.email}
          accountId={session.data.user.id}
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
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { theme } = useUnistyles();

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signIn") {
        const { error } = await client.signIn.email({
          email: email.trim(),
          password,
        });
        if (error)
          setMessage(
            error.code === "EMAIL_NOT_VERIFIED"
              ? "Verify your email before signing in."
              : "Couldn’t sign in. Check your email and password.",
          );
      } else if (mode === "signUp") {
        const { error } = await client.signUp.email({
          email: email.trim(),
          name: name.trim(),
          password,
        });
        setMessage(
          error
            ? "Couldn’t register. Check your details and try again."
            : "Open the verification link in your email, then return to sign in.",
        );
      } else if (mode === "recover") {
        const { error } = await client.requestPasswordReset({
          email: email.trim(),
        });
        setMessage(
          error
            ? "Couldn’t request a reset email."
            : "If the account can receive a reset email, open its link to set a new password.",
        );
      } else {
        const { error } = await client.sendVerificationEmail({
          email: email.trim(),
        });
        setMessage(
          error
            ? "Couldn’t request a verification email."
            : "If your email still needs verification, check your inbox.",
        );
      }
    } catch {
      setMessage("Couldn’t connect to Kairn. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const withPassword = mode === "signIn" || mode === "signUp";
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.heading}>
        {labels[mode]}
      </Text>
      {mode === "signUp" && (
        <View style={styles.field}>
          <Text style={styles.text}>Name</Text>
          <TextInput
            accessibilityLabel="Name"
            value={name}
            onChangeText={setName}
            autoComplete="name"
            style={styles.input}
            selectionColor={theme.colors.accent}
          />
        </View>
      )}
      <View style={styles.field}>
        <Text style={styles.text}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
          selectionColor={theme.colors.accent}
        />
      </View>
      {withPassword && (
        <View style={styles.field}>
          <Text style={styles.text}>Password</Text>
          <TextInput
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={
              mode === "signUp" ? "new-password" : "current-password"
            }
            style={styles.input}
            selectionColor={theme.colors.accent}
          />
        </View>
      )}
      <Action
        label={labels[mode]}
        disabled={
          busy ||
          !email.trim() ||
          (withPassword && !password) ||
          (mode === "signUp" && (!name.trim() || password.length < 12))
        }
        onPress={() => void submit()}
      />
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {message}
        </Text>
      ) : null}
      {(Object.keys(labels) as Mode[])
        .filter((option) => option !== mode)
        .map((option) => (
          <Action
            key={option}
            label={labels[option]}
            disabled={busy}
            onPress={() => {
              setMode(option);
              setMessage("");
              setPassword("");
            }}
          />
        ))}
    </View>
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
  const [message, setMessage] = useState("");
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
    try {
      if (!deviceId) {
        await queryClient.cancelQueries();
        queryClient.clear();
        const { error } = await client.signOut();
        if (error) setMessage("Couldn’t sign out on the server. Try again.");
      } else {
        const { data, error } = await client.$fetch<RestrictionConfirmation>(
          "/devices/revoke",
          { method: "POST", body: { id: deviceId } },
        );
        setMessage(
          error
            ? "Couldn’t revoke this session. Sign in again to refresh your session."
            : data?.confirmation === "pending"
              ? "Device signed out. Recovery confirmation is pending."
              : "Device signed out.",
        );
        await devices.refetch();
      }
    } catch {
      setMessage("Couldn’t reach Kairn. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.heading}>
        Signed-in devices
      </Text>
      <Text style={styles.text}>{email}</Text>
      <Action label="Sign out" disabled={busy} onPress={() => void act()} />
      {devices.isPending && <Text style={styles.text}>Loading devices</Text>}
      {devices.isError && (
        <Text style={styles.text}>Couldn’t load your devices.</Text>
      )}
      {devices.data?.devices.map((device) => (
        <View key={device.id} style={styles.field}>
          <Text style={styles.text}>
            {device.id === devices.data?.currentDeviceId
              ? "This device"
              : `Session started ${new Date(device.createdAt).toLocaleString()}`}
          </Text>
          {device.id !== devices.data?.currentDeviceId && (
            <Action
              label="Revoke device"
              disabled={busy}
              onPress={() => void act(device.id)}
            />
          )}
        </View>
      ))}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {message}
        </Text>
      ) : (
        Boolean(devices.data?.pendingRestrictions) && (
          <Text style={styles.text}>
            Account changes await recovery confirmation.
          </Text>
        )
      )}
    </View>
  );
}

function Action({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, disabled && styles.disabled]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create(({ colors, spacing, typeScale }) => ({
  container: {
    flexGrow: 1,
    padding: spacing.large,
    backgroundColor: colors.canvas,
  },
  group: { gap: spacing.medium },
  field: { gap: spacing.small },
  heading: {
    color: colors.ink,
    fontSize: typeScale.section,
    fontWeight: "700",
  },
  text: { color: colors.ink, fontSize: typeScale.body },
  input: {
    minHeight: 48,
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.ink,
    paddingHorizontal: spacing.medium,
  },
  action: {
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: spacing.medium,
    justifyContent: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentWash,
  },
  actionText: {
    color: colors.accent,
    fontSize: typeScale.body,
    fontWeight: "600",
  },
  disabled: { opacity: 0.5 },
}));
