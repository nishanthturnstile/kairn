import { useFocusEffect, useRouter } from "expo-router";
import { type ComponentRef, useCallback, useRef, useState } from "react";
import {
  BackHandler,
  Image,
  Keyboard,
  type ScrollView,
  type TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { mobileAuth } from "../auth";
import { useMobileSession } from "../mobile-session";
import { AccountEntry, AccountEntryHeading } from "./account-entry";
import { ContentLoading } from "./fold/expression";
import { PasswordField } from "./fold/password-field";
import {
  Action,
  AppText,
  Field,
  type Notice,
  StatusNotice,
} from "./fold/primitives";

const ferry = require("../../assets/auth/ferry.jpg");
const screens = {
  signIn: {
    title: "Sign in",
    detail: "Open your Kairn workspace.",
    action: "Sign in",
    pending: "Signing in…",
  },
  signUp: {
    title: "Create account",
    detail: "A private place for the journeys you want to remember.",
    action: "Create account",
    pending: "Creating account…",
  },
  recover: {
    title: "Reset password",
    detail: "Enter the email address for your Kairn account.",
    action: "Send reset link",
    pending: "Sending link…",
  },
  verify: {
    title: "Check your email",
    detail:
      "Open the verification link in your browser, then return here to sign in.",
  },
  resetSent: {
    title: "Check your email",
    detail:
      "If an account matches, we’ll email a link to set a new password in your browser.",
  },
} as const;

type Mode = keyof typeof screens;
type FormField = "email" | "name" | "password";
export type SignOutStatus = "pending" | "error" | "done";

export function AccountAccess({
  client,
  onSignIn,
  signOutStatus,
}: {
  client?: NonNullable<typeof mobileAuth>;
  onSignIn?: (accountId: string) => void;
  signOutStatus?: SignOutStatus;
}) {
  const router = useRouter();
  const { state, refresh } = useMobileSession();
  const { fontScale, height } = useWindowDimensions();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const fields = {
    name: useRef<ComponentRef<typeof TextInput>>(null),
    email: useRef<ComponentRef<typeof TextInput>>(null),
    password: useRef<ComponentRef<typeof TextInput>>(null),
  };
  const requestInFlight = useRef(false);
  const [mode, setMode] = useState<Mode>("signIn");
  const [verificationOrigin, setVerificationOrigin] = useState<
    "signIn" | "signUp"
  >("signIn");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [invalid, setInvalid] = useState<{ field: FormField; text: string }>();
  const [busy, setBusy] = useState(false);

  const changeMode = useCallback((next: Mode) => {
    Keyboard.dismiss();
    setMode(next);
    setNotice(null);
    setInvalid(undefined);
    setPassword("");
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const correction = mode === "verify" ? verificationOrigin : "recover";

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (requestInFlight.current) return true;
          if (mode === "signIn") return false;
          changeMode(
            mode === "verify" || mode === "resetSent" ? correction : "signIn",
          );
          return true;
        },
      );
      return () => subscription.remove();
    }, [changeMode, correction, mode]),
  );

  const hasPassword = mode === "signIn" || mode === "signUp";
  function clearInvalid(field: FormField) {
    if (invalid?.field === field) setInvalid(undefined);
  }

  async function submit() {
    if (!client || busy || requestInFlight.current || state !== "signed-out")
      return;
    const address = email.trim();
    const problem: { field: FormField; text: string } | undefined =
      mode === "signUp" && !name.trim()
        ? { field: "name", text: "Enter a display name." }
        : !/^[^\s@]+@[^\s@]+$/.test(address)
          ? { field: "email", text: "Enter your email address." }
          : mode === "signUp" && password.length < 12
            ? { field: "password", text: "Use at least 12 characters." }
            : hasPassword && !password
              ? { field: "password", text: "Enter your password." }
              : undefined;
    if (problem) {
      setInvalid(problem);
      fields[problem.field].current?.focus();
      return;
    }

    requestInFlight.current = true;
    setBusy(true);
    setNotice(null);
    setInvalid(undefined);
    setEmail(address);
    try {
      if (mode === "signIn") {
        const { data, error } = await client.signIn.email({
          email: address,
          password,
          fetchOptions: { headers: { "X-Kairn-Onboarding": "1" } },
        });
        if (!error && data?.user) {
          Keyboard.dismiss();
          setPassword("");
          onSignIn?.(data.user.id);
        } else if (error?.code === "EMAIL_NOT_VERIFIED") {
          setVerificationOrigin("signIn");
          changeMode("verify");
        } else {
          setNotice({
            tone: "error",
            text: "Couldn’t sign in. Check your email and password.",
          });
        }
      } else if (mode === "signUp") {
        const { error } = await client.signUp.email({
          email: address,
          name: name.trim(),
          password,
        });
        if (error) {
          setNotice({
            tone: "error",
            text: "Couldn’t register. Check your details and try again.",
          });
        } else {
          setVerificationOrigin("signUp");
          changeMode("verify");
        }
      } else if (mode === "recover") {
        const { error } = await client.requestPasswordReset({ email: address });
        if (error) {
          setNotice({
            tone: "error",
            text: "Couldn’t request a reset link. Try again.",
          });
        } else {
          changeMode("resetSent");
        }
      }
    } catch {
      setNotice({
        tone: "error",
        text: "Couldn’t connect to Kairn. Try again.",
      });
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  async function resend() {
    if (!client || state !== "signed-out" || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await client.sendVerificationEmail({ email });
      setNotice(
        error
          ? {
              tone: "error",
              text: "Couldn’t send the verification link. Try again.",
            }
          : {
              tone: "info",
              text: "If this address still needs verification, check your inbox for a new link.",
            },
      );
    } catch {
      setNotice({
        tone: "error",
        text: "Couldn’t connect to Kairn. Try again.",
      });
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  if (state === "unavailable" || !client)
    return (
      <AccountEntry>
        <AccountEntryHeading
          title="Account access unavailable"
          detail="Kairn couldn’t check your session."
        />
        {client && (
          <Action
            label="Try again"
            variant="primary"
            onPress={() => refresh()}
          />
        )}
        <Action
          label="Design system"
          variant="text"
          onPress={() => router.push("/design-system")}
        />
      </AccountEntry>
    );

  if (state !== "signed-out" || signOutStatus === "pending")
    return (
      <AccountEntry>
        <ContentLoading
          skeleton={false}
          label={
            signOutStatus === "pending"
              ? "Signing out"
              : busy
                ? "Signing in"
                : "Checking your session"
          }
        />
      </AccountEntry>
    );

  const screen = screens[mode];
  const confirmation = !("action" in screen);
  const errorFor = (field: FormField) =>
    invalid?.field === field ? invalid.text : undefined;
  return (
    <AccountEntry scrollRef={scroll}>
      {mode === "signIn" && fontScale < 1.4 && height >= 650 && (
        <Image
          source={ferry}
          accessible={false}
          style={styles.art}
          resizeMode="cover"
        />
      )}
      <AccountEntryHeading title={screen.title} detail={screen.detail} />
      {mode === "signIn" && signOutStatus && (
        <StatusNotice
          notice={
            signOutStatus === "error"
              ? {
                  tone: "warning",
                  text: "Signed out on this device. Kairn couldn’t confirm the sign-out on the server.",
                }
              : { tone: "success", text: "You’re signed out." }
          }
        />
      )}
      {confirmation ? (
        <>
          <View style={styles.address}>
            <AppText text="Email address" variant="caption" subdued />
            <AppText text={email} variant="label" />
            <View style={styles.start}>
              <Action
                label="Change email"
                variant="text"
                disabled={busy}
                onPress={() => changeMode(correction)}
              />
            </View>
          </View>
          <StatusNotice notice={notice} />
          <View style={styles.actions}>
            <Action
              label="Back to sign in"
              variant="primary"
              disabled={busy}
              onPress={() => changeMode("signIn")}
            />
            {mode === "verify" && (
              <Action
                label={busy ? "Sending link…" : "Resend verification email"}
                disabled={busy}
                accessibilityState={{ busy }}
                onPress={() => void resend()}
              />
            )}
          </View>
        </>
      ) : (
        <>
          <View style={styles.fields}>
            {mode === "signUp" && (
              <Field
                label="Display name"
                ref={fields.name}
                value={name}
                error={errorFor("name")}
                onChangeText={(value) => {
                  setName(value);
                  clearInvalid("name");
                }}
                maxLength={120}
                autoComplete="name"
                autoCapitalize="words"
                readOnly={busy}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => fields.email.current?.focus()}
              />
            )}
            <Field
              label="Email"
              ref={fields.email}
              value={email}
              error={errorFor("email")}
              onChangeText={(value) => {
                setEmail(value);
                clearInvalid("email");
              }}
              autoComplete={mode === "signIn" ? "username" : "email"}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              readOnly={busy}
              returnKeyType={hasPassword ? "next" : "go"}
              submitBehavior={hasPassword ? "submit" : "blurAndSubmit"}
              onSubmitEditing={() => {
                if (hasPassword) fields.password.current?.focus();
                else void submit();
              }}
            />
            {hasPassword && (
              <PasswordField
                key={mode}
                label="Password"
                ref={fields.password}
                returnKeyType="go"
                value={password}
                error={errorFor("password")}
                onChangeText={(value) => {
                  setPassword(value);
                  clearInvalid("password");
                }}
                readOnly={busy}
                autoComplete={
                  mode === "signUp" ? "new-password" : "current-password"
                }
                accessibilityHint={
                  mode === "signUp" ? "Use at least 12 characters." : undefined
                }
                onSubmitEditing={() => void submit()}
              />
            )}
            {mode === "signUp" && !errorFor("password") && (
              <AppText
                text="Use at least 12 characters."
                variant="caption"
                subdued
              />
            )}
          </View>
          <StatusNotice notice={notice} />
          <View style={styles.actions}>
            <Action
              label={busy ? screen.pending : screen.action}
              variant="primary"
              disabled={busy}
              accessibilityState={{ busy }}
              onPress={() => void submit()}
            />
            {mode === "signIn" && (
              <Action
                label="Forgot password?"
                variant="text"
                disabled={busy}
                onPress={() => changeMode("recover")}
              />
            )}
          </View>
          <View style={styles.footer}>
            <Action
              label={mode === "signIn" ? "Create account" : "Back to sign in"}
              variant={mode === "signIn" ? "secondary" : "text"}
              disabled={busy}
              onPress={() =>
                changeMode(mode === "signIn" ? "signUp" : "signIn")
              }
            />
            {mode === "signIn" && (
              <Action
                label="Design system"
                variant="text"
                disabled={busy}
                onPress={() => router.push("/design-system")}
              />
            )}
          </View>
        </>
      )}
    </AccountEntry>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    art: {
      width: "100%",
      height: 112,
      borderRadius: radius.card,
      backgroundColor: color.actionWash,
    },
    fields: { gap: space.step12 },
    actions: { gap: space.step4 },
    start: { alignItems: "flex-start" },
    address: {
      gap: space.step4,
      padding: space.step12,
      borderRadius: radius.card,
      borderWidth: border.control,
      borderColor: color.boundary,
      backgroundColor: color.surface,
    },
    footer: {
      borderTopWidth: border.control,
      borderTopColor: color.divider,
      paddingTop: space.step12,
      gap: space.step4,
    },
  }),
);
