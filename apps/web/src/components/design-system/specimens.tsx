import {
  BookmarkIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  CompassIcon,
  InfoIcon,
} from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { JourneyMap } from "@/components/illustrations/journey-map";
import { PasswordField } from "@/components/password-field";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { CairnLogo, CairnMark } from "@/components/ui/cairn-logo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ContentLoading, LaunchFeedback } from "@/components/ui/loading";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { ScheduleInput } from "@/components/ui/schedule-input";
import {
  Checkbox,
  ChoiceLabel,
  Radio,
  Switch,
} from "@/components/ui/selection";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useReceiptToast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Specimen({
  id,
  title,
  source,
  children,
}: {
  id: string;
  title: string;
  source: string;
  children: ReactNode;
}) {
  return (
    <Card role="group" aria-labelledby={id}>
      <CardHeader>
        <h2
          id={id}
          tabIndex={-1}
          className="font-heading text-xl font-bold tracking-tight"
        >
          {title}
        </h2>
        <code className="wrap-anywhere text-sm text-muted-foreground">
          {source}
        </code>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">{children}</CardContent>
    </Card>
  );
}

export function ActionSpecimen() {
  const [preview, setPreview] = useState("Ready");
  const pending = preview === "Saving";
  const done = preview === "Saved";
  function resetSample() {
    setPreview("Ready");
  }
  return (
    <Specimen id="actions" title="Buttons" source="ui/button · ui/tooltip">
      <div className="flex flex-wrap items-center gap-2">
        <FieldLabel htmlFor="button-preview-state">Preview state</FieldLabel>
        <NativeSelect
          id="button-preview-state"
          className="w-auto"
          value={preview}
          onChange={(event) => setPreview(event.target.value)}
        >
          {["Ready", "Saving", "Saved", "Disabled"].map((state) => (
            <option key={state}>{state}</option>
          ))}
        </NativeSelect>
        <Button type="button" variant="ghost" size="sm" onClick={resetSample}>
          Reset sample
        </Button>
      </div>
      <section
        aria-label="Inset key"
        className="grid min-w-0 justify-items-start gap-2 rounded-control bg-muted p-3"
      >
        <h3 className="font-heading font-bold">Inset key</h3>
        <Button
          type="button"
          disabled={pending || done || preview === "Disabled"}
          focusableWhenDisabled={done}
          feedback={pending ? "pending" : done ? "success" : "idle"}
          onClick={() => setPreview("Saved")}
        >
          {pending ? "Saving…" : done ? "Saved" : "Save moment"}
        </Button>
        <p className="text-sm text-muted-foreground" role="status">
          {done
            ? "Sample moment saved."
            : "Primary action. The inset key responds to the press."}
        </p>
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink variant="secondary" render={<a href="#fields" />}>
          Go to fields
        </ButtonLink>
        <ButtonLink variant="link" render={<a href="#overlays" />}>
          Inspect overlays
        </ButtonLink>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                id="action-tooltip"
                aria-label="About action sizes"
              />
            }
          >
            <InfoIcon />
          </TooltipTrigger>
          <TooltipContent>
            Compact face with a larger touch target
          </TooltipContent>
        </Tooltip>
      </div>
      <details>
        <summary className="cursor-pointer font-semibold">
          Sizes and destructive action
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(["xs", "sm", "default", "lg"] as const).map((size) => (
            <ButtonLink
              key={size}
              size={size}
              variant="outline"
              render={<a href="#actions" />}
            >
              {size}
            </ButtonLink>
          ))}
          <Button
            variant="destructive"
            disabled={!done}
            focusableWhenDisabled
            onClick={resetSample}
          >
            Discard saved sample
          </Button>
        </div>
      </details>
    </Specimen>
  );
}

