import type {
  IdentityDevices,
  RestrictionConfirmation,
} from "@kairn/contracts";
import { useQuery } from "@tanstack/react-query";
import { parseJSON } from "better-auth/client";
import { type ComponentRef, type ReactNode, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  type Pressable,
  type Text,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ensureActive } from "../../api";
import { mobileAuth } from "../../auth";
import { useMobileSession } from "../../mobile-session";
import type { VerifiedMobileScope } from "../../session";
import { devicesKey } from "../../workspace-keys";
import type { SignOutStatus } from "../account-access";
import { FoldSheet } from "../fold/controls";
import {
  Action,
  AppText,
  type Notice,
  Panel,
  StatusNotice,
} from "../fold/primitives";

type Device = IdentityDevices["devices"][number];
type DeviceError = { code?: string };
type FocusTarget = ComponentRef<typeof Pressable> | ComponentRef<typeof Text>;
const sessionDate = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "medium",
});
function started(device: Device) {
  return sessionDate.format(new Date(device.createdAt));
}

function DeviceRow({
  device,
  current,
  stacked,
  children,
}: {
  device?: Device;
  current?: boolean;
  stacked: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={[styles.row, current && styles.current, stacked && styles.stacked]}
    >
      <View style={[styles.copy, !stacked && styles.inlineCopy]}>
        <AppText
          text={current ? "This device" : "Other device"}
          variant="label"
        />
        {device && (
          <AppText
            text={`Signed in ${started(device)}`}
            variant="caption"
            subdued
          />
        )}
      </View>
      {children}
    </View>
  );
}

function OtherDevice({
  device,
  disabled,
  stacked,
  onSelect,
}: {
  device: Device;
  disabled: boolean;
  stacked: boolean;
  onSelect: (
    device: Device,
    trigger: ComponentRef<typeof Pressable> | null,
  ) => void;
}) {
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  return (
    <DeviceRow device={device} stacked={stacked}>
      <Action
        ref={trigger}
        label="Revoke device"
        accessibilityLabel={`Revoke device, signed in ${started(device)}`}
        disabled={disabled}
        onPress={() => onSelect(device, trigger.current)}
      />
    </DeviceRow>
  );
}

