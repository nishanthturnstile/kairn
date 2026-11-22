import { type SubmitEvent, useEffect, useId, useRef, useState } from "react";
import { journeyResult } from "../lib/journey-api";
import { profileQueryKey, useProfile } from "../lib/profile";
import type { AccountScope } from "../lib/session";
import { useSessionAccess } from "../lib/session-access";
import { ProfileAvatar } from "./profile-avatar";
import { Button } from "./ui/button";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function ProfileName({
  accountId,
  scope,
  disabled,
  onEditingChange,
  embedded = false,
  fallbackName,
}: {
  accountId: string;
  scope: AccountScope;
  disabled?: boolean;
  embedded?: boolean;
  fallbackName?: string;
  onEditingChange?: (editing: boolean) => void;
}) {
  const { refresh } = useSessionAccess();
  const queryKey = profileQueryKey(accountId);
  const headers = { "x-expected-account": accountId };
  const profile = useProfile(scope, accountId);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const saving = useRef(false);
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const editing = draft !== undefined;
  const needsRetry = !profile.data && (profile.isError || retrying);

  useEffect(() => {
    if (editing) input.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  function closeEditor() {
    restoreFocus.current = true;
    setDraft(undefined);
    onEditingChange?.(false);
  }

  async function retry() {
    setRetrying(true);
    try {
      await profile.refetch();
    } finally {
      if (!scope.signal.aborted) setRetrying(false);
    }
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || draft === undefined) return;
    const displayName = draft.trim();
    if (!displayName) {
      setError("Enter a display name.");
      input.current?.focus();
      return;
    }
    if (displayName === profile.data?.displayName) {
      closeEditor();
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const savedProfile = journeyResult(
        await scope.api.PATCH("/api/v1/profile", {
          params: { header: headers },
          body: { displayName },
        }),
        scope,
        refresh,
      );
      await scope.queryClient.cancelQueries({ queryKey });
      scope.signal.throwIfAborted();
      scope.queryClient.setQueryData<typeof savedProfile>(
        queryKey,
        (previous) =>
          previous
            ? { ...previous, displayName: savedProfile.displayName }
            : savedProfile,
      );
      closeEditor();
      setSaved(true);
    } catch {
      if (!scope.signal.aborted)
        setError("Couldn’t save your name. Try again.");
    } finally {
      saving.current = false;
      if (!scope.signal.aborted) setBusy(false);
    }
  }

  const Container = embedded ? "div" : "section";
  return (
    <Container
      aria-label={embedded ? undefined : "Profile"}
      className={
        embedded
          ? "@container/profile-name grid min-w-0 gap-3"
          : "grid min-w-0 gap-3 rounded-card control-border bg-card p-4"
      }
    >
      {editing ? (
        <form
          className="grid min-w-0 gap-3"
          onSubmit={(event) => void save(event)}
        >
          <Field data-invalid={Boolean(error) || undefined}>
            <FieldLabel htmlFor={id}>Display name</FieldLabel>
            <Input
              id={id}
              ref={input}
              autoComplete="nickname"
              maxLength={120}
              required
              readOnly={busy}
              value={draft}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => {
                setDraft(event.currentTarget.value);
                setError("");
              }}
            />
          </Field>
          {error && (
            <p id={`${id}-error`} className="text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={busy}
              focusableWhenDisabled
              feedback={busy ? "pending" : "idle"}
            >
              {busy ? "Saving…" : "Save name"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              focusableWhenDisabled
              onClick={closeEditor}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            {embedded && (
              <span className="hidden @min-[12rem]/profile-name:block">
                <ProfileAvatar
                  name={profile.data?.displayName || fallbackName}
                  size="lg"
                />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground">
                Display name
              </p>
              {profile.data ? (
                <p className="font-semibold wrap-anywhere">
                  {profile.data.displayName || "Enter a display name"}
                </p>
              ) : (
                <p className="text-muted-foreground" role="status">
                  {profile.isError
                    ? "Couldn’t load your name."
                    : "Loading your name…"}
                </p>
              )}
            </div>
          </div>
          {(profile.data || needsRetry) && (
            <Button
              ref={editButton}
              type="button"
              variant="outline"
              disabled={
                disabled || retrying || (needsRetry && profile.isFetching)
              }
              focusableWhenDisabled
              onClick={() => {
                if (!profile.data) {
                  void retry();
                  return;
                }
                setSaved(false);
                setError("");
                setDraft(profile.data.displayName);
                onEditingChange?.(true);
              }}
            >
              {needsRetry
                ? retrying || profile.isFetching
                  ? "Retrying…"
                  : "Retry"
                : "Edit name"}
            </Button>
          )}
        </div>
      )}
      {saved && (
        <p className="text-success" role="status">
          Display name saved.
        </p>
      )}
    </Container>
  );
}
