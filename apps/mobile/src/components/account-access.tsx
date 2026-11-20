import { useFocusEffect } from "expo-router";
import { type ComponentRef, useCallback, useRef, useState } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  type TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import type { mobileAuth } from "../auth";
import { publicEnvironment } from "../env";
import { useMobileSession } from "../mobile-session";
import {
  Action,
  AppText,
  Field,
  focusOutline,
  type Notice,
  StatusNotice,
  touchTarget,
} from "./ui";

const artwork = require("../../assets/auth/ferry.jpg");
const eye = require("../../assets/auth/eye.png");
const eyeOff = require("../../assets/auth/eye-off.png");

type Client = NonNullable<typeof mobileAuth>;
const copy = {
  signIn: {
    title: "Sign in",
    description: "Open your Kairn workspace.",
    action: "Sign in",
  },
  signUp: {
    title: "Create account",
    description: "A private place for the journeys you want to remember.",
    action: "Create account",
  },
  recover: {
    title: "Reset password",
    description: "Enter the email address for your Kairn account.",
    action: "Send reset link",
  },
  verify: {
    title: "Check your email",
    description: "Open the verification link before signing in.",
    action: "Back to sign in",
  },
  resetSent: {
    title: "Check your email",
    description:
      "If an account matches, you’ll receive a reset link. Open it in your browser.",
    action: "Back to sign in",
  },
} as const;
type Mode = keyof typeof copy;