export function Devices({
  scope,
  active,
  stacked,
  signOut,
  signOutStatus,
}: {
  scope: VerifiedMobileScope;
  active: boolean;
  stacked: boolean;
  signOut: () => void;
  signOutStatus?: SignOutStatus;
}) {
  const { canSubmit, refresh } = useMobileSession();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selected, setSelected] = useState<Device>();
  const [busy, setBusy] = useState(false);
  const revoking = useRef(false);
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const returnFocus = useRef<FocusTarget | null>(null);
  const signingOut = signOutStatus === "pending";
  const devices = useQuery({
    queryKey: devicesKey,
    enabled: active,
    async queryFn({ signal }) {
      const result = await mobileAuth?.$fetch<IdentityDevices, DeviceError>(
        "/devices",
        {
          headers: { "X-Expected-Account": scope.accountId },
          signal: AbortSignal.any([signal, scope.signal]),
          // Keep the API's ISO timestamps as strings when reading devices.
          jsonParser: (text) => parseJSON(text, { parseDates: false }),
        },
      );
      ensureActive(scope.signal);
      if (
        result?.error?.status === 401 ||
        result?.error?.code === "account_changed"
      )
        refresh(scope);
      if (result?.error || !result?.data)
        throw new Error("Devices unavailable");
      return result.data;
    },
  });
  const currentId = devices.data?.currentDeviceId;
  const current = devices.data?.devices.find(
    (device) => device.id === currentId,
  );
  const others = devices.data?.devices
    .filter((device) => device.id !== currentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function restoreFocus() {
    const target = returnFocus.current ?? heading.current;
    if (active && target)
      AccessibilityInfo.sendAccessibilityEvent(target, "focus");
  }

  function close() {
    setSelected(undefined);
    if (Platform.OS === "android") requestAnimationFrame(restoreFocus);
  }

  async function reload(checkingConfirmation = false) {
    const result = await devices.refetch();
    const focusHeading = checkingConfirmation
      ? result.isError || result.data?.pendingRestrictions === 0
      : result.isSuccess;
    if (focusHeading) {
      requestAnimationFrame(() => {
        if (!scope.signal.aborted && heading.current)
          AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
      });
    }
  }

  async function revoke(device: Device) {
    if (!mobileAuth || !active || revoking.current || !canSubmit(scope)) return;
    revoking.current = true;
    returnFocus.current = heading.current;
    close();
    setNotice(null);
    setBusy(true);
    try {
      const { data, error } = await mobileAuth.$fetch<
        RestrictionConfirmation,
        DeviceError
      >("/devices/revoke", {
        method: "POST",
        body: { id: device.id },
        headers: { "X-Expected-Account": scope.accountId },
        signal: scope.signal,
      });
      ensureActive(scope.signal);
      if (error || data?.status !== true) {
        if (error?.status === 401 || error?.code === "account_changed") {
          refresh(scope);
          return;
        }
        const gone = error?.status === 404;
        setNotice({
          text: gone
            ? "This device is already signed out."
            : error?.code === "SESSION_NOT_FRESH"
              ? "Sign out and sign in again to revoke this device."
              : "Couldn’t revoke this device. Try again.",
          tone: gone ? "info" : "error",
        });
        if (gone) await devices.refetch();
        return;
      }
      const pending = data.confirmation === "pending";
      await scope.queryClient.cancelQueries({
        queryKey: devicesKey,
        exact: true,
      });
      ensureActive(scope.signal);
      scope.queryClient.setQueryData<IdentityDevices>(
        devicesKey,
        (previous) =>
          previous && {
            ...previous,
            devices: previous.devices.filter((item) => item.id !== device.id),
            pendingRestrictions: pending
              ? Math.max(previous.pendingRestrictions, 1)
              : previous.pendingRestrictions,
          },
      );
      setNotice({
        text: "Device signed out.",
        tone: "success",
      });
      await devices.refetch();
    } catch {
      if (!scope.signal.aborted) {
        setNotice({ text: "Couldn’t reach Kairn. Try again.", tone: "error" });
      }
    } finally {
      revoking.current = false;
      if (!scope.signal.aborted) setBusy(false);
    }
  }

  return (
    <Panel>
      <AppText
        ref={heading}
        text="Signed-in devices"
        accessibilityRole="header"
        variant="section"
      />
      <DeviceRow device={current} current stacked={stacked}>
        <Action
          label={signingOut ? "Signing out…" : "Sign out"}
          disabled={busy || signingOut}
          accessibilityState={{ busy: signingOut }}
          onPress={signOut}
        />
      </DeviceRow>
      {signOutStatus === "error" && (
        <StatusNotice
          notice={{
            text: "Couldn’t sign out on the server. Try again.",
            tone: "error",
          }}
        />
      )}
      {busy && (
        <StatusNotice notice={{ text: "Revoking device", tone: "info" }} />
      )}
      <StatusNotice notice={notice} />
      {!devices.isError && Boolean(devices.data?.pendingRestrictions) && (
        <View style={styles.error}>
          <StatusNotice
            notice={{
              text: "Account changes await recovery confirmation.",
              tone: "warning",
            }}
          />
          <Action
            label="Check confirmation"
            disabled={devices.isFetching || busy || signingOut}
            onPress={() => void reload(true)}
          />
        </View>
      )}
      {devices.isPending && (
        <StatusNotice notice={{ text: "Loading devices", tone: "info" }} />
      )}
      {devices.isError && (
        <View style={styles.error}>
          <StatusNotice
            notice={{ text: "Couldn’t load your devices.", tone: "error" }}
          />
          <Action
            label="Try again"
            disabled={devices.isFetching || busy || signingOut}
            onPress={() => void reload()}
          />
        </View>
      )}
      {others && !devices.isError && (
        <View style={styles.others}>
          <AppText
            text="Other sessions"
            variant="label"
            accessibilityRole="header"
          />
          {others.length ? (
            others.map((device) => (
              <OtherDevice
                key={device.id}
                device={device}
                disabled={busy || signingOut}
                stacked={stacked}
                onSelect={(item, trigger) => {
                  returnFocus.current = trigger;
                  setSelected(item);
                }}
              />
            ))
          ) : (
            <AppText
              text="No other devices are signed in."
              variant="caption"
              subdued
            />
          )}
        </View>
      )}
      <FoldSheet
        title="Revoke device?"
        visible={active && Boolean(selected)}
        onClose={close}
        onDismiss={restoreFocus}
        closeLabel="Cancel"
      >
        {selected && (
          <>
            <AppText
              text={`The device signed in on ${started(selected)} will need to sign in again.`}
              subdued
            />
            <Action
              label="Revoke device"
              variant="danger"
              onPress={() => void revoke(selected)}
            />
          </>
        )}
      </FoldSheet>
    </Panel>
  );
}

const styles = StyleSheet.create(
  ({ semantic: { border, color, radius, space } }) => ({
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: space.step8,
    },
    stacked: { alignItems: "stretch", flexDirection: "column" },
    copy: { gap: space.step4, minWidth: 0 },
    inlineCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 150 },
    current: {
      backgroundColor: color.actionWash,
      borderRadius: radius.control,
      padding: space.step12,
    },
    others: {
      borderTopWidth: border.control,
      borderTopColor: color.divider,
      paddingTop: space.step12,
      gap: space.step12,
    },
    error: { gap: space.step8, alignItems: "flex-start" },
  }),
);