const destinations = [
  {
    name: "Journeys",
    icon: BookOpenIcon,
    content: "Two journeys in your sample workspace.",
  },
  {
    name: "Discover",
    icon: CompassIcon,
    content: "Published journeys from the community.",
  },
  {
    name: "Saved",
    icon: BookmarkIcon,
    content: "Your collection of saved journeys.",
  },
] as const;
export function NavigationSpecimen() {
  const [rail, setRail] = useState(false);
  return (
    <Specimen id="navigation" title="Navigation" source="ui/tabs · ui/sidebar">
      <Tabs
        defaultValue="Journeys"
        orientation={rail ? "vertical" : "horizontal"}
        className="grid justify-items-start gap-2 rounded-control bg-accent p-3"
      >
        <TabsList aria-label="Example destinations">
          {destinations.map(({ name, icon: Icon }) => (
            <TabsTrigger key={name} value={name}>
              <Icon size={16} aria-hidden="true" />
              {name}
            </TabsTrigger>
          ))}
          <TabsTrigger value="Archived" disabled>
            Archived
          </TabsTrigger>
        </TabsList>
        {destinations.map(({ name, content }) => (
          <TabsContent key={name} value={name} className="text-sm">
            {content}
          </TabsContent>
        ))}
      </Tabs>
      <ChoiceLabel>
        <Switch checked={rail} onChange={(e) => setRail(e.target.checked)} />
        Vertical rail
      </ChoiceLabel>
      <p className="text-sm text-muted-foreground">
        The catalog index uses the workspace sidebar and its mobile sheet.
      </p>
    </Specimen>
  );
}

