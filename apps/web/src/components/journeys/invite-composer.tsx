import {
  invitationEmail,
  type invitationRecipient,
  journeyInvitationBatchResult,
  journeyInviteeMatches,
} from "@kairn/contracts/journeys";
import { invitationBatchNotice } from "@kairn/shared/journey-invitations";
import { cn } from "cn";
import { Mail, Search, UserRoundPlus, X } from "lucide-react";
import {
  type SubmitEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useMediaQuery } from "../../hooks/use-media-query";
import { JourneyRequestError, journeyResult } from "../../lib/journey-api";
import type { AccountScope } from "../../lib/session";
import { useSessionAccess } from "../../lib/session-access";
import { ProfileAvatar } from "../profile-avatar";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Field, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";

type Recipient = ReturnType<typeof invitationRecipient.parse>;
type Match = ReturnType<typeof journeyInviteeMatches.parse>["items"][number];
type Outcome = ReturnType<
  typeof journeyInvitationBatchResult.parse
>["items"][number]["status"];
type Draft = {
  id: string;
  label: string;
  recipient: Recipient;
  status?: Outcome;
};
const statusLabels: Record<Outcome, string> = {
  queued: "Invitation queued",
  already_pending: "Already invited",
  already_member: "Already a journey member",
  invalid_email:
    "This recipient is unavailable. Remove this row and try again.",
  duplicate: "Already included in this batch",
  rate_limited: "Send limit reached. Try again later.",
  cancelled: "Invitation cancelled",
};

