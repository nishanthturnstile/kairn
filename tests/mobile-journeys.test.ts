import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vite-plus/test";
import { createAuthenticatedMobileApiClient } from "../apps/mobile/src/api";
import {
  createMobileSession,
  isVerifiedMobileScope,
} from "../apps/mobile/src/session";
import {
  createJourneyAttemptTable,
  journeyAttempts,
} from "../apps/mobile/src/storage/journey-attempt";

const origin = "https://kairn.test";
const accountId = "250dbeb0-da94-4de9-a164-cadaa8d2d6bd";
const otherAccount = "cf1f1e2a-06e9-40c8-8d43-6e61605250e1";
const input = {
  title: "Synthetic Coorg",
  intendedStart: "2027-05-01T09:00",
  timeZone: "Asia/Kolkata",
};

describe("native Journey account lifetime", () => {
  it("uses the awaited cookie and expected account for the configured origin with redirects disabled", async () => {
    const lifetime = new AbortController();
    const getCookie = vi.fn(async () => "session=synthetic");
    const api = createAuthenticatedMobileApiClient({
      origin,
      accountId,
      lifetime: lifetime.signal,
      getCookie,
      async send(request, init) {
        expect(request.url).toBe(`${origin}/api/v1/journeys`);
        expect(init.credentials).toBe("omit");
        expect(init.redirect).toBe("error");
        const headers = new Headers(init.headers);
        expect(headers.get("Cookie")).toBe("session=synthetic");
        expect(headers.get("X-Expected-Account")).toBe(accountId);
        return Response.json(
          { id: "29b68b7f-eb5b-42cb-8c72-15f755547543" },
          { status: 201 },
        );
      },
    });
    const result = await api.POST("/api/v1/journeys", {
      params: {
        header: { "idempotency-key": "15629f55-bdda-4239-9b98-4b02c50d3e20" },
      },
      body: input,
    });
    expect(result.response.status).toBe(201);
    await expect(
      api.GET("/api/v1/journeys", { baseUrl: "https://other.test" }),
    ).rejects.toThrow("configured origin");
    expect(getCookie).toHaveBeenCalledTimes(1);
  });

  it("disposes the account cache and stops dispatch if cookie retrieval finishes after an account switch", async () => {
    const started = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<string>();
    const send = vi.fn(async () => Response.json({}));
    const session = createMobileSession({
      origin,
      send,
      getCookie() {
        started.resolve();
        return pending.promise;
      },
    });
    session.setVerifiedAccount(accountId);
    const first = session.getSnapshot();
    first.queryClient.setQueryData(["journeys"], "private fixture");
    const result = first.api
      ?.GET("/api/v1/journeys")
      .catch((error: unknown) => error);
    await started.promise;
    session.setVerifiedAccount(otherAccount);
    pending.resolve("different-account=synthetic");
    expect(await result).toMatchObject({ name: "AbortError" });
    expect(send).not.toHaveBeenCalled();
    expect(first.queryClient.getQueryData(["journeys"])).toBeUndefined();
    expect(session.getSnapshot().queryClient).not.toBe(first.queryClient);
  });

  it("cancels an in-flight request and discards its late response", async () => {
    const lifetime = new AbortController();
    const started = Promise.withResolvers<AbortSignal | null | undefined>();
    const response = Promise.withResolvers<Response>();
    const api = createAuthenticatedMobileApiClient({
      origin,
      accountId,
      lifetime: lifetime.signal,
      getCookie: async () => "session=synthetic",
      send: async (_, init) => {
        started.resolve(init.signal);
        return response.promise;
      },
    });
    const settled = api
      .GET("/api/v1/journeys")
      .catch((error: unknown) => error);
    const signal = await started.promise;
    lifetime.abort();
    expect(signal?.aborted).toBe(true);
    response.resolve(Response.json({ upcoming: [] }));
    expect(await settled).toMatchObject({ name: "AbortError" });
  });

  it("pauses a write awaiting its cookie during foreground verification while retaining the same account scope", async () => {
    const started = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<string>();
    const send = vi.fn(async () => Response.json({}));
    const session = createMobileSession({
      origin,
      send,
      getCookie() {
        started.resolve();
        return pending.promise;
      },
    });
    session.setVerifiedAccount(accountId);
    const scope = session.getSnapshot();
    if (!isVerifiedMobileScope(scope))
      throw new Error("Expected a verified scope");
    const submit = () =>
      scope.api.POST("/api/v1/journeys", {
        params: {
          header: { "idempotency-key": "15629f55-bdda-4239-9b98-4b02c50d3e20" },
        },
        body: input,
      });
    const blocked = expect(submit()).rejects.toThrow(
      "Session verification is in progress.",
    );
    await started.promise;
    const first = session.beginForegroundCheck();
    const current = session.beginForegroundCheck();
    expect(first()).toBe(false);
    expect(session.canSubmit(scope)).toBe(false);
    expect(session.getSnapshot()).toBe(scope);
    pending.resolve("session=synthetic");
    await blocked;
    expect(send).not.toHaveBeenCalled();
    await scope.api.GET("/api/v1/journeys");
    expect(send).toHaveBeenCalledTimes(1);
    expect(current()).toBe(true);
    expect(session.canSubmit(scope)).toBe(true);
    await submit();
    expect(send).toHaveBeenCalledTimes(2);
  });
});

function sqliteAdapter(db: DatabaseSync) {
  function values(bindings: unknown[]) {
    return bindings.map((binding) => String(binding));
  }
  return {
    async getFirstAsync<T>(sql: string, ...bindings: unknown[]) {
      return (
        (db.prepare(sql).get(...values(bindings)) as T | undefined) ?? null
      );
    },
    async runAsync(sql: string, ...bindings: unknown[]) {
      const result = db.prepare(sql).run(...values(bindings));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
  };
}

it("preserves a SQLite attempt across reopen without replacing a prior attempt or deleting a different key", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kairn-native-journey-"));
  const file = join(directory, "workspace.db");
  const first = { key: "15629f55-bdda-4239-9b98-4b02c50d3e20", input };
  const second = {
    key: "34bc21a5-aa5f-4092-bd14-c74a836194ef",
    input: { ...input, title: "Another journey" },
  };
  try {
    const initial = new DatabaseSync(file);
    try {
      initial.exec(
        "CREATE TABLE local_drafts (id TEXT PRIMARY KEY, text TEXT NOT NULL) STRICT; INSERT INTO local_drafts VALUES ('fixture', 'existing draft');",
      );
      initial.exec(createJourneyAttemptTable);
      await expect(
        journeyAttempts(sqliteAdapter(initial)).claim(first),
      ).resolves.toEqual(first);
    } finally {
      initial.close();
    }
    const reopened = new DatabaseSync(file);
    try {
      const attempts = journeyAttempts(sqliteAdapter(reopened));
      expect(reopened.prepare("SELECT text FROM local_drafts").get()).toEqual({
        text: "existing draft",
      });
      await expect(attempts.read()).resolves.toEqual(first);
      await expect(attempts.claim(second)).resolves.toEqual(first);
      await attempts.clear(second.key);
      await expect(attempts.read()).resolves.toEqual(first);
      await attempts.clear(first.key);
      await expect(attempts.read()).resolves.toBeNull();
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