export function FieldsSpecimen() {
  const id = useId();
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [applied, setApplied] = useState("");
  return (
    <Specimen
      id="fields"
      title="Text fields"
      source="ui/field · ui/input · ui/textarea · ui/native-select · ui/schedule-input"
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setInvalid(!name.trim());
          setApplied(name.trim());
          if (!name.trim()) document.getElementById(id)?.focus();
        }}
      >
        <FieldGroup>
          <Field data-invalid={invalid || undefined}>
            <FieldLabel htmlFor={id}>Journey name (required)</FieldLabel>
            <Input
              id={id}
              value={name}
              placeholder="Nilgiri weekend"
              required
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${id}-error` : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setInvalid(false);
                setApplied("");
              }}
            />
            {invalid && (
              <p
                role="alert"
                id={`${id}-error`}
                className="text-sm text-destructive"
              >
                Enter a journey name.
              </p>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="sample-note">Note</FieldLabel>
            <Textarea
              id="sample-note"
              rows={2}
              placeholder="A detail to remember…"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sample-visibility">Visibility</FieldLabel>
            <NativeSelect id="sample-visibility">
              <option>Only me</option>
              <option>Journey review</option>
            </NativeSelect>
          </Field>
          <Button className="justify-self-start" type="submit">
            Apply name
          </Button>
        </FieldGroup>
        <output className="mt-1 block text-sm text-success">
          {applied && `Sample name applied: ${applied}`}
        </output>
      </form>
      <details>
        <summary
          id="field-availability"
          className="min-h-control cursor-pointer font-semibold"
        >
          Read-only and disabled fields
        </summary>
        <FieldGroup className="mt-2">
          <Field>
            <FieldLabel htmlFor={`${id}-reference`}>
              Original journey reference (read only)
            </FieldLabel>
            <Input id={`${id}-reference`} readOnly value="Nilgiri weekend" />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-archive`}>
              Notes from a previous version of this journey (unavailable)
            </FieldLabel>
            <Textarea id={`${id}-archive`} disabled value="No archived notes" />
          </Field>
        </FieldGroup>
      </details>
      <FieldGroup className="border-t pt-3">
        <PasswordField id={`${id}-password`} isNew label="Sample password" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(14rem,100%),1fr))] gap-2">
          <ScheduleInput
            id={`${id}-date`}
            label="Start date"
            kind="date"
            value={date}
            onValueChange={setDate}
          />
          <ScheduleInput
            id={`${id}-time`}
            label="Start time"
            kind="time"
            value={time}
            onValueChange={setTime}
          />
        </div>
      </FieldGroup>
    </Specimen>
  );
}
export function SelectionSpecimen() {
  return (
    <Specimen id="selection" title="Selection" source="ui/selection">
      <fieldset>
        <legend
          id="choice-availability"
          tabIndex={-1}
          className="text-sm font-semibold"
        >
          Journal details
        </legend>
        <ChoiceLabel>
          <Checkbox defaultChecked />
          Include captions
        </ChoiceLabel>
        <ChoiceLabel>
          <Checkbox />
          Include author credits
        </ChoiceLabel>
        <ChoiceLabel>
          <Checkbox disabled />
          Include private originals
        </ChoiceLabel>
      </fieldset>
      <fieldset className="border-t pt-2">
        <legend className="text-sm font-semibold">Source access</legend>
        {["Only me", "Journey review"].map((value, i) => (
          <ChoiceLabel key={value}>
            <Radio name="sample-access" defaultChecked={i === 0} />
            {value}
          </ChoiceLabel>
        ))}
        <ChoiceLabel>
          <Radio name="sample-access" disabled />
          Public sharing unavailable
        </ChoiceLabel>
      </fieldset>
      <ChoiceLabel>
        <Switch defaultChecked />
        Keep a local copy
      </ChoiceLabel>
      <ChoiceLabel>
        <Switch disabled />
        Automatic upload unavailable
      </ChoiceLabel>
    </Specimen>
  );
}
const queueStates = [
  "Ready",
  "Queued",
  "Uploading",
  "Interrupted",
  "Complete",
  "Loading",
  "Empty",
] as const;
type QueueState = (typeof queueStates)[number];
export function FeedbackSpecimen() {
  const [state, setState] = useState<QueueState>("Ready");
  const notify = useReceiptToast();
  const queueControl = useRef<HTMLSelectElement>(null);
  function changeQueueFromAction(next: QueueState) {
    queueControl.current?.focus();
    setState(next);
  }
  return (
    <Specimen
      id="feedback"
      title="Feedback"
      source="ui/toast · ui/alert · ui/progress · ui/skeleton · ui/empty"
    >
      <div className="grid justify-items-start gap-1">
        <h3 className="font-semibold">Toast receipt</h3>
        <p className="text-sm text-muted-foreground">
          A check on an inverse surface confirms the action. Errors and retry
          actions stay inline.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => notify("Sample changes saved.")}
        >
          Show confirmation
        </Button>
      </div>
      <Field>
        <FieldLabel htmlFor="sample-queue">Queue state</FieldLabel>
        <NativeSelect
          id="sample-queue"
          ref={queueControl}
          value={state}
          onChange={(e) => setState(e.target.value as QueueState)}
        >
          {queueStates.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </NativeSelect>
      </Field>
      {state === "Empty" ? (
        <Empty>
          <EmptyMedia variant="icon">
            <BookOpenIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No queued moments</EmptyTitle>
            <EmptyDescription>
              Add a sample to see its upload state.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              onClick={() => changeQueueFromAction("Ready")}
            >
              Add sample
            </Button>
          </EmptyContent>
        </Empty>
      ) : state === "Loading" ? (
        <ContentLoading label="Loading queue…" />
      ) : (
        <Alert
          variant={
            state === "Interrupted"
              ? "destructive"
              : state === "Complete"
                ? "success"
                : state === "Queued"
                  ? "warning"
                  : "default"
          }
          role={state === "Interrupted" ? "alert" : "status"}
        >
          {state === "Complete" ? (
            <CheckIcon aria-hidden="true" />
          ) : (
            <InfoIcon aria-hidden="true" />
          )}
          <AlertTitle>
            {state === "Ready"
              ? "Saved on this device"
              : state === "Queued"
                ? "Waiting for a connection"
                : state === "Interrupted"
                  ? "Upload interrupted"
                  : state === "Complete"
                    ? "Uploaded privately"
                    : "Uploading privately"}
          </AlertTitle>
          <AlertDescription>
            {state === "Uploading" ? (
              <div className="grid gap-1">
                42% uploaded
                <Progress value={42} max={100} aria-label="Sample upload" />
              </div>
            ) : state === "Complete" ? (
              "Your sample is available privately."
            ) : (
              "A local copy is available."
            )}
          </AlertDescription>
          {state === "Interrupted" && (
            <AlertAction>
              <Button
                variant="outline"
                onClick={() => changeQueueFromAction("Uploading")}
              >
                Retry sample
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}
    </Specimen>
  );
}
export function SurfaceSpecimen() {
  return (
    <Specimen
      id="surfaces"
      title="Rows & cards"
      source="ui/card · ui/avatar · ui/badge"
    >
      <Card size="sm">
        <CardContent className="divide-y">
          {[
            {
              initials: "AM",
              name: "Anu Menon",
              role: "Coauthor",
              detail: "Can review shared moments and edit chapters.",
            },
            {
              initials: "MR",
              name: "Mira Rao",
              role: "Contributor",
              detail: "Can add moments and manage her original files.",
            },
          ].map((person) => (
            <details key={person.name} className="group/row py-1">
              <summary className="flex min-h-control cursor-pointer flex-wrap items-center gap-2">
                <Avatar
                  aria-hidden="true"
                  size={person.role === "Coauthor" ? "lg" : "sm"}
                >
                  <AvatarFallback>{person.initials}</AvatarFallback>
                </Avatar>
                <span className="font-semibold">{person.name}</span>
                <Badge>{person.role}</Badge>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="ms-auto size-4 shrink-0 group-open/row:rotate-180 motion-safe:transition-transform"
                />
              </summary>
              <p className="pb-2 text-sm text-muted-foreground">
                {person.detail}
              </p>
            </details>
          ))}
        </CardContent>
      </Card>
    </Specimen>
  );
}
export function OverlaySpecimen() {
  const [order, setOrder] = useState("Newest first");
  const [bookmarked, setBookmarked] = useState(false);
  return (
    <Specimen
      id="overlays"
      title="Menus & overlays"
      source="ui/dropdown-menu · ui/dialog · ui/sheet"
    >
      <p className="text-sm text-muted-foreground">
        Use the native picker to set a form value. Open an action menu to sort
        or run a command. Escape or Android Back dismisses an open overlay.
      </p>
      <div className="flex flex-wrap gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            Sort moments{" "}
            <ChevronDownIcon data-menu-chevron="" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel id="sample-sort-order">
                Sort order
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                aria-labelledby="sample-sort-order"
                value={order}
                onValueChange={setOrder}
              >
                {["Newest first", "Oldest first"].map((o) => (
                  <DropdownMenuRadioItem value={o} key={o}>
                    {o}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            Sample bookmark
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Bookmark actions</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={bookmarked}
                onClick={() => setBookmarked(true)}
              >
                Add bookmark
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={!bookmarked}
                onClick={() => setBookmarked(false)}
              >
                Remove bookmark
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Sheet>
          <SheetTrigger render={<Button variant="outline" />}>
            Open sheet
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Row details</SheetTitle>
              <SheetDescription>Anu Menon · Coauthor</SheetDescription>
            </SheetHeader>
            <p className="px-3">Can review shared moments and edit chapters.</p>
          </SheetContent>
        </Sheet>
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>
            Open dialog
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Visibility preview</DialogTitle>
            <DialogDescription>
              Only the owner can see this sample moment.
            </DialogDescription>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-sm text-muted-foreground">Current order · {order}</p>
      <p role="status" className="text-sm text-muted-foreground">
        {bookmarked ? "Sample bookmarked" : "No sample bookmark"}
      </p>
    </Specimen>
  );
}

export function ExpressionSpecimen() {
  const [example, setExample] = useState("Empty journey illustration");
  return (
    <Specimen
      id="expression"
      title="Icons, illustration & loading"
      source="ui/cairn-logo · ui/loading · illustrations/journey-map"
    >
      <Field>
        <FieldLabel htmlFor="expression-example">Preview pattern</FieldLabel>
        <NativeSelect
          id="expression-example"
          value={example}
          onChange={(event) => setExample(event.target.value)}
        >
          {[
            "Empty journey illustration",
            "Opening the workspace",
            "Loading journeys",
          ].map((option) => (
            <option key={option}>{option}</option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid min-h-32 content-center overflow-hidden rounded-control border bg-card">
        {example === "Empty journey illustration" ? (
          <JourneyMap />
        ) : example === "Loading journeys" ? (
          <ContentLoading label="Loading your journeys" />
        ) : (
          <LaunchFeedback />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t pt-2 text-sm">
        <span className="inline-flex items-center gap-1">
          <CairnMark /> Shared Cairn
        </span>
        <span className="inline-flex items-center gap-1">
          <BookmarkIcon size={16} aria-hidden="true" /> Save
        </span>
        <span className="inline-flex items-center gap-1">
          <CompassIcon size={16} aria-hidden="true" /> Discover
        </span>
      </div>
      <CairnLogo />
      <p className="text-sm text-muted-foreground">
        Lucide for controls. Shared Cairn identifies Kairn and shows activity.
        The folded map marks an empty journey collection.
      </p>
    </Specimen>
  );
}
