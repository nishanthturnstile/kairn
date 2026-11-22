import { ArrowUpRightIcon, MousePointer2Icon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

const roles = [
  ["Canvas / ink", "bg-background text-foreground"],
  ["Surface / secondary text", "bg-card text-muted-foreground"],
  ["Rail / navigation", "bg-sidebar text-sidebar-foreground"],
  ["Divider", "bg-card border-border text-foreground"],
  ["Control edge", "bg-card border-input text-foreground"],
  ["Receipt", "bg-receipt text-receipt-foreground"],
  ["Primary action", "bg-primary text-primary-foreground"],
  ["Inset key", "bg-key text-key-foreground"],
  ["Selection", "bg-citron text-citron-foreground"],
  ["Dock", "bg-dock text-dock-foreground"],
  ["Lilac", "bg-lilac text-lilac-foreground"],
  ["Clay", "bg-clay text-clay-foreground"],
  ["Focus", "bg-card border-ring text-foreground"],
  ["Information", "bg-card text-information"],
  ["Warning", "bg-card text-warning"],
  ["Error", "bg-card text-destructive"],
  ["Success", "bg-card text-success"],
] as const;
const spacing = [
  [4, "Label to value"],
  [8, "Related controls"],
  [12, "Adjacent examples"],
  [16, "Group inset"],
  [24, "Separate tasks"],
] as const;
function Study({
  title,
  caption,
  art,
  children,
}: {
  title: string;
  caption: string;
  art: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger className="group grid grid-rows-[auto_1fr] min-w-0 overflow-hidden rounded-card border bg-card text-start">
        <span aria-hidden="true" className="block">
          {art}
        </span>
        <span className="flex flex-wrap items-center justify-between gap-1 px-2 py-2 font-heading text-sm font-bold sm:px-3 sm:text-base">
          {title}
          <ArrowUpRightIcon
            size={15}
            className="shrink-0 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{caption}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Foundations() {
  const [pressCount, setPressCount] = useState(0);
  const [gap, setGap] = useState("24");
  return (
    <section aria-label="Foundations" className="@container grid gap-2">
      <h2
        id="foundations"
        tabIndex={-1}
        className="text-2xl font-bold tracking-tight"
      >
        Foundations
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(12rem,100%),1fr))] gap-3">
        <Study
          title="Colour"
          caption="Semantic colour roles resolve to the active appearance."
          art={
            <span className="flex h-16 items-center justify-center bg-muted px-2 sm:h-20">
              {[
                "bg-foreground",
                "bg-citron",
                "bg-lilac",
                "bg-clay",
                "bg-card",
              ].map((cls) => (
                <i key={cls} className={`h-7 w-1/6 rounded-tag ${cls}`} />
              ))}
            </span>
          }
        >
          <ul className="grid gap-1">
            {roles.map(([name, cls]) => (
              <li
                key={name}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 py-1"
              >
                <span
                  aria-hidden="true"
                  className={`row-span-2 @max-[14rem]/dialog:row-span-1 grid min-h-control w-10 place-items-center rounded-tag border-2 font-semibold ${cls}`}
                >
                  Aa
                </span>
                <strong>{name}</strong>
                <code className="@max-[14rem]/dialog:col-span-full text-sm text-muted-foreground">
                  {cls}
                </code>
              </li>
            ))}
          </ul>
        </Study>
        <Study
          title="Typography"
          caption="Use Bricolage Grotesque for headings and Source Sans 3 for controls and body text."
          art={
            <span className="flex h-16 items-center justify-center bg-lilac font-heading text-3xl font-bold tracking-tight text-lilac-foreground sm:h-20 sm:text-5xl">
              Aa
              <span className="font-sans font-normal text-lilac-foreground">
                Gg
              </span>
            </span>
          }
        >
          <p className="font-heading text-2xl font-bold">
            Section heading · 24 px
          </p>
          <p className="font-heading text-xl font-bold">
            Component heading · 22 px
          </p>
          <p className="text-(length:--text-control) font-semibold">
            Action label · 15 px
          </p>
          <p>Body copy · 16 px</p>
          <p className="text-sm text-muted-foreground">
            Supporting label · 14 px
          </p>
        </Study>
        <Study
          title="Spacing"
          caption="Compare the same two groups at different densities."
          art={
            <span className="flex h-16 items-end justify-center gap-1.5 bg-clay px-3 pb-3 sm:h-20">
              {spacing.map(([px]) => (
                <i
                  key={px}
                  style={{ height: px * 1.7 }}
                  className="w-[12%] max-w-8 bg-clay-foreground"
                />
              ))}
            </span>
          }
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {spacing.map(([px, label]) => (
              <div key={px} className="contents">
                <dt className="font-mono text-sm">{px} px</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
          <Field>
            <FieldLabel htmlFor="density">Section gap</FieldLabel>
            <NativeSelect
              id="density"
              value={gap}
              onChange={(e) => setGap(e.target.value)}
            >
              <option value="24">Fold · 24 px</option>
              <option value="40">Compare · 40 px</option>
            </NativeSelect>
          </Field>
          <div
            className="grid rounded-control bg-muted p-3"
            style={{ gap: Number(gap) }}
          >
            <p>
              <strong>Drafts</strong>
              <br />
              Nilgiri weekend
            </p>
            <p>
              <strong>Published</strong>
              <br />
              Western Ghats by rail
            </p>
          </div>
        </Study>
        <Study
          title="Motion & targets"
          caption="The inset key compresses on press. Overlays enter in 100–180 ms. Reduced motion applies each state immediately."
          art={
            <span className="flex h-16 items-center justify-center bg-dock text-dock-foreground sm:h-20">
              <span className="grid size-control place-items-center rounded-control border border-dock-foreground text-citron">
                <MousePointer2Icon size={18} />
              </span>
            </span>
          }
        >
          <p>
            Default controls start at 34 px, Outdoor at 44 px, and touch targets
            at 48 px.
          </p>
          <Button
            className="justify-self-start"
            onClick={() => setPressCount((count) => count + 1)}
          >
            Test press
          </Button>
          <output className="text-sm text-muted-foreground">
            Presses · {pressCount}
          </output>
        </Study>
      </div>
    </section>
  );
}
