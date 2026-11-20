import { useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ensureActive } from "../api";
import { journeyResult } from "../journey-api";
import { useMobileSession } from "../mobile-session";
import type { VerifiedMobileScope } from "../session";
import { profileKey } from "../workspace-keys";
import { useNativeProfile } from "../workspace-queries";
import { Action, AppText, Field, Panel, StatusNotice } from "./ui";

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
  const saving = useRef(false);
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const editable = !busy && !disabled && !isRevalidating;
  const name = profile.data?.displayName;
  const initials = name
    ?.trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toLocaleUpperCase())
    .join("");

  function edit() {
    if (name === undefined) return;
    setSaved(false);
    setError(undefined);
    setDraft(name);
    onEditingChange?.(true);
  }

  function endEdit() {
    Keyboard.dismiss();
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
      endEdit();
      setSaved(true);
    } catch {
      if (scope.signal.aborted) return;
      const checked = await profile.refetch();
      if (scope.signal.aborted) return;
      if (!checked.isError && checked.data?.displayName === displayName) {
        endEdit();
        setSaved(true);
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
            editable={editable}
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
              disabled={!editable}
              onPress={() => void save()}
            />
            <Action label="Cancel" disabled={!editable} onPress={endEdit} />
          </View>
        </>
      ) : account && name !== undefined ? (
        <View
          style={[
            styles.accountName,
            !account.stacked && styles.accountNameRow,
          ]}
        >
          <View
            style={[styles.identity, !account.stacked && styles.identityInline]}
          >
            {!!initials && (
              <View
                style={styles.avatar}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <AppText
                  text={initials}
                  variant="label"
                  allowFontScaling={false}
                  style={styles.avatarText}
                />
              </View>
            )}
            <View style={styles.nameCopy}>
              <AppText text="Display name" variant="caption" subdued />
              <AppText text={name || "Enter a display name"} variant="label" />
            </View>
          </View>
          <Action label="Edit name" disabled={!editable} onPress={edit} />
        </View>
      ) : (
        <>
          <AppText text="Display name" variant="caption" subdued />
          {profile.data ? (
            <>
              <AppText
                text={profile.data.displayName || "Enter a display name"}
                variant="label"
              />
              <Action label="Edit name" disabled={!editable} onPress={edit} />
            </>
          ) : (
            <>
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
        </>
      )}
      {saved && draft === undefined && (
        <StatusNotice
          notice={{ text: "Display name saved.", tone: "success" }}
        />
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
  avatar: {
    width: space.step40,
    height: space.step40,
    borderRadius: space.step24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.actionWash,
  },
  avatarText: { color: color.action },
  nameCopy: { flex: 1, minWidth: 0 },
  email: {
    paddingTop: space.step12,
    gap: space.step4,
    borderTopWidth: border.control,
    borderTopColor: color.boundary,
  },
  verified: { color: color.success },
}));
