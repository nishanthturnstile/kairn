import { cn } from "cn";
import { useEffect, useSyncExternalStore } from "react";
import {
  appearanceOptions,
  getAppearance,
  getServerAppearance,
  initializeAppearance,
  setAppearance,
  subscribeToAppearance,
} from "../lib/appearance";

const labels = {
  system: "System",
  light: "Light",
  dark: "Dark",
  outdoor: "Outdoor",
};

export function AppearanceSelect({ className }: { className?: string }) {
  const appearance = useSyncExternalStore(
    subscribeToAppearance,
    getAppearance,
    getServerAppearance,
  );

  useEffect(initializeAppearance, []);

  return (
    <label className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-sm font-semibold text-muted-foreground">
        Appearance
      </span>
      <span className="appearance-picker">
        <select
          className="min-h-touch min-w-touch max-w-full rounded-control control-border bg-card py-2 ps-3 pe-9 text-base text-foreground hover:border-primary"
          value={appearance}
          onChange={(event) => {
            const option = appearanceOptions[event.currentTarget.selectedIndex];
            if (option) setAppearance(option);
          }}
        >
          {appearanceOptions.map((option) => (
            <option key={option} value={option}>
              {labels[option]}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
