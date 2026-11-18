import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import {
  createAuth,
  openDatabase,
  openJobQueue,
  openMailTransport,
  registerIdentityMail,
} from "../../packages/backend/src/index";
import {
  epochSigningSecret,
  initializeLocalIdentity,
  localRecoveryEpoch,
} from "../../packages/backend/src/modules/identity/state";
import { replayIdentityRestrictions } from "../../packages/backend/src/modules/lifecycle/identity-restrictions";
import {
  type RestrictionJournal,
  restrictionDigest,
} from "../../packages/backend/src/modules/lifecycle/restriction-journal";

const origin = "http://kairn.test";
const resetPassword = "Synthetic-replacement-password";
const password = "Synthetic-original-password";
const mailpit = process.env.KAIRN_TEST_MAILPIT_URL ?? "http://127.0.0.1:58025";
const runtime =
  process.env.KAIRN_TEST_DATABASE_URL ??
  "postgresql://kairn_runtime:local-runtime-only@127.0.0.1:55432/kairn";
const migrator =
  process.env.KAIRN_TEST_MIGRATION_DATABASE_URL ??
  "postgresql://kairn_migrator:local-migrator-only@127.0.0.1:55432/kairn";
const accountEmail = () => `integration-${randomUUID()}@example.test`;
const config = {
  baseURL: origin,
  secret: randomBytes(32).toString("hex"),
  epoch: localRecoveryEpoch,
  mailKey: randomBytes(32).toString("hex"),
};

type Handler = ReturnType<typeof createAuth>["handler"];
let requestNumber = 0;

