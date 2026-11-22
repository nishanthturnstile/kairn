import { Popover } from "@base-ui/react/popover";
import {
  CheckIcon,
  ContrastIcon,
  MoonIcon,
  SunIcon,
  SunMediumIcon,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  appearanceOptions,
  getAppearance,
  getServerAppearance,
  initializeAppearance,
  setAppearance,
  subscribeToAppearance,
} from "../lib/appearance";
import { Button } from "./ui/button";

export const appearanceLabels = {
  system: "System",
  light: "Light",
  dark: "Dark",
  outdoor: "Outdoor",
};

const appearanceIcons = {
  system: ContrastIcon,
  light: SunIcon,
  dark: MoonIcon,
  outdoor: SunMediumIcon,
};
export function AppearanceIcon({
  mode,
}: {
  mode: keyof typeof appearanceIcons;
}) {
  const Icon = appearanceIcons[mode];
  return <Icon className="size-5" aria-hidden="true" />;
}

export function AppearanceChoices({
  appearance,
  onChoose,
}: {
  appearance: (typeof appearanceOptions)[number];
  onChoose: (option: (typeof appearanceOptions)[number]) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(6rem,100%),1fr))] gap-1.5 rounded-control bg-background p-1.5">
      {appearanceOptions.map((option) => (
        <Button
          key={option}
          type="button"
          variant="ghost"
          aria-pressed={option === appearance}
          className="relative min-h-touch flex-col gap-1.5 px-2 py-3 aria-pressed:border-primary aria-pressed:bg-muted aria-pressed:text-primary"
          onClick={() => onChoose(option)}
        >
          <AppearanceIcon mode={option} />
          {option === appearance && (
            <span
              aria-hidden="true"
              className="absolute end-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <CheckIcon className="size-3" aria-hidden="true" />
            </span>
          )}
          {appearanceLabels[option]}
        </Button>
      ))}
    </div>
  );
}

export function AppearanceSwitcher({
  showLabel = false,
  large = false,
}: {
  showLabel?: boolean;
  large?: boolean;
} = {}) {
  const appearance = useSyncExternalStore(
    subscribeToAppearance,
    getAppearance,
    getServerAppearance,
  );
  const [open, setOpen] = useState(false);
  useEffect(initializeAppearance, []);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button
            type="button"
            size={showLabel ? "default" : large ? "icon-lg" : "icon"}
            variant="outline"
            className={showLabel ? undefined : "rounded-full"}
            aria-label={
              showLabel
                ? `Appearance: ${appearanceLabels[appearance]}`
                : "Appearance"
            }
            aria-description={`Current appearance: ${appearanceLabels[appearance]}`}
            title={`Appearance: ${appearanceLabels[appearance]}`}
          />
        }
      >
        <AppearanceIcon mode={appearance} />
        {showLabel && appearanceLabels[appearance]}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="isolate z-50"
        >
          <Popover.Popup
            data-slot="appearance-popup"
            aria-label="Appearance"
            className="z-20 grid max-h-[var(--available-height)] w-[min(17rem,calc(100vw-24px))] gap-3 overflow-y-auto overscroll-contain rounded-card control-border bg-card p-3 text-foreground shadow-md"
          >
            <p className="px-1 font-semibold">Appearance</p>
            <AppearanceChoices
              appearance={appearance}
              onChoose={(option) => {
                setAppearance(option);
                setOpen(false);
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
