import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { createApp } from "../../apps/server/src/app";
import { createJourneyOperations } from "../../apps/server/src/journey-operations";
import {
  createAuth,
  createCompanionSetupService,
  createOnboardingService,
  createProfileService,
  initializeLocalIdentity,
  localRecoveryEpoch,
  openDatabase,
  openJobQueue,
  registerIdentityRestrictions,
  replayIdentityRestrictions,
} from "../../packages/backend/src/index";
import { identityEpoch } from "../../packages/backend/src/modules/identity/state";
import { restrictionQueue } from "../../packages/backend/src/modules/lifecycle/identity-restrictions";
import {
  type RestrictionEvent,
  type RestrictionJournal,
  restrictionDigest,
} from "../../packages/backend/src/modules/lifecycle/restriction-journal";
import {
  journeyPeoplePage,
  membershipRestrictionResult,
} from "../../packages/contracts/src/journeys";

const origin = "http://kairn.test";
const journeys = "/api/v1/journeys";
const password = "Synthetic-membership-password";
type Account = { id: string; cookie: string; email: string };

describe.runIf(process.env.KAIRN_JOURNEY_TEST === "isolated")(
  "journey membership restrictions",
  () => {
    const runtime = openDatabase(process.env.KAIRN_TEST_DATABASE_URL ?? "");
    const owner = openDatabase(
      process.env.KAIRN_TEST_MIGRATION_DATABASE_URL ?? "",
    );
    const boss = openJobQueue(process.env.KAIRN_TEST_DATABASE_URL ?? "");
    const records: Awaited<ReturnType<RestrictionJournal["read"]>>[] = [];
    let dropAcknowledgment = false;
    let appendAvailable = true;
    let requests = 0;
    const journal: RestrictionJournal = {
      async append(event) {
        if (!appendAvailable)
          throw new Error("Fixture journal unavailable before append");
        const digest = restrictionDigest(event);
        let record = records.find((entry) => entry.event.id === event.id);
        if (record && record.receipt.digest !== digest)
          throw new Error("Fixture event digest changed");
        if (!record) {
          record = {
            event,
            receipt: {
              eventId: event.id,
              sequence: records.length + 1,
              digest,
              receipt: `fixture/${event.id}`,
            },
          };
          records.push(record);
        }
        if (dropAcknowledgment)
          throw new Error("Fixture journal dropped the acknowledgement");
        return record.receipt;
      },
      async head() {
        return records.length;
      },
      async read(sequence) {
        const record = records[sequence - 1];
        if (!record) throw new Error("Fixture journal sequence is missing");
        return record;
      },
    };
    const config = {
      baseURL: origin,
      secret: randomBytes(32).toString("hex"),
      boss,
      mailKey: randomBytes(32).toString("hex"),
      journal,
    };
    function application(epoch: string) {
      const settings = { ...config, epoch };
      const auth = createAuth(runtime.db, settings);
      const operations = createJourneyOperations(auth, settings);
      return createApp({
        authHandler: auth.handler,
        checkReadiness: async () => {},
        journeys: operations,
        workspace: {
          ...operations,
          onboarding: createOnboardingService(auth),
          companionSetup: createCompanionSetupService(auth),
          profile: createProfileService(auth),
        },
      });
    }
    const app = application(localRecoveryEpoch);

    function post(
      path: string,
      body: object,
      account?: Account,
      operationId?: string,
      target = app,
      requestOrigin = origin,
    ) {
      const headers = new Headers({
        "Content-Type": "application/json",
        Origin: requestOrigin,
        "X-Forwarded-For": `198.51.100.${++requests}`,
      });
      if (account) {
        headers.set("Cookie", account.cookie);
        headers.set("X-Expected-Account", account.id);
      }
      if (operationId) headers.set("Idempotency-Key", operationId);
      return target.request(`${origin}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers,
      });
    }

    function read(path: string, account: Account, target = app) {
      return target.request(`${origin}${path}`, {
        headers: { Cookie: account.cookie, "X-Expected-Account": account.id },
      });
    }

    async function signIn(email: string, target = app) {
      const response = await post(
        "/api/auth/sign-in/email",
        { email, password },
        undefined,
        undefined,
        target,
      );
      expect(response.status).toBe(200);
      const cookie = response.headers
        .getSetCookie()
        .find((value) => value.includes("session_token="))
        ?.split(";")[0];
      if (!cookie) throw new Error("Fixture session is missing");
      return cookie;
    }

    async function member(): Promise<Account> {
      const email = `membership-${randomUUID()}@example.test`;
      const response = await post("/api/auth/sign-up/email", {
        email,
        password,
        name: "Membership fixture",
      });
      expect(response.status).toBe(200);
      const id = String((await response.json()).user.id);
      await owner.pool.query(
        'update kairn_auth."user" set email_verified = true where id = $1',
        [id],
      );
      return { id, email, cookie: await signIn(email) };
    }

    async function createJourney(account: Account) {
      const response = await post(
        journeys,
        {
          title: "Private membership fixture",
          intendedStart: "2030-06-14T07:30",
          timeZone: "Asia/Kolkata",
        },
        account,
        randomUUID(),
      );
      expect(response.status).toBe(201);
      return String((await response.json()).id);
    }

    async function addMember(
      journeyId: string,
      account: Account,
      administrator = false,
    ) {
      const {
        rows: [membership],
      } = await owner.pool.query(
        "insert into kairn.journey_memberships (journey_id, account_id) values ($1, $2) returning generation",
        [journeyId, account.id],
      );
      if (administrator) {
        await owner.pool.query(
          "insert into kairn.journey_capabilities (journey_id, account_id, capability) values ($1, $2, 'administrator')",
          [journeyId, account.id],
        );
      }
      return String(membership.generation);
    }

    function removePath(journeyId: string, account: Account) {
      return `${journeys}/${journeyId}/members/${account.id}/remove`;
    }

    function remove(
      journeyId: string,
      actor: Account,
      account: Account,
      membershipGeneration: string,
      key = randomUUID(),
    ) {
      return post(
        removePath(journeyId, account),
        { membershipGeneration },
        actor,
        key,
      );
    }

    function leave(
      journeyId: string,
      account: Account,
      membershipGeneration: string,
      key = randomUUID(),
    ) {
      return post(
        `${journeys}/${journeyId}/leave`,
        { membershipGeneration },
        account,
        key,
      );
    }

    async function restrictionState(eventId: string) {
      const { rows } = await owner.pool.query(
        "select journal_sequence, journal_receipt from kairn.restriction_events where id = $1",
        [eventId],
      );
      return rows[0];
    }

    async function restoreMembership(
      journeyId: string,
      account: Account,
      generation: string,
      missingEvents: string[],
    ) {
      // Restore a snapshot with an active membership and without the later local restrictions.
      await owner.pool.query(
        "delete from kairn.membership_restriction_attempts where event_id = any($1::uuid[])",
        [missingEvents],
      );
      await owner.pool.query(
        "delete from kairn.restriction_events where id = any($1::uuid[])",
        [missingEvents],
      );
      await owner.pool.query(
        "delete from kairn.audit_events where id = any($1::uuid[])",
        [missingEvents],
      );
      await owner.pool.query(
        "update kairn.journey_memberships set revoked_at = null, generation = $3 where journey_id = $1 and account_id = $2",
        [journeyId, account.id, generation],
      );
      await owner.pool.query(
        "update kairn.journeys set policy_generation = 1 where id = $1",
        [journeyId],
      );
    }

    beforeAll(async () => {
      await initializeLocalIdentity(runtime.db, localRecoveryEpoch);
      await boss.start();
    });

    afterAll(async () => {
      await boss.stop();
      await Promise.all([runtime.pool.end(), owner.pool.end()]);
    });

    it("commits a scoped deny, closes the removed inviter's mail, and reconciles a lost journal reply", async () => {
      const [organiser, participant, outsider] = await Promise.all([
        member(),
        member(),
        member(),
      ]);
      const first = await createJourney(organiser);
      const second = await createJourney(organiser);
      const generation = await addMember(first, participant, true);
      await addMember(second, participant);
      const inboxPath = `${journeys}/${first}/invitations`;
      const batch = await post(
        inboxPath,
        { emails: ["pending-membership@example.test"] },
        participant,
        randomUUID(),
      );
      expect(batch.status).toBe(200);
      const {
        items: [{ invitationId }],
      } = await batch.json();
      const expected = { membershipGeneration: generation };
      expect(
        (await remove(first, outsider, participant, generation)).status,
      ).toBe(404);
      expect(
        (
          await post(
            removePath(first, participant),
            expected,
            organiser,
            randomUUID(),
            app,
            "https://foreign.example.test",
          )
        ).status,
      ).toBe(403);
      const wrongGeneration = await remove(
        first,
        organiser,
        participant,
        randomUUID(),
      );
      expect(wrongGeneration.status).toBe(409);
      expect(await wrongGeneration.json()).toMatchObject({
        code: "membership_changed",
      });

      const key = randomUUID();
      const failingQueue = vi
        .spyOn(boss, "send")
        .mockRejectedValueOnce(new Error("Fixture queue failure"));
      try {
        expect(
          (await remove(first, organiser, participant, generation, key)).status,
        ).toBe(503);
      } finally {
        failingQueue.mockRestore();
      }
      expect((await read(`${journeys}/${first}`, participant)).status).toBe(
        200,
      );
      const before = await owner.pool.query(
        "select policy_generation from kairn.journeys where id = $1",
        [first],
      );
      expect(before.rows).toEqual([{ policy_generation: 1 }]);

      dropAcknowledgment = true;
      let eventId: string;
      try {
        const response = await remove(
          first,
          organiser,
          participant,
          generation,
          key,
        );
        expect(response.status).toBe(202);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        const pending = membershipRestrictionResult.parse(
          await response.json(),
        );
        expect(pending.confirmation).toBe("pending");
        eventId = pending.eventId;
        expect(await restrictionState(eventId)).toEqual({
          journal_sequence: null,
          journal_receipt: null,
        });
        expect(
          records.find((record) => record.event.id === eventId)?.event,
        ).toEqual({
          version: 2,
          operation: "membership_revocation",
          id: eventId,
          journeyId: first,
          accountId: participant.id,
          membershipGeneration: generation,
          generation: 2,
        });
      } finally {
        dropAcknowledgment = false;
      }
      expect((await read(`${journeys}/${first}`, participant)).status).toBe(
        404,
      );
      expect(
        (await read(`${journeys}/${first}/people`, participant)).status,
      ).toBe(404);
      expect((await read(`${journeys}/${second}`, participant)).status).toBe(
        200,
      );
      expect((await read("/api/auth/get-session", participant)).status).toBe(
        200,
      );
      expect(
        await (await read("/api/v1/dashboard", participant)).json(),
      ).toMatchObject({ journeyCount: 1, nextJourney: { id: second } });
      const roster = journeyPeoplePage.parse(
        await (await read(`${journeys}/${first}/people`, organiser)).json(),
      );
      expect(roster.items.map(({ accountId }) => accountId)).toEqual([
        organiser.id,
      ]);
      const { rows: mail } = await owner.pool.query(
        `
      select invitation.decision, mail.delivery, mail.ciphertext
      from kairn.journey_invitations as invitation
      join kairn.journey_invitation_mail as mail on mail.id = invitation.id
      where invitation.id = $1
      `,
        [invitationId],
      );
      expect(mail).toEqual([
        { decision: "cancelled", delivery: "expired", ciphertext: null },
      ]);
      await expect(
        runtime.pool.query(
          "select * from kairn.membership_restriction_attempts",
        ),
      ).rejects.toMatchObject({ code: "42501" });
      const { rows: raw } = await runtime.pool.query(
        "select id from kairn.restriction_events where id = $1",
        [eventId],
      );
      expect(raw).toEqual([]);

      await registerIdentityRestrictions(
        boss,
        runtime.db,
        journal,
        localRecoveryEpoch,
      );
      try {
        await expect
          .poll(async () => (await restrictionState(eventId)).journal_receipt, {
            timeout: 8_000,
          })
          .toBe(`fixture/${eventId}`);
      } finally {
        await boss.offWork(restrictionQueue);
      }
      const confirmed = await remove(
        first,
        organiser,
        participant,
        generation,
        key,
      );
      expect(confirmed.status).toBe(200);
      expect(await confirmed.json()).toEqual({
        eventId,
        confirmation: "confirmed",
      });
      expect(
        records.filter((entry) => entry.event.id === eventId),
      ).toHaveLength(1);
      const conflict = await remove(
        second,
        organiser,
        participant,
        generation,
        key,
      );
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({
        code: "idempotency_conflict",
      });
    }, 25_000);

    it("blocks the last administrator and lets a participant retry leave after losing access", async () => {
      const [organiser, other, participant] = await Promise.all([
        member(),
        member(),
        member(),
      ]);
      const journeyId = await createJourney(organiser);
      const roster = journeyPeoplePage.parse(
        await (await read(`${journeys}/${journeyId}/people`, organiser)).json(),
      );
      const own = roster.items[0].membershipGeneration;
      const soleAdmin = await leave(journeyId, organiser, own);
      expect(soleAdmin.status).toBe(409);
      expect(await soleAdmin.json()).toMatchObject({
        code: "last_administrator",
      });
      const participantGeneration = await addMember(journeyId, participant);
      const denied = await remove(journeyId, participant, organiser, own);
      expect(denied.status).toBe(404);
      const key = randomUUID();
      const departure = await leave(
        journeyId,
        participant,
        participantGeneration,
        key,
      );
      expect(departure.status).toBe(200);
      expect((await read(`${journeys}/${journeyId}`, participant)).status).toBe(
        404,
      );
      expect(
        await (
          await leave(journeyId, participant, participantGeneration, key)
        ).json(),
      ).toEqual(await departure.json());

      const second = await addMember(journeyId, other, true);
      const concurrent = await Promise.all([
        leave(journeyId, organiser, own),
        leave(journeyId, other, second),
      ]);
      expect(concurrent.map(({ status }) => status).sort()).toEqual([200, 409]);
      expect(
        await concurrent.find(({ status }) => status === 409)?.json(),
      ).toMatchObject({ code: "last_administrator" });
      const { rows } = await owner.pool.query(
        "select account_id from kairn.journey_memberships where journey_id = $1 and revoked_at is null",
        [journeyId],
      );
      expect(rows).toHaveLength(1);
    });

    it("confirms earlier generations first so a later removal also survives an older backup", async () => {
      const [organiser, participant] = await Promise.all([member(), member()]);
      const journeyId = await createJourney(organiser);
      const firstGeneration = await addMember(journeyId, participant);
      const firstKey = randomUUID();
      const secondKey = randomUUID();
      let firstEventId: string;
      appendAvailable = false;
      try {
        const response = await remove(
          journeyId,
          organiser,
          participant,
          firstGeneration,
          firstKey,
        );
        expect(response.status).toBe(202);
        firstEventId = membershipRestrictionResult.parse(
          await response.json(),
        ).eventId;
        expect(records.some((record) => record.event.id === firstEventId)).toBe(
          false,
        );
      } finally {
        appendAvailable = true;
      }

      const secondGeneration = randomUUID();
      await owner.pool.query(
        "update kairn.journey_memberships set revoked_at = null, generation = $3 where journey_id = $1 and account_id = $2",
        [journeyId, participant.id, secondGeneration],
      );
      const response = await remove(
        journeyId,
        organiser,
        participant,
        secondGeneration,
        secondKey,
      );
      expect(response.status).toBe(202);
      const secondEventId = membershipRestrictionResult.parse(
        await response.json(),
      ).eventId;
      expect(records.some((record) => record.event.id === secondEventId)).toBe(
        false,
      );
      expect((await read(`${journeys}/${journeyId}`, participant)).status).toBe(
        404,
      );

      expect(
        (
          await remove(
            journeyId,
            organiser,
            participant,
            firstGeneration,
            firstKey,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await remove(
            journeyId,
            organiser,
            participant,
            secondGeneration,
            secondKey,
          )
        ).status,
      ).toBe(200);
      expect(records.slice(-2).map(({ event }) => event.id)).toEqual([
        firstEventId,
        secondEventId,
      ]);

      await restoreMembership(journeyId, participant, firstGeneration, [
        firstEventId,
        secondEventId,
      ]);
      const checkpoint = records.at(-1)?.receipt;
      if (!checkpoint) throw new Error("Fixture checkpoint missing");
      const epoch = "synthetic-earlier-generation-recovery-epoch";
      try {
        await replayIdentityRestrictions(owner.db, journal, epoch, checkpoint);
        const restored = application(epoch);
        const signedIn = {
          ...participant,
          cookie: await signIn(participant.email, restored),
        };
        expect(
          (await read(`${journeys}/${journeyId}`, signedIn, restored)).status,
        ).toBe(404);
        const { rows } = await owner.pool.query(
          "select policy_generation from kairn.journeys where id = $1",
          [journeyId],
        );
        expect(rows).toEqual([{ policy_generation: 3 }]);
      } finally {
        await owner.pool.query(
          "update kairn_auth.identity_recovery set epoch_digest = $1 where id = 'current'",
          [identityEpoch(localRecoveryEpoch)],
        );
      }
    }, 25_000);

    it("replays mixed identity and membership history before reopening a backup-era journey", async () => {
      const [organiser, participant] = await Promise.all([member(), member()]);
      const [first, second, rejoined] = await Promise.all([
        createJourney(organiser),
        createJourney(organiser),
        createJourney(organiser),
      ]);
      const generation = await addMember(first, participant);
      await addMember(second, participant);
      const earlier = await addMember(rejoined, participant);

      await signIn(participant.email);
      const { devices, currentDeviceId } = await (
        await read("/api/auth/devices", participant)
      ).json();
      const otherDevice = devices.find(
        (device: { id: string }) => device.id !== currentDeviceId,
      );
      const revoked = await post(
        "/api/auth/devices/revoke",
        { id: otherDevice.id },
        participant,
      );
      expect(revoked.status).toBe(200);
      const removal = await remove(first, organiser, participant, generation);
      expect(removal.status).toBe(200);
      const { eventId } = membershipRestrictionResult.parse(
        await removal.json(),
      );
      expect(
        (await remove(rejoined, organiser, participant, earlier)).status,
      ).toBe(200);
      expect(records.slice(-3).map(({ event }) => event.version)).toEqual([
        1, 2, 2,
      ]);

      const afterRejoin = randomUUID();
      await owner.pool.query(
        "update kairn.journey_memberships set revoked_at = null, generation = $3 where journey_id = $1 and account_id = $2",
        [rejoined, participant.id, afterRejoin],
      );
      await restoreMembership(first, participant, generation, [eventId]);
      const checkpoint = records.at(-1)?.receipt;
      if (!checkpoint) throw new Error("Fixture checkpoint missing");
      const epoch = "synthetic-mixed-restriction-recovery-epoch";
      const restored = application(epoch);
      try {
        for (const unknownVersion of [true, false]) {
          const broken: RestrictionJournal = {
            ...journal,
            async read(sequence) {
              const entry = await journal.read(sequence);
              if (sequence !== checkpoint.sequence) return entry;
              if (unknownVersion)
                return {
                  ...entry,
                  event: {
                    ...entry.event,
                    version: 99,
                  } as unknown as RestrictionEvent,
                };
              return {
                ...entry,
                receipt: { ...entry.receipt, digest: "a".repeat(64) },
              };
            },
          };
          await expect(
            replayIdentityRestrictions(owner.db, broken, epoch, checkpoint),
          ).rejects.toThrow();
          expect((await read(`${journeys}/${first}`, participant)).status).toBe(
            503,
          );
          expect(
            (
              await post(
                "/api/auth/sign-in/email",
                { email: participant.email, password },
                undefined,
                undefined,
                restored,
              )
            ).status,
          ).toBe(503);
          const { rows } = await owner.pool.query(
            "select policy_generation from kairn.journeys where id = $1",
            [first],
          );
          expect(rows[0].policy_generation).toBe(1);
        }
        await replayIdentityRestrictions(owner.db, journal, epoch, checkpoint);
        const signedIn = {
          ...participant,
          cookie: await signIn(participant.email, restored),
        };
        expect(
          (await read(`${journeys}/${first}`, signedIn, restored)).status,
        ).toBe(404);
        expect(
          (await read(`${journeys}/${second}`, signedIn, restored)).status,
        ).toBe(200);
        expect(
          (await read(`${journeys}/${rejoined}`, signedIn, restored)).status,
        ).toBe(200);
        expect(
          await (await read("/api/v1/dashboard", signedIn, restored)).json(),
        ).toMatchObject({ journeyCount: 2 });
        const { rows } = await owner.pool.query(
          "select policy_generation from kairn.journeys where id = $1",
          [first],
        );
        expect(rows).toEqual([{ policy_generation: 2 }]);
        const { rows: membership } = await owner.pool.query(
          "select generation, revoked_at from kairn.journey_memberships where journey_id = $1 and account_id = $2",
          [rejoined, participant.id],
        );
        expect(membership).toEqual([
          { generation: afterRejoin, revoked_at: null },
        ]);
      } finally {
        await owner.pool.query(
          "update kairn_auth.identity_recovery set epoch_digest = $1 where id = 'current'",
          [identityEpoch(localRecoveryEpoch)],
        );
      }
    }, 25_000);
  },
);
