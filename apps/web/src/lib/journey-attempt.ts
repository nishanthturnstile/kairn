import type { CreateJourney } from "@kairn/contracts";
import { createJourney, createJourneyHeaders } from "@kairn/contracts/journeys";

export interface JourneyAttempt {
  key: string;
  input: CreateJourney;
}

const storeName = "attempts";
type Operation =
  | { type: "read" }
  | { type: "claim"; attempt: JourneyAttempt }
  | { type: "clear"; key: string };

function openStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("kairn-journey-creation", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAttempt(value: unknown): JourneyAttempt | null {
  if (value === undefined) return null;
  if (
    typeof value === "object" &&
    value &&
    "key" in value &&
    "input" in value
  ) {
    const header = createJourneyHeaders.safeParse({
      "idempotency-key": value.key,
    });
    const input = createJourney.safeParse(value.input);
    if (header.success && input.success)
      return { key: header.data["idempotency-key"], input: input.data };
  }
  throw new Error("The saved journey attempt could not be read.");
}

async function accessAttempt(accountId: string, operation: Operation) {
  const db = await openStore();
  try {
    return await new Promise<JourneyAttempt | null>((resolve, reject) => {
      const tx = db.transaction(
        storeName,
        operation.type === "read" ? "readonly" : "readwrite",
      );
      const store = tx.objectStore(storeName);
      const request = store.get(accountId);
      let result: JourneyAttempt | null = null;
      request.onsuccess = () => {
        try {
          result = readAttempt(request.result);
          if (operation.type === "claim" && !result) {
            result = operation.attempt;
            store.add(result, accountId);
          }
          if (operation.type === "clear" && operation.key === result?.key) {
            store.delete(accountId);
            result = null;
          }
        } catch {
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(
          tx.error ?? new Error("The journey attempt could not be stored."),
        );
    });
  } finally {
    db.close();
  }
}

export function loadJourneyAttempt(accountId: string) {
  return accessAttempt(accountId, { type: "read" });
}

export function claimJourneyAttempt(
  accountId: string,
  attempt: JourneyAttempt,
) {
  return accessAttempt(accountId, { type: "claim", attempt });
}

export function clearJourneyAttempt(accountId: string, key: string) {
  return accessAttempt(accountId, { type: "clear", key });
}
