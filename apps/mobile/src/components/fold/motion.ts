import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

let reduced = true;
const listeners = new Set<() => void>();
let subscription:
  | ReturnType<typeof AccessibilityInfo.addEventListener>
  | undefined;
function update(next: boolean) {
  if (next === reduced) return;
  reduced = next;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!subscription) {
    let changed = false;
    const active = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (next) => {
        changed = true;
        update(next);
      },
    );
    subscription = active;
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (next) => {
        if (active === subscription && !changed) update(next);
      },
      () => {},
    );
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      subscription?.remove();
      subscription = undefined;
      reduced = true;
    }
  };
}
export function useReduceMotionPreference() {
  return useSyncExternalStore(
    subscribe,
    () => reduced,
    () => true,
  );
}
