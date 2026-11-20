import { Popover } from "radix-ui";
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

export function AppearanceSwitcher() {
  const appearance = useSyncExternalStore(
    subscribeToAppearance,
    getAppearance,
    getServerAppearance,
  );
  const [open, setOpen] = useState(false);
  useEffect(initializeAppearance, []);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="rounded-full"
          aria-label="Appearance"
          aria-description={`Current appearance: ${appearanceLabels[appearance]}`}
          title={`Appearance: ${appearanceLabels[appearance]}`}
        >
          <span
            aria-hidden="true"
            className="appearance-glyph"
            data-mode={appearance}
          />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Appearance"
          className="z-20 grid max-h-[var(--radix-popover-content-available-height)] w-[min(17rem,calc(100vw-24px))] gap-3 overflow-y-auto overscroll-contain rounded-card control-border bg-card p-3 text-foreground shadow-[0_4px_16px_rgb(0_0_0/14%)]"
        >
          <p className="px-1 font-semibold">Appearance</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(6rem,100%),1fr))] gap-1.5 rounded-control bg-background p-1.5">
            {appearanceOptions.map((option) => (
              <Button
                key={option}
                type="button"
                variant="ghost"
                aria-pressed={option === appearance}
                className="relative flex-col gap-1.5 px-2 py-3 aria-pressed:border-primary aria-pressed:bg-muted aria-pressed:text-primary"
                onClick={() => {
                  setAppearance(option);
                  setOpen(false);
                }}
              >
                <span
                  aria-hidden="true"
                  className="appearance-glyph"
                  data-mode={option}
                />
                {option === appearance && (
                  <span
                    aria-hidden="true"
                    className="absolute end-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <span className="confirmation-check" />
                  </span>
                )}
                {appearanceLabels[option]}
              </Button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