export function InviteComposer({
  journeyId,
  title,
  scope,
  suspended,
  open,
  afterCreation,
  onUncertain,
  onClose,
  onBusy,
  onSent,
}: {
  journeyId: string;
  title: string;
  scope: AccountScope;
  suspended: boolean;
  open: boolean;
  afterCreation?: boolean;
  onUncertain?: (uncertain: boolean) => void;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onSent: () => void;
}) {
  const [mode, setMode] = useState<"search" | "email">("search");
  const [value, setValue] = useState("");
  const [matches, setMatches] = useState<Match[]>();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [inputError, setInputError] = useState("");
  const [sendError, setSendError] = useState("");
  const [summary, setSummary] = useState<ReturnType<
    typeof invitationBatchNotice
  > | null>(null);
  const request = useRef<AbortController>(null);
  const pending = useRef<{ key: string; drafts: Draft[] }>(null);
  const sendingLock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const field = useId();
  const wide = useMediaQuery("(min-width: 768px)");
  const { refresh } = useSessionAccess();

  useEffect(() => {
    if (open && !afterCreation) input.current?.focus();
  }, [open, afterCreation]);

  useLayoutEffect(() => {
    if (!open || suspended) setSearching(false);
    return () => request.current?.abort();
  }, [open, suspended]);

  function change(next: string) {
    request.current?.abort();
    setSearching(false);
    setMatches(undefined);
    setValue(next);
    setInputError("");
  }

  function selectMode(next: typeof mode) {
    if (next !== mode) {
      setMode(next);
      change("");
    }
    input.current?.focus();
  }

  function add(recipient: Recipient, label: string) {
    if (drafts.length >= 10) {
      setInputError("You can invite up to 10 people in a batch.");
      return;
    }
    if (
      drafts.some((draft) =>
        "email" in recipient && "email" in draft.recipient
          ? draft.recipient.email === recipient.email
          : "selection" in recipient &&
            "selection" in draft.recipient &&
            draft.recipient.selection === recipient.selection,
      )
    ) {
      setInputError("That recipient is already on the list.");
      return;
    }
    setDrafts((previous) => [
      ...previous,
      { id: crypto.randomUUID(), recipient, label },
    ]);
    change("");
    input.current?.focus();
  }

  function removeDraft(id: string, trigger: HTMLButtonElement) {
    const buttons = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>("button:enabled") ?? [],
    );
    const index = buttons.indexOf(trigger);
    (buttons[index + 1] ?? buttons[index - 1] ?? input.current)?.focus();
    setDrafts((previous) => previous.filter((row) => row.id !== id));
  }

  async function choose(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = value.trim();
    if (mode === "email") {
      const validated = invitationEmail.safeParse(query.toLowerCase());
      if (!validated.success) {
        setInputError("Enter a valid email address.");
        input.current?.focus();
        return;
      }
      add({ email: validated.data }, validated.data);
      return;
    }
    if (query.length < 3) {
      setInputError("Enter at least 3 characters or an exact email address.");
      input.current?.focus();
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setMatches(undefined);
    setSearching(true);
    setInputError("");
    try {
      const result = await scope.api.POST(
        "/api/v1/journeys/{journeyId}/invitees/search",
        {
          params: { path: { journeyId } },
          body: { query },
          signal: controller.signal,
        },
      );
      controller.signal.throwIfAborted();
      setMatches(
        journeyInviteeMatches.parse(journeyResult(result, scope, refresh))
          .items,
      );
    } catch (error) {
      if (!controller.signal.aborted && !scope.signal.aborted)
        setInputError(
          error instanceof JourneyRequestError && error.status === 429
            ? "Too many searches. Try again in a minute."
            : "Couldn’t search for people. Try again.",
        );
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  const unsent = drafts.filter(
    ({ status }) =>
      status === undefined ||
      status === "rate_limited" ||
      status === "invalid_email",
  );
  const hasSuccess = drafts.some(
    ({ status }) => status === "queued" || status === "already_pending",
  );

  async function send() {
    if (sendingLock.current || suspended) return;
    const batch = pending.current ?? {
      key: crypto.randomUUID(),
      drafts: unsent,
    };
    if (batch.drafts.length === 0) return;
    sendingLock.current = true;
    request.current?.abort();
    setSearching(false);
    setSending(true);
    onBusy(true);
    setSendError("");
    try {
      pending.current = batch;
      const response = await scope.api.POST(
        "/api/v1/journeys/{journeyId}/invitations",
        {
          params: {
            path: { journeyId },
            header: { "idempotency-key": batch.key },
          },
          body: { recipients: batch.drafts.map(({ recipient }) => recipient) },
        },
      );
      const { items } = journeyInvitationBatchResult.parse(
        journeyResult(response, scope, refresh),
      );
      if (items.length !== batch.drafts.length)
        throw new Error("Incomplete invitation result.");
      const results = new Map(
        batch.drafts.map((draft, index) => [draft.id, items[index].status]),
      );
      setDrafts((previous) =>
        previous.map((draft) =>
          results.has(draft.id)
            ? { ...draft, status: results.get(draft.id) }
            : draft,
        ),
      );
      setSummary(invitationBatchNotice(items));
      pending.current = null;
      setUncertain(false);
      onUncertain?.(false);
      onSent();
      if (
        items.some(
          (item) =>
            item.status === "invalid_email" || item.status === "rate_limited",
        )
      ) {
        requestAnimationFrame(() =>
          list.current
            ?.querySelector<HTMLButtonElement>("[data-needs-attention] button")
            ?.focus(),
        );
      }
    } catch (error) {
      if (scope.signal.aborted) return;
      const knownLimit =
        error instanceof JourneyRequestError && error.status === 429;
      if (knownLimit) pending.current = null;
      setUncertain(!knownLimit);
      onUncertain?.(!knownLimit);
      setSendError(
        knownLimit
          ? "Send limit reached. Try again later."
          : "Couldn’t confirm this batch. Retry to check the same invitations.",
      );
    } finally {
      sendingLock.current = false;
      setSending(false);
      onBusy(false);
    }
  }

  function dismiss() {
    if (sending) return;
    if (!uncertain) {
      change("");
      setDrafts([]);
      setSummary(null);
      setSendError("");
      setMode("search");
    }
    onClose();
  }

  if (!open) return null;
  const frozen = sending || uncertain;
  const ambiguous = matches?.some((match) => match.ambiguous);
  const found = matches?.length ?? 0;
  const finder = (
    <div
      className={
        afterCreation
          ? "grid min-w-0 content-start gap-4"
          : "grid min-w-0 gap-4"
      }
    >
      <fieldset
        className={
          afterCreation
            ? "grid min-w-0 gap-1 rounded-control border border-border bg-muted p-1 @min-[19rem]/recipient-finder:grid-cols-2"
            : "flex flex-wrap gap-2"
        }
      >
        <legend className="sr-only">Invitation method</legend>
        <Button
          variant={
            afterCreation ? "ghost" : mode === "search" ? "default" : "outline"
          }
          aria-pressed={mode === "search"}
          className={
            afterCreation
              ? "min-h-touch min-w-0 transition-none aria-pressed:border-input aria-pressed:bg-card"
              : "transition-none"
          }
          disabled={frozen}
          onClick={() => selectMode("search")}
        >
          {afterCreation && <Search aria-hidden="true" />}
          Find on Kairn
        </Button>
        <Button
          variant={
            afterCreation ? "ghost" : mode === "email" ? "default" : "outline"
          }
          aria-pressed={mode === "email"}
          className={
            afterCreation
              ? "min-h-touch min-w-0 transition-none aria-pressed:border-input aria-pressed:bg-card"
              : "transition-none"
          }
          disabled={frozen}
          onClick={() => selectMode("email")}
        >
          {afterCreation && <Mail aria-hidden="true" />}
          Invite by email
        </Button>
      </fieldset>
      <form onSubmit={(event) => void choose(event)} noValidate>
        <FieldGroup>
          <Field data-invalid={Boolean(inputError)}>
            <FieldLabel htmlFor={field}>
              {mode === "search" ? "Name or exact email" : "Email address"}
            </FieldLabel>
            <div className="flex min-w-0 flex-wrap items-start gap-2">
              <Input
                className="min-w-0 flex-1 basis-36"
                id={field}
                ref={input}
                value={value}
                maxLength={254}
                type={mode === "email" ? "email" : "search"}
                autoComplete="off"
                aria-invalid={Boolean(inputError)}
                aria-describedby={inputError ? `${field}-error` : undefined}
                disabled={frozen}
                placeholder={
                  afterCreation
                    ? mode === "search"
                      ? "e.g. Mira Rao"
                      : "e.g. mira@example.com"
                    : undefined
                }
                onChange={(event) => change(event.currentTarget.value)}
              />
              <Button
                type="submit"
                variant="outline"
                className={afterCreation ? "min-h-touch" : undefined}
                disabled={frozen || searching}
                focusableWhenDisabled={searching}
              >
                {mode === "search" ? (
                  <Search aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <UserRoundPlus aria-hidden="true" data-icon="inline-start" />
                )}
                {mode === "search"
                  ? searching
                    ? "Searching…"
                    : "Search"
                  : "Add email"}
              </Button>
            </div>
            {inputError && (
              <p
                id={`${field}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {inputError}
              </p>
            )}
          </Field>
        </FieldGroup>
      </form>
      <p role="status" className="sr-only">
        {matches &&
          (found
            ? `${found} ${found === 1 ? "match" : "matches"} found.${
                ambiguous
                  ? " Search with the person’s exact email to distinguish people with the same name."
                  : ""
              }`
            : "No matches. You can invite them by email.")}
      </p>
      {matches &&
        (matches.length ? (
          <ul
            aria-label="Search results"
            className="grid divide-y divide-border"
          >
            {matches.map((match) => (
              <li
                key={match.selection}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 font-semibold wrap-anywhere">
                  {afterCreation && <ProfileAvatar name={match.displayName} />}
                  {match.displayName}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className={afterCreation ? "min-h-touch" : undefined}
                  aria-label={`Add ${match.displayName}`}
                  disabled={frozen || match.ambiguous}
                  onClick={() =>
                    add({ selection: match.selection }, match.displayName)
                  }
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        ) : afterCreation ? (
          <div className="grid justify-items-start gap-2 rounded-control border border-dashed border-border p-3">
            <div className="grid gap-1">
              <p className="font-semibold">No matches</p>
              <p className="text-sm text-muted-foreground">
                Only people who enable invitation search in Account appear here.
              </p>
            </div>
            <Button
              variant="link"
              size="sm"
              className="-ms-3 min-h-touch text-start"
              disabled={frozen}
              onClick={() => selectMode("email")}
            >
              Use email instead
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No matches. Only people who enable invitation search in Account
            appear here. You can invite them by email.
          </p>
        ))}
      {ambiguous && (
        <p className="text-sm text-muted-foreground">
          Several people have the same name. Search with the person’s exact
          email.
        </p>
      )}
    </div>
  );
  const recipientList =
    drafts.length > 0 ? (
      <ul
        aria-label="Recipients"
        ref={list}
        className={cn(
          "grid",
          afterCreation ? "gap-2" : "divide-y divide-border",
        )}
      >
        {drafts.map(({ id, label, recipient, status }) => (
          <li
            key={id}
            data-needs-attention={
              status === "invalid_email" || status === "rate_limited"
                ? ""
                : undefined
            }
            className={cn(
              "min-w-0",
              afterCreation
                ? "flex flex-wrap items-center gap-2 rounded-control bg-card px-2 py-1.5"
                : "flex flex-wrap items-center justify-between gap-2 py-2",
            )}
          >
            {afterCreation && (
              <div className="shrink-0" aria-hidden="true">
                {"email" in recipient ? (
                  <span className="grid size-8 place-items-center rounded-full bg-muted text-primary">
                    <Mail className="size-4" />
                  </span>
                ) : (
                  <ProfileAvatar name={label} />
                )}
              </div>
            )}
            <div className={cn("min-w-0", afterCreation && "flex-1 basis-24")}>
              <p className="font-semibold wrap-anywhere">{label}</p>
              {status && (
                <p className="text-sm text-muted-foreground">
                  {statusLabels[status]}
                </p>
              )}
            </div>
            {status !== "queued" && status !== "already_pending" && (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className={
                  afterCreation ? "ms-auto min-h-touch min-w-touch" : undefined
                }
                aria-label={`Remove ${label} from draft`}
                disabled={frozen}
                onClick={(event) => removeDraft(id, event.currentTarget)}
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    ) : null;
  const feedback = (
    <>
      <p
        role="status"
        className={cn(
          "text-sm",
          !summary
            ? "sr-only"
            : summary.tone === "error"
              ? "text-destructive"
              : "text-muted-foreground",
        )}
      >
        {summary?.text}
      </p>
      {sendError && (
        <Alert variant="destructive">
          <AlertDescription>{sendError}</AlertDescription>
        </Alert>
      )}
    </>
  );
  const finished =
    afterCreation &&
    hasSuccess &&
    unsent.length === 0 &&
    !uncertain &&
    !sending;
  const sendAction = (
    <Button
      size={afterCreation ? "lg" : "default"}
      feedback={sending ? "pending" : "idle"}
      disabled={!finished && (sending || (!uncertain && unsent.length === 0))}
      focusableWhenDisabled={sending}
      onClick={finished ? dismiss : () => void send()}
    >
      {finished
        ? "Done"
        : sending
          ? "Sending…"
          : uncertain
            ? "Retry batch"
            : "Send invitations"}
    </Button>
  );
  const dismissAction = (
    <Button
      variant="outline"
      size={afterCreation ? "lg" : "default"}
      disabled={sending}
      onClick={dismiss}
    >
      {afterCreation && uncertain
        ? "Open journey"
        : hasSuccess
          ? "Done"
          : afterCreation
            ? "Skip for now"
            : "Close"}
    </Button>
  );

  if (afterCreation)
    return (
      <fieldset disabled={suspended} className="min-w-0">
        <legend className="sr-only">Journey invitations</legend>
        <div className="journey-flow-grid">
          <section
            aria-label="Add recipients"
            className="@container/recipient-finder grid min-w-0 content-start gap-4 rounded-card control-border bg-card p-3 sm:p-5"
          >
            <h2 className="text-xl font-bold">Add recipients</h2>
            {finder}
          </section>
          <section
            aria-label="Recipient list"
            className="grid min-w-0 content-start gap-3 rounded-card control-border bg-accent p-3 sm:p-5"
          >
            <p className="wrap-anywhere border-b border-border pb-3 text-lg font-bold">
              {title}
            </p>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Recipients</h2>
              <span
                role="status"
                className="rounded-full bg-card px-2 text-sm tabular-nums text-foreground"
              >
                {drafts.length}
                <span className="sr-only">
                  {drafts.length === 1 ? " recipient" : " recipients"}
                </span>
              </span>
            </div>
            {recipientList ?? (
              <p className="text-sm text-muted-foreground">No recipients yet</p>
            )}
            <p className="border-t border-border pt-3 text-sm text-muted-foreground">
              People can view the journey and its schedule after joining as
              Participants.
            </p>
          </section>
          <div className="journey-flow-actions grid gap-3 border-t border-border pt-4">
            {feedback}
            <div className="grid items-center justify-end gap-2 @min-[29rem]/journey-flow:flex @min-[29rem]/journey-flow:flex-wrap @max-[29rem]/journey-flow:justify-normal">
              {!finished && dismissAction}
              {sendAction}
            </div>
          </div>
        </div>
      </fieldset>
    );

  const fields = (
    <fieldset disabled={suspended} className="grid min-w-0 gap-4">
      {finder}
      {recipientList}
      {feedback}
      <div className="flex flex-wrap gap-2">
        {sendAction}
        {dismissAction}
      </div>
    </fieldset>
  );
  const description = `Invite people to ${title} as Participants. They can see the journey and its schedule after joining.`;
  if (wide)
    return (
      <section
        aria-label="Invite people"
        className="grid min-w-0 gap-4 rounded-card control-border bg-card p-3 sm:p-inset"
      >
        <div className="grid gap-1">
          <h2 className="text-xl font-semibold">Invite people</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>
        {fields}
      </section>
    );
  return (
    <Sheet
      open={!suspended}
      onOpenChange={(open) => {
        if (!open && !sending) dismiss();
      }}
    >
      <SheetContent
        showCloseButton={false}
        finalFocus={false}
        className="data-[side=right]:w-full overflow-auto p-4"
      >
        <SheetHeader className="p-0">
          <SheetTitle>Invite people</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {fields}
      </SheetContent>
    </Sheet>
  );
}
