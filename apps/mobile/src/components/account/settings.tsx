import { useRouter } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { VerifiedMobileScope } from "../../session";
import type { SignOutStatus } from "../account-access";
import { AppearancePicker } from "../fold/appearance";
import { Disclosure, Heading } from "../fold/controls";
import { Action, AppText, Panel, StatusNotice } from "../fold/primitives";
import { FoldScreen } from "../fold/screen";
import { InviteDiscoverySetting } from "../invite-discovery-setting";
import { ProfileName } from "../profile-name";
import { Devices } from "./devices";

export function AccountSettings({
  scope,
  email,
  active,
  setupUnavailable,
  retrySetup,
  checkingSetup,
  resumeSetup,
  signOut,
  signOutStatus,
}: {
  scope: VerifiedMobileScope;
  email?: string;
  active: boolean;
  setupUnavailable: boolean;
  retrySetup: () => void;
  checkingSetup: boolean;
  resumeSetup?: () => void;
  signOut: () => void;
  signOutStatus?: SignOutStatus;
}) {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 800 && fontScale <= 1.3;
  const stacked = width < 365 || fontScale > 1.4;

  return (
    <FoldScreen safeBottom density={wide ? "standard" : "compact"}>
      {email && (
        <View
          accessibilityElementsHidden={!active}
          importantForAccessibility={active ? "auto" : "no-hide-descendants"}
          style={[styles.content, !active && styles.hidden]}
        >
          {setupUnavailable && (
            <Panel>
              <StatusNotice
                notice={{ text: "Couldn’t check your setup.", tone: "error" }}
              />
              <Action
                label="Try again"
                disabled={checkingSetup}
                onPress={retrySetup}
              />
            </Panel>
          )}
          {resumeSetup && (
            <Action
              label="Resume setup"
              variant="primary"
              onPress={resumeSetup}
            />
          )}
          <View style={[styles.group, wide && styles.columns]}>
            <View style={[styles.group, wide && styles.column]}>
              <ProfileName scope={scope} account={{ email, stacked }} />
              <Panel>
                <Heading text="Preferences" />
                <InviteDiscoverySetting scope={scope} />
                <View style={styles.appearance}>
                  <AppearancePicker />
                  <AppText
                    text="Outdoor increases contrast in bright light."
                    variant="caption"
                    subdued
                  />
                </View>
                <Disclosure
                  label="Design system"
                  onPress={() => router.push("/design-system")}
                />
              </Panel>
            </View>
            <View style={wide && styles.column}>
              <Devices
                scope={scope}
                active={active}
                stacked={stacked}
                signOut={signOut}
                signOutStatus={signOutStatus}
              />
            </View>
          </View>
        </View>
      )}
      {!active && (
        <StatusNotice
          notice={{ text: "Checking your session", tone: "info" }}
        />
      )}
    </FoldScreen>
  );
}

const styles = StyleSheet.create(({ semantic: { border, color, space } }) => ({
  content: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 1040,
    gap: space.step16,
  },
  group: { gap: space.step16 },
  columns: { flexDirection: "row", alignItems: "flex-start" },
  column: { flex: 1, minWidth: 0 },
  appearance: {
    borderTopWidth: border.control,
    borderTopColor: color.divider,
    gap: space.step4,
  },
  hidden: { display: "none" },
}));
