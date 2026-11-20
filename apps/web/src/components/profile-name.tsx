import { useQuery } from "@tanstack/react-query";
import { type SubmitEvent, useEffect, useId, useRef, useState } from "react";
import { journeyResult } from "../lib/journey-api";
import type { AccountScope } from "../lib/session";
import { useSessionAccess } from "../lib/session-access";
import { Button } from "./ui/button";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function ProfileName({
  accountId,
  scope,
  disabled,
  onEditingChange,
}: {
  accountId: string;
  scope: AccountScope;
  disabled?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const { refresh } = useSessionAccess();
  const queryKey = [accountId, "profile"];
  const headers = { "x-expected-account": accountId };
  const profile = useQuery({
    queryKey,
    async queryFn({ signal }) {
      return journeyResult(
        await scope.api.GET("/api/v1/profile", {
          params: { header: headers },
          signal,
        }),
        scope,
        refresh,
      );
    },
  });
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const saving = useRef(false);
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const editing = draft !== undefined;

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
      scope.queryClient.setQueryData(queryKey, savedProfile);
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

  return (
    <section
      aria-label="Profile"
      className="grid min-w-0 gap-3 rounded-card control-border bg-card p-4"
    >
      {editing ? (
        <form
          className="grid min-w-0 gap-3"
          onSubmit={(event) => void save(event)}
        >
          <Field>
            <FieldLabel htmlFor={id}>Display name</FieldLabel>
            <Input
              id={id}
              ref={input}
              autoComplete="nickname"
              maxLength={120}
              required
              disabled={busy}
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
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save name"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={closeEditor}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          {profile.data ? (
            <Button
              ref={editButton}
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setSaved(false);
                setError("");
                setDraft(profile.data.displayName);
                onEditingChange?.(true);
              }}
            >
              Edit name
            </Button>
          ) : (
            profile.isError && (
              <Button
                type="button"
                variant="outline"
                disabled={profile.isFetching || disabled}
                onClick={() => void profile.refetch()}
              >
                Retry
              </Button>
            )
          )}
        </div>
      )}
      {saved && (
        <p className="text-success" role="status">
          Display name saved.
        </p>
      )}
    </section>
  );
}
