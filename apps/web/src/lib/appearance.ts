export const appearanceOptions = [
  "system",
  "light",
  "dark",
  "outdoor",
] as const;

export type Appearance = (typeof appearanceOptions)[number];
const storageKey = "kairn.appearance";
const listeners = new Set<() => void>();
let currentAppearance: Appearance | undefined;

function readAppearance(): Appearance {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return appearanceOptions.find((option) => option === stored) ?? "system";
  } catch {
    return "system";
  }
}

export function getAppearance() {
  currentAppearance ??= readAppearance();
  return currentAppearance;
}

export function getServerAppearance(): Appearance {
  return "system";
}

export function initializeAppearance() {
  if (typeof document === "undefined") return;
  const appearance = getAppearance();
  if (appearance === "system") {
    delete document.documentElement.dataset.appearance;
  } else {
    document.documentElement.dataset.appearance = appearance;
  }
}

function updateAppearance(appearance: Appearance) {
  currentAppearance = appearance;
  initializeAppearance();
  for (const listener of listeners) listener();
}

export function setAppearance(appearance: Appearance) {
  try {
    window.localStorage.setItem(storageKey, appearance);
  } catch {
    // The selection can still apply in this tab if storage is unavailable.
  }
  updateAppearance(appearance);
}

function syncAppearance(event: StorageEvent) {
  if (event.key === storageKey || event.key === null) {
    updateAppearance(readAppearance());
  }
}

export function subscribeToAppearance(listener: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("storage", syncAppearance);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", syncAppearance);
    }
  };
}
