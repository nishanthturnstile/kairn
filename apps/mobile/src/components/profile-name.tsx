import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Keyboard,
  type Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ensureActive } from "../api";
import { journeyResult } from "../journey-api";
import { useMobileSession } from "../mobile-session";
import type { VerifiedMobileScope } from "../session";
import { profileKey } from "../workspace-keys";
import { useNativeProfile } from "../workspace-queries";
import { Avatar } from "./fold/identity";
import { Action, AppText, Field, Panel, StatusNotice } from "./fold/primitives";
import { useReceipt } from "./fold/receipt";

export function ProfileName({
  scope,
  disabled,
  onEditingChange,
  account,
}: {
  scope: VerifiedMobileScope;
  disabled?: boolean;
  onEditingChange?: (editing: boolean) => void;
  account?: { email: string; stacked: boolean };
}) {
  const { refresh, canSubmit, isRevalidating } = useMobileSession();
  const profile = useNativeProfile(scope);
  const { width, fontScale } = useWindowDimensions();
  const stacked = account?.stacked ?? (width < 365 || fontScale > 1.4);
  const saving = useRef(false);
  const restoreFocus = useRef(false);
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const showReceipt = useReceipt();
  const editButton = useRef<ComponentRef<typeof Pressable>>(null);
  const focusEditButton = useCallback(() => {
    if (editButton.current)
      AccessibilityInfo.sendAccessibilityEvent(editButton.current, "focus");
  }, []);
  useEffect(() => {
    if (draft !== undefined || !restoreFocus.current) return;
    const frame = requestAnimationFrame(() => {
      restoreFocus.current = false;
      focusEditButton();
    });
    return () => cancelAnimationFrame(frame);
  }, [draft, focusEditButton]);

  function confirmSave() {
    endEdit();
    showReceipt({
      message: "Display name saved.",
      returnFocus: focusEditButton,
    });
  }
  const editable = !busy && !disabled && !isRevalidating;
  const name = profile.data?.displayName;
  function edit() {
    if (name === undefined) return;
    setError(undefined);
    setDraft(name);
    onEditingChange?.(true);
  }

  function endEdit() {
    Keyboard.dismiss();
    restoreFocus.current = true;
    setDraft(undefined);
    onEditingChange?.(false);
  }

  async function save() {
    if (draft === undefined || !editable || saving.current || !canSubmit(scope))
      return;
    const displayName = draft.trim();
    if (!displayName) {
      setError("Enter a display name.");
      return;
    }
    if (displayName === profile.data?.displayName) {
      endEdit();
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const updated = journeyResult(
        await scope.api.PATCH("/api/v1/profile", {
          params: { header: { "x-expected-account": scope.accountId } },
          body: { displayName },
        }),
        scope,
        refresh,
      );
      await scope.queryClient.cancelQueries({ queryKey: profileKey });
      ensureActive(scope.signal);
      scope.queryClient.setQueryData(profileKey, updated);
      confirmSave();
    } catch {
      if (scope.signal.aborted) return;
      const checked = await profile.refetch();
      if (scope.signal.aborted) return;
      if (!checked.isError && checked.data?.displayName === displayName) {
        confirmSave();
      } else {
        setError("Couldn’t save your name. Try again.");
      }
    } finally {
      saving.current = false;
      if (!scope.signal.aborted) setBusy(false);
    }
  }

  return (
    <Panel>
      {account && (
        <AppText text="Profile" variant="section" accessibilityRole="header" />
      )}
      {draft !== undefined ? (
        <>
          <Field
            label="Display name"
            autoComplete="nickname"
            autoFocus
            value={draft}
            maxLength={120}
            readOnly={!editable}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            onChangeText={(text) => {
              setDraft(text);
              setError(undefined);
            }}
            error={error}
          />
          <View style={styles.actions}>
            <Action
              label={busy ? "Saving…" : "Save name"}
              variant="primary"
              accessibilityState={{ busy: busy }}
              disabled={!editable}
              onPress={() => void save()}
            />
            <Action label="Cancel" disabled={!editable} onPress={endEdit} />
          </View>
        </>
      ) : name !== undefined ? (
        <View style={[styles.accountName, !stacked && styles.accountNameRow]}>
          <View style={[styles.identity, !stacked && styles.identityInline]}>
            {!!name?.trim() && <Avatar name={name} large />}
            <View style={styles.nameCopy}>
              <AppText text="Display name" variant="caption" subdued />
              <AppText text={name || "Enter a display name"} variant="label" />
            </View>
          </View>
          <Action
            ref={editButton}
            label="Edit name"
            disabled={!editable}
            onPress={edit}
          />
        </View>
      ) : (
        <>
          <AppText text="Display name" variant="caption" subdued />
          <StatusNotice
            notice={
              profile.isError
                ? { text: "Couldn’t load your name.", tone: "error" }
                : { text: "Loading your name", tone: "info" }
            }
          />
          {profile.isError && (
            <Action
              label="Try again"
              disabled={profile.isFetching}
              onPress={() => void profile.refetch()}
            />
          )}
        </>
      )}
      {account && (
        <View style={styles.email}>
          <AppText text="Email" variant="caption" subdued />
          <AppText text={account.email} variant="label" />
          <AppText text="Verified" variant="caption" style={styles.verified} />
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create(({ semantic: { border, color, space } }) => ({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.step8 },
  accountName: { gap: space.step12, paddingVertical: space.step8 },
  accountNameRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.step12,
  },
  identityInline: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 176,
    minWidth: 176,
  },
  nameCopy: { flex: 1, minWidth: 0 },
  email: {
    paddingTop: space.step12,
    gap: space.step4,
    borderTopWidth: border.control,
    borderTopColor: color.boundary,
  },
  verified: { color: color.success },
}));