function call(
  handler: Handler,
  path: string,
  body?: Record<string, unknown>,
  cookies?: string,
) {
  const headers = new Headers({
    Origin: origin,
    "X-Forwarded-For": `198.51.100.${++requestNumber}`,
  });
  if (cookies) headers.set("Cookie", cookies);
  if (body) headers.set("Content-Type", "application/json");
  return handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

function cookie(response: Response) {
  const value = response.headers
    .getSetCookie()
    .find((line) => line.includes("session_token="));
  if (!value) throw new Error("Missing session cookie.");
  expect(value).toContain("HttpOnly");
  return value.split(";")[0];
}

async function findMail(email: string, subject: string) {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const inbox = await fetch(
          `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        ).then((response) => response.json());
        id = inbox.messages?.find(
          (message: { Subject: string }) => message.Subject === subject,
        )?.ID;
        return Boolean(id);
      },
      { timeout: 12_000 },
    )
    .toBe(true);
  const message = await fetch(`${mailpit}/api/v1/message/${id}`).then(
    (response) => response.json(),
  );
  const link = String(message.Text).match(
    /http:\/\/kairn\.test\/api\/auth\/\S+/,
  )?.[0];
  if (!link) throw new Error("No account link in fixture email.");
  return new URL(link);
}

async function signUp(handler: Handler, email: string) {
  const response = await call(handler, "/sign-up/email", {
    email,
    password,
    name: "Synthetic account",
  });
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie()).toHaveLength(0);
  return (await response.json()).user.id as string;
}

async function verify(handler: Handler, email: string) {
  const response = await handler(
    new Request(await findMail(email, "Verify your Kairn email")),
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(
    `${origin}/account?verification=confirmed`,
  );
}

function resetToken(url: URL) {
  const token = url.pathname.split("/").at(-1);
  if (!token) throw new Error("Fixture reset token is absent.");
  return token;
}

describe.runIf(process.env.KAIRN_INTEGRATION === "1")(
  "identity and recovery",
  () => {
    const database = openDatabase(runtime);
    const owner = openDatabase(migrator);
    const boss = openJobQueue(runtime);
    const transport = openMailTransport("smtp://127.0.0.1:51025");
    const handler = createAuth(database.db, { ...config, boss }).handler;

    beforeAll(async () => {
      await initializeLocalIdentity(database.db, localRecoveryEpoch);
      await boss.start();
    });

    afterAll(async () => {
      await boss.stop();
      transport.close();
      await Promise.all([database.pool.end(), owner.pool.end()]);
    });

    it("suppresses delayed verification mail after its expiry", async () => {
      const email = accountEmail();
      const id = await signUp(handler, email);
      await database.pool.query(
        "UPDATE kairn_auth.identity_mail SET expires_at = now() - interval '1 second' WHERE account_id = $1",
        [id],
      );
      await registerIdentityMail(boss, database.db, {
        key: config.mailKey,
        from: "no-reply@kairn.test",
        transport,
      });
      await expect
        .poll(
          async () =>
            (
              await database.pool.query(
                "SELECT state, ciphertext IS NULL AS cleared FROM kairn_auth.identity_mail WHERE account_id = $1",
                [id],
              )
            ).rows[0],
          { timeout: 12_000 },
        )
        .toEqual({ state: "expired", cleared: true });
    });

    it("requires verification, restricts return paths, checks device freshness, and revokes sessions", async () => {
      const email = accountEmail();
      const id = await signUp(handler, email);
      const unverified = await call(handler, "/sign-in/email", {
        email,
        password,
      });
      expect(unverified.status).toBe(403);
      expect(
        (
          await call(handler, "/send-verification-email", {
            email,
            callbackURL: "//other.test/account",
          })
        ).status,
      ).toBe(400);
      await verify(handler, email);
      const first = cookie(
        await call(handler, "/sign-in/email", { email, password }),
      );
      const second = cookie(
        await call(handler, "/sign-in/email", { email, password }),
      );
      const devices = await call(handler, "/devices", undefined, first).then(
        (response) => response.json(),
      );
      expect(devices.devices).toHaveLength(2);
      expect(
        devices.devices.every((device: object) => !("token" in device)),
      ).toBe(true);
      const other = devices.devices.find(
        (device: { id: string }) => device.id !== devices.currentDeviceId,
      );
      await database.pool.query(
        "UPDATE kairn_auth.session SET created_at = now() - interval '20 minutes' WHERE id = $1",
        [devices.currentDeviceId],
      );
      expect(
        (await call(handler, "/devices/revoke", { id: other.id }, first))
          .status,
      ).toBe(403);
      const fresh = cookie(
        await call(handler, "/sign-in/email", { email, password }),
      );
      const revocation = await call(
        handler,
        "/devices/revoke",
        { id: other.id },
        fresh,
      );
      expect(revocation.status).toBe(202);
      const { eventId, confirmation } = await revocation.json();
      expect(confirmation).toBe("pending");
      expect(
        (await call(handler, "/get-session", undefined, second).then(
          (response) => response.json(),
        )) === null,
      ).toBe(true);
      const pending = await call(handler, "/devices", undefined, fresh).then(
        (response) => response.json(),
      );
      expect(pending.pendingRestrictions).toBe(1);
      const queued = await boss.getJobById("identity.restriction", eventId);
      expect(queued?.data).toEqual({ id: eventId });
      expect((await call(handler, "/sign-out", {}, fresh)).status).toBe(200);
      expect(
        (await call(handler, "/get-session", undefined, fresh).then(
          (response) => response.json(),
        )) === null,
      ).toBe(true);
      expect(id).toBeTruthy();
    }, 30_000);

    it("rolls back registration when the email enqueue fails", async () => {
      const email = accountEmail();
      const send = vi
        .spyOn(boss, "send")
        .mockRejectedValueOnce(new Error("Fixture queue fault"));
      try {
        const response = await call(handler, "/sign-up/email", {
          email,
          password,
          name: "Synthetic account",
        });
        expect(response.status).toBe(503);
        expect(
          (
            await database.pool.query(
              'SELECT id FROM kairn_auth."user" WHERE email = $1',
              [email],
            )
          ).rowCount,
        ).toBe(0);
      } finally {
        send.mockRestore();
      }
    });

    it("records exhausted SMTP deliveries and discards their encrypted links", async () => {
      const email = accountEmail();
      const enqueue = boss.send.bind(boss);
      const enqueueOnce = vi
        .spyOn(boss, "send")
        .mockImplementationOnce((name, data, options) =>
          enqueue(name, data, { ...options, retryLimit: 0 }),
        );
      const exhausted = vi
        .spyOn(transport, "send")
        .mockRejectedValueOnce(new Error("Fixture SMTP unavailable"));
      try {
        const id = await signUp(handler, email);
        await expect
          .poll(
            async () =>
              (
                await database.pool.query(
                  "SELECT state, ciphertext IS NULL AS cleared FROM kairn_auth.identity_mail WHERE account_id = $1",
                  [id],
                )
              ).rows[0],
            { timeout: 12_000 },
          )
          .toEqual({ state: "failed", cleared: true });
      } finally {
        enqueueOnce.mockRestore();
        exhausted.mockRestore();
      }
    }, 15_000);

    it("rejects expired and consumed resets, and invalidates current sessions on a successful reset", async () => {
      const email = accountEmail();
      const id = await signUp(handler, email);
      await verify(handler, email);
      const previous = cookie(
        await call(handler, "/sign-in/email", { email, password }),
      );
      expect(
        (await call(handler, "/request-password-reset", { email })).status,
      ).toBe(200);
      const expiredLink = await findMail(email, "Reset your Kairn password");
      const expiredToken = resetToken(expiredLink);
      await database.pool.query(
        "UPDATE kairn_auth.verification SET expires_at = now() - interval '1 second' WHERE value = $1",
        [id],
      );
      expect(
        (
          await call(handler, "/reset-password", {
            token: expiredToken,
            newPassword: resetPassword,
          })
        ).status,
      ).toBe(400);
      expect(
        (await call(handler, "/request-password-reset", { email })).status,
      ).toBe(200);
      let next: URL | undefined;
      await expect
        .poll(
          async () => {
            next = await findMail(email, "Reset your Kairn password");
            return resetToken(next) !== expiredToken;
          },
          { timeout: 12_000 },
        )
        .toBe(true);
      if (!next) throw new Error("No second recovery link.");
      const body = { token: resetToken(next), newPassword: resetPassword };
      expect((await call(handler, "/reset-password", body)).status).toBe(202);
      expect((await call(handler, "/reset-password", body)).status).toBe(400);
      expect(
        (await call(handler, "/get-session", undefined, previous).then(
          (response) => response.json(),
        )) === null,
      ).toBe(true);
      expect(
        (await call(handler, "/sign-in/email", { email, password })).status,
      ).toBe(401);
      expect(
        (
          await call(handler, "/sign-in/email", {
            email,
            password: resetPassword,
          })
        ).status,
      ).toBe(200);
    }, 30_000);

    it.runIf(process.env.KAIRN_AUTH_RECOVERY_TEST === "isolated")(
      "replays confirmed credentials restrictions into a restored identity and closes on an unknown journal tail",
      async () => {
        // Run only in a disposable database. Replay invalidates every session and verification row.
        const records: Awaited<ReturnType<RestrictionJournal["read"]>>[] = [];
        let available = false;
        const journal: RestrictionJournal = {
          async append(event) {
            if (!available) throw new Error("Fixture destination unavailable");
            const existing = records.find((item) => item.event.id === event.id);
            if (existing) return existing.receipt;
            const receipt = {
              eventId: event.id,
              sequence: records.length + 1,
              digest: restrictionDigest(event),
              receipt: `fixture-${event.id}`,
            };
            records.push({ event, receipt });
            return receipt;
          },
          async head() {
            if (!available) throw new Error("Fixture destination unavailable");
            return records.length;
          },
          async read(sequence) {
            return records[sequence - 1];
          },
        };
        const scoped = createAuth(database.db, {
          ...config,
          boss,
          journal,
        }).handler;
        const email = accountEmail();
        const id = await signUp(scoped, email);
        await verify(scoped, email);
        const previous = cookie(
          await call(scoped, "/sign-in/email", { email, password }),
        );
        const snapshot = (
          await owner.pool.query(
            "SELECT password FROM kairn_auth.account WHERE user_id = $1",
            [id],
          )
        ).rows[0];
        expect(
          (await call(scoped, "/request-password-reset", { email })).status,
        ).toBe(200);
        const token = resetToken(
          await findMail(email, "Reset your Kairn password"),
        );
        const response = await call(scoped, "/reset-password", {
          token,
          newPassword: resetPassword,
        });
        expect(response.status).toBe(202);
        const { eventId } = await response.json();
        expect(
          (await call(scoped, "/sign-in/email", { email, password })).status,
        ).toBe(401);
        available = true;
        const newPassword = { email, password: resetPassword };
        const current = cookie(
          await call(scoped, "/sign-in/email", newPassword),
        );
        cookie(await call(scoped, "/sign-in/email", newPassword));
        const devices = await call(scoped, "/devices", undefined, current).then(
          (response) => response.json(),
        );
        const other = devices.devices.find(
          (device: { id: string }) => device.id !== devices.currentDeviceId,
        );
        const confirmed = await call(
          scoped,
          "/devices/revoke",
          { id: other.id },
          current,
        );
        expect(confirmed.status).toBe(200);
        expect((await confirmed.json()).confirmation).toBe("confirmed");
        const { confirmRestriction } = await import(
          "../../packages/backend/src/modules/lifecycle/identity-restrictions"
        );
        await confirmRestriction(database.db, journal, eventId);
        await confirmRestriction(database.db, journal, eventId);
        expect(records.map(({ event }) => event.operation)).toEqual([
          "device_session_revoked",
          "credentials_changed",
        ]);

        await owner.pool.query(
          "UPDATE kairn_auth.account SET password = $1 WHERE user_id = $2",
          [snapshot.password, id],
        );
        await owner.pool.query(
          "UPDATE kairn.accounts SET security_generation = 1 WHERE id = $1",
          [id],
        );
        await owner.pool.query(
          "INSERT INTO kairn_auth.verification (identifier, value, expires_at) VALUES ($1, $2, now() + interval '30 minutes')",
          [`reset-password:${token}`, id],
        );
        const epoch = randomUUID();
        const recovered = createAuth(database.db, {
          ...config,
          epoch,
          boss,
          journal,
        }).handler;
        available = false;
        await expect(
          replayIdentityRestrictions(owner.db, journal, epoch),
        ).rejects.toThrow("Fixture destination unavailable");
        await initializeLocalIdentity(database.db, localRecoveryEpoch);
        expect(
          (await call(scoped, "/get-session", undefined, previous)).status,
        ).toBe(503);
        expect(
          (await call(recovered, "/sign-in/email", { email, password })).status,
        ).toBe(503);
        available = true;
        await replayIdentityRestrictions(owner.db, journal, epoch);
        expect(
          (await call(recovered, "/sign-in/email", { email, password })).status,
        ).toBe(403);
        expect(
          (
            await call(recovered, "/reset-password", {
              token,
              newPassword: resetPassword,
            })
          ).status,
        ).toBe(400);
        const restricted = await owner.pool.query(
          "SELECT restricted_at IS NOT NULL AS restricted, security_generation FROM kairn.accounts WHERE id = $1",
          [id],
        );
        expect(restricted.rows[0]).toEqual({
          restricted: true,
          security_generation: 3,
        });
        expect(epochSigningSecret(config.secret, epoch)).not.toBe(
          epochSigningSecret(config.secret, localRecoveryEpoch),
        );
      },
      45_000,
    );
  },
);