export function AccountAccess({
  client,
  onSignIn,
  signOutUnconfirmed,
}: {
  client?: Client;
  onSignIn?: (accountId: string) => void;
  signOutUnconfirmed?: boolean;
}) {
  const { state, refresh } = useMobileSession();
  const { fontScale, height, width } = useWindowDimensions();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const emailField = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordField = useRef<ComponentRef<typeof TextInput>>(null);
  const requestInFlight = useRef(false);
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasShownForm, setHasShownForm] = useState(state === "signed-out");
  if (!hasShownForm && state === "signed-out") setHasShownForm(true);

  const onAuthForm = mode === "signIn" || mode === "signUp";
  const confirmation = mode === "verify" || mode === "resetSent";
  const editing = state === "signed-out" && !busy;
  const ready = Boolean(
    client &&
      editing &&
      email.trim() &&
      (!onAuthForm || password) &&
      (mode !== "signUp" || (name.trim() && password.length >= 12)),
  );
  const unavailable = state === "unavailable" || !client;
  const showForm = !unavailable && (state === "signed-out" || hasShownForm);

  const changeMode = useCallback((next: Mode) => {
    Keyboard.dismiss();
    setMode(next);
    setNotice(null);
    setPassword("");
    setVisible(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
    AccessibilityInfo.announceForAccessibility(copy[next].title);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (mode === "signIn") return;
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (!requestInFlight.current) changeMode("signIn");
          return true;
        },
      );
      return () => subscription.remove();
    }, [changeMode, mode]),
  );

  async function submit() {
    if (!ready || !client || requestInFlight.current) return;
    const address = email.trim();
    requestInFlight.current = true;
    setBusy(true);
    setNotice(null);
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
          onSignIn?.(data.user.id);
        } else if (error?.code === "EMAIL_NOT_VERIFIED") {
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
        if (error)
          setNotice({
            tone: "error",
            text: "Couldn’t register. Check your details and try again.",
          });
        else changeMode("verify");
      } else if (mode === "recover") {
        const { error } = await client.requestPasswordReset({ email: address });
        if (error)
          setNotice({
            tone: "error",
            text: "Couldn’t request a reset link. Try again.",
          });
        else changeMode("resetSent");
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
    if (!client || !editing || requestInFlight.current || mode !== "verify")
      return;
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

  const { title, description, action } = copy[mode];
  const resetPassword = mode === "signIn" && (
    <Action
      label="Reset password"
      variant="text"
      disabled={!editing}
      onPress={() => changeMode("recover")}
    />
  );
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        ref={scroll}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.content}>
          <AppText
            text={publicEnvironment.appName}
            variant="section"
            style={styles.brand}
          />
          {onAuthForm && fontScale < 1.5 && height >= 580 && (
            <Image
              source={artwork}
              accessible={false}
              style={styles.art(width)}
              resizeMode="cover"
            />
          )}
          <View style={styles.intro}>
            <AppText
              text={showForm ? title : "Sign in"}
              variant="title"
              accessibilityRole="header"
            />
            {showForm && <AppText text={description} subdued />}
          </View>
          {signOutUnconfirmed &&
            mode === "signIn" &&
            state === "signed-out" && (
              <StatusNotice
                notice={{
                  tone: "warning",
                  text: "Signed out on this device. Kairn couldn’t confirm the sign-out on the server.",
                }}
              />
            )}
          {!showForm ? (
            <>
              <StatusNotice
                notice={
                  unavailable
                    ? {
                        tone: "error",
                        text: "Account access is temporarily unavailable.",
                      }
                    : { tone: "info", text: "Checking your session." }
                }
              />
              {unavailable && client && (
                <Action
                  label="Try again"
                  onPress={() => refresh()}
                  variant="primary"
                />
              )}
            </>
          ) : confirmation ? (
            <View style={styles.form}>
              {mode === "verify" && <AppText text={email} variant="label" />}
              <StatusNotice notice={notice} />
              <Action
                label={action}
                variant="primary"
                disabled={!editing}
                onPress={() => changeMode("signIn")}
              />
              {mode === "verify" && (
                <Action
                  label={busy ? "Sending…" : "Resend verification email"}
                  variant="text"
                  disabled={!editing}
                  onPress={() => void resend()}
                />
              )}
            </View>
          ) : (
            <>
              <View style={styles.form}>
                {mode === "signUp" && (
                  <Field
                    label="Display name"
                    value={name}
                    onChangeText={setName}
                    maxLength={120}
                    autoComplete="name"
                    autoCapitalize="words"
                    editable={editing}
                    returnKeyType="next"
                    onSubmitEditing={() => emailField.current?.focus()}
                  />
                )}
                <Field
                  label="Email"
                  ref={emailField}
                  value={email}
                  onChangeText={setEmail}
                  autoComplete={onAuthForm ? "username" : "email"}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={editing}
                  returnKeyType={onAuthForm ? "next" : "go"}
                  onSubmitEditing={() => {
                    if (onAuthForm) passwordField.current?.focus();
                    else void submit();
                  }}
                />
                {onAuthForm && (
                  <>
                    <Field
                      label="Password"
                      ref={passwordField}
                      returnKeyType="go"
                      labelAction={fontScale < 1.5 && resetPassword}
                      suffix={
                        <PasswordVisibility
                          visible={visible}
                          disabled={!editing}
                          toggle={() => setVisible((value) => !value)}
                        />
                      }
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!visible}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={editing}
                      autoComplete={
                        mode === "signUp" ? "new-password" : "current-password"
                      }
                      onSubmitEditing={() => void submit()}
                    />
                    {mode === "signUp" && (
                      <AppText
                        text="Use at least 12 characters."
                        variant="caption"
                        subdued
                      />
                    )}
                  </>
                )}
                <StatusNotice notice={notice} />
                <Action
                  label={
                    busy
                      ? mode === "signIn"
                        ? "Signing in…"
                        : mode === "signUp"
                          ? "Creating account…"
                          : "Sending…"
                      : action
                  }
                  variant="primary"
                  accessibilityState={busy ? { busy: true } : undefined}
                  disabled={!ready}
                  onPress={() => void submit()}
                />
                {fontScale >= 1.5 && resetPassword}
              </View>
              <View style={styles.footer}>
                {onAuthForm && (
                  <AppText
                    text={
                      mode === "signIn"
                        ? "New to Kairn?"
                        : "Already have an account?"
                    }
                    subdued
                  />
                )}
                <Action
                  label={
                    mode === "signIn"
                      ? "Create account"
                      : mode === "signUp"
                        ? "Sign in"
                        : "Back to sign in"
                  }
                  variant="text"
                  disabled={!editing}
                  onPress={() =>
                    changeMode(mode === "signIn" ? "signUp" : "signIn")
                  }
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PasswordVisibility({
  visible,
  disabled,
  toggle,
}: {
  visible: boolean;
  disabled: boolean;
  toggle: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={visible ? "Hide password" : "Show password"}
      disabled={disabled}
      onPress={toggle}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.eyeButton,
        pressed && styles.pressed,
        focused && styles.focused,
      ]}
    >
      <Image
        source={visible ? eyeOff : eye}
        accessible={false}
        style={styles.eye}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    screen: { flex: 1, backgroundColor: color.canvas },
    scroll: {
      alignItems: "center",
      paddingHorizontal: space.step24,
      paddingTop: space.step16,
      paddingBottom: space.step32,
    },
    content: { width: "100%", maxWidth: 460, gap: space.step24 },
    brand: { color: color.action },
    art: (windowWidth: number) => {
      const width = Math.min(windowWidth - 2 * space.step24, 460);
      return {
        width,
        height: Math.round(width / 2.34),
        borderRadius: radius.card,
        backgroundColor: color.actionWash,
      };
    },
    intro: { gap: space.step4 },
    form: { gap: space.step12 },
    footer: {
      borderTopWidth: border.control,
      borderTopColor: color.boundary,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: space.step12,
      paddingTop: space.step4,
    },
    eyeButton: {
      minHeight: touchTarget,
      minWidth: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.control,
    },
    eye: { width: 21, height: 21, tintColor: color.secondaryText },
    pressed: { backgroundColor: color.actionWash },
    focused: { ...focusOutline(color.information) },
  }),
);
