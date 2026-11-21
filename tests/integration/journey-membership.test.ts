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
import {
  confirmRestriction,
  restrictionQueue,
} from "../../packages/backend/src/modules/lifecycle/identity-restrictions";
import {
  type RestrictionEvent,
  type RestrictionJournal,
  restrictionDigest,
} from "../../packages/backend/src/modules/lifecycle/restriction-journal";
import {
  type EditorialCapability,
  editorialCapabilityRemoval,
  journeyPeoplePage,
  membershipRestrictionResult,
  originalExportAuthorization,
  originalExportPage,
  originalExportRequest,
  sourceReviewNarrowing,
  sourceReviewWithdrawal,
} from "../../packages/contracts/src/journeys";

const origin = "http://kairn.test";
const journeys = "/api/v1/journeys";
const password = "Synthetic-membership-password";
const publicationConsent = "members_unlisted_public_v1";
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
      const address = requests++;
      const headers = new Headers({
        "Content-Type": "application/json",
        Origin: requestOrigin,
        "X-Forwarded-For": `198.18.${Math.floor(address / 254)}.${(address % 254) + 1}`,
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

    async function personalSource(account: Account) {
      const sourceId = randomUUID();
      const assetId = randomUUID();
      await owner.pool.query(
        "insert into kairn.sources (id, owner_id) values ($1, $2)",
        [sourceId, account.id],
      );
      await owner.pool.query(
        "insert into kairn.source_assets (id, source_id) values ($1, $2)",
        [assetId, sourceId],
      );
      return { sourceId, assetId };
    }

    function reviewPath(journeyId: string, sourceId: string) {
      return `${journeys}/${journeyId}/sources/${sourceId}/review`;
    }

    function allowPublication(
      path: string,
      account: Account,
      expectedRevision: number,
    ) {
      return post(
        path,
        {
          action: "allow_publication_reuse",
          consent: publicationConsent,
          expectedRevision,
        },
        account,
      );
    }

    async function originalExport(
      journeyId: string,
      sourceOwner: Account,
      recipient: Account,
      ...selections: (Awaited<ReturnType<typeof personalSource>> & {
        revision: number;
      })[]
    ) {
      const grantId = randomUUID();
      await owner.pool.query(
        "insert into kairn.original_export_grants (id, journey_id, owner_id, recipient_id, expires_at) values ($1, $2, $3, $4, now() + interval '1 day')",
        [grantId, journeyId, sourceOwner.id, recipient.id],
      );
      for (const { sourceId, assetId, revision } of selections) {
        await owner.pool.query(
          "insert into kairn.export_grant_assets (grant_id, journey_id, owner_id, source_id, asset_id, source_grant_revision) values ($1, $2, $3, $4, $5, $6)",
          [grantId, journeyId, sourceOwner.id, sourceId, assetId, revision],
        );
      }
      return grantId;
    }

    function exportPath(journeyId: string, grantId?: string) {
      const path = `${journeys}/${journeyId}/original-exports`;
      return grantId ? `${path}/${grantId}` : path;
    }

    const approval = { decision: "approve", metadataAcknowledged: true };

    async function requestExport(
      journeyId: string,
      contributor: Account,
      recipient: Account,
      assetIds: string[],
    ) {
      const response = await post(
        exportPath(journeyId),
        {
          ownerId: contributor.id,
          assetIds,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
        recipient,
        randomUUID(),
      );
      expect(response.status).toBe(201);
      return originalExportRequest.parse(await response.json());
    }

    async function approveExport(
      journeyId: string,
      contributor: Account,
      grantId: string,
    ) {
      const path = exportPath(journeyId, grantId);
      const approved = await post(`${path}/decision`, approval, contributor);
      expect(approved.status).toBe(200);
      expect(originalExportRequest.parse(await approved.json()).state).toBe(
        "approved",
      );
      return path;
    }

    function changeRole(
      journeyId: string,
      actor: Account,
      memberId: string,
      membershipGeneration: string,
      capability: EditorialCapability,
      expectedRevision: number,
      enabled: boolean,
    ) {
      return post(
        `${journeys}/${journeyId}/members/${memberId}/editorial-capability`,
        { membershipGeneration, capability, expectedRevision, enabled },
        actor,
      );
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

    it("limits review to current editorial members and leaves withdrawal with the source owner", async () => {
      const [organiser, contributor, coauthor, publisher, participant, admin] =
        await Promise.all(Array.from({ length: 6 }, () => member()));
      const journeyId = await createJourney(organiser);
      const otherJourney = await createJourney(coauthor);
      const [contributorGeneration, coauthorGeneration] = await Promise.all([
        addMember(journeyId, contributor),
        addMember(journeyId, coauthor),
        addMember(journeyId, publisher),
        addMember(journeyId, participant),
        addMember(journeyId, admin, true),
      ]);
      await owner.pool.query(
        "insert into kairn.journey_capabilities (journey_id, account_id, capability) values ($1, $2, 'coauthor'), ($1, $3, 'publisher')",
        [journeyId, coauthor.id, publisher.id],
      );
      const { sourceId, assetId } = await personalSource(contributor);
      const path = reviewPath(journeyId, sourceId);
      expect((await app.request(`${origin}${path}`)).status).toBe(401);
      expect((await read(path, coauthor)).status).toBe(404);
      const own = await read(path, contributor);
      expect(own.status).toBe(200);
      expect(own.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await own.json()).toEqual({
        sourceId,
        scope: "only_me",
        revision: 0,
      });

      const share = { action: "share", expectedRevision: 0 };
      expect((await post(path, share, organiser)).status).toBe(404);
      expect(
        (
          await post(
            path,
            share,
            contributor,
            undefined,
            app,
            "https://foreign.example.test",
          )
        ).status,
      ).toBe(403);
      expect(
        (await post(reviewPath(otherJourney, sourceId), share, contributor))
          .status,
      ).toBe(404);
      const shared = { sourceId, scope: "journey_review", revision: 1 };
      for (const response of await Promise.all([
        post(path, share, contributor),
        post(path, share, contributor),
      ])) {
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(shared);
      }
      const { rows: changes } = await owner.pool.query(
        "select action from kairn.audit_events where target_id = $1 and target_kind = 'source'",
        [sourceId],
      );
      expect(changes).toEqual([{ action: "source_shared_for_review" }]);
      for (const reviewer of [coauthor, publisher]) {
        const response = await read(path, reviewer);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(shared);
      }
      for (const denied of [participant, admin]) {
        expect((await read(path, denied)).status).toBe(404);
      }
      expect(
        (await read(reviewPath(otherJourney, sourceId), coauthor)).status,
      ).toBe(404);
      expect(
        (
          await post(
            path,
            { action: "withdraw", expectedRevision: 1 },
            publisher,
          )
        ).status,
      ).toBe(404);
      expect(
        (await remove(journeyId, organiser, coauthor, coauthorGeneration))
          .status,
      ).toBe(200);
      expect((await read(path, coauthor)).status).toBe(404);
      expect(
        (await leave(journeyId, contributor, contributorGeneration)).status,
      ).toBe(200);
      expect((await read(path, publisher)).status).toBe(200);
      expect((await post(path, share, contributor)).status).toBe(404);

      const withdraw = { action: "withdraw", expectedRevision: 1 };
      appendAvailable = false;
      let eventId: string;
      try {
        const response = await post(path, withdraw, contributor);
        expect(response.status).toBe(202);
        const result = sourceReviewWithdrawal.parse(await response.json());
        expect(result).toMatchObject({ revision: 2, confirmation: "pending" });
        eventId = result.eventId;
        expect((await read(path, publisher)).status).toBe(404);
        expect(await (await read(path, contributor)).json()).toEqual({
          sourceId,
          scope: "only_me",
          revision: 2,
        });
      } finally {
        appendAvailable = true;
      }
      await expect(
        boss.getJobById(restrictionQueue, eventId),
      ).resolves.toMatchObject({
        id: eventId,
        data: { id: eventId },
      });
      await confirmRestriction(runtime.db, journal, eventId);
      expect((await restrictionState(eventId)).journal_receipt).toBe(
        `fixture/${eventId}`,
      );
      const confirmed = await post(path, withdraw, contributor);
      expect(confirmed.status).toBe(200);
      expect(await confirmed.json()).toEqual({
        eventId,
        revision: 2,
        confirmation: "confirmed",
      });
      expect(records.filter(({ event }) => event.id === eventId)).toHaveLength(
        1,
      );
      await expect(
        runtime.pool.query("select id from kairn.source_assets"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        owner.pool.query(
          `select asset.id, source.owner_id
         from kairn.source_assets as asset join kairn.sources as source on source.id = asset.source_id
         where asset.id = $1 and asset.deleted_at is null and source.deleted_at is null`,
          [assetId],
        ),
      ).resolves.toMatchObject({
        rows: [{ id: assetId, owner_id: contributor.id }],
      });
    }, 25_000);

    it("replays scoped withdrawals onto older grants and preserves a newer explicit re-share", async () => {
      const [organiser, contributor] = await Promise.all([member(), member()]);
      const [first, second] = await Promise.all([
        createJourney(organiser),
        createJourney(organiser),
      ]);
      await Promise.all([
        addMember(first, contributor),
        addMember(second, contributor),
      ]);
      const [
        { sourceId: older },
        { sourceId: missing },
        alreadyWithdrawn,
        newerAsset,
      ] = await Promise.all(
        Array.from({ length: 4 }, () => personalSource(contributor)),
      );
      const newer = newerAsset.sourceId;
      const share = { action: "share", expectedRevision: 0 };
      const withdraw = { action: "withdraw", expectedRevision: 1 };
      expect(
        (await post(reviewPath(second, older), share, contributor)).status,
      ).toBe(200);
      const events: string[] = [];
      for (const sourceId of [
        older,
        missing,
        alreadyWithdrawn.sourceId,
        newer,
      ]) {
        const path = reviewPath(first, sourceId);
        expect((await post(path, share, contributor)).status).toBe(200);
        const response = await post(path, withdraw, contributor);
        expect(response.status).toBe(200);
        const { eventId } = sourceReviewWithdrawal.parse(await response.json());
        if (sourceId !== alreadyWithdrawn.sourceId) events.push(eventId);
        expect((await post(path, share, contributor)).status).toBe(409);
      }
      const current = await post(
        reviewPath(first, newer),
        { ...share, expectedRevision: 2 },
        contributor,
      );
      expect(current.status).toBe(200);
      expect(await current.json()).toEqual({
        sourceId: newer,
        scope: "journey_review",
        revision: 3,
      });
      expect(
        (await post(reviewPath(first, newer), withdraw, contributor)).status,
      ).toBe(409);
      expect(records.at(-1)?.event).toMatchObject({
        version: 3,
        operation: "source_withdrawal",
        accountId: contributor.id,
        journeyId: first,
        sourceId: newer,
        generation: 2,
      });
      const checkpoint = records.at(-1)?.receipt;
      if (!checkpoint) throw new Error("Fixture checkpoint missing");
      await owner.pool.query(
        "delete from kairn.restriction_events where id = any($1::uuid[])",
        [events],
      );
      await owner.pool.query(
        "delete from kairn.audit_events where id = any($1::uuid[])",
        [events],
      );
      await owner.pool.query(
        "update kairn.source_grants set withdrawn_at = null, revision = 1 where journey_id = $1 and source_id = $2",
        [first, older],
      );
      await owner.pool.query(
        "delete from kairn.source_grants where journey_id = $1 and source_id = $2",
        [first, missing],
      );
      // A pre-0014 backup can retain an export even after recording withdrawal.
      const legacyExport = await originalExport(
        first,
        contributor,
        organiser,
        { ...alreadyWithdrawn, revision: 1 },
        { ...newerAsset, revision: 3 },
      );
      const unaffectedExport = await originalExport(
        first,
        contributor,
        organiser,
        {
          ...newerAsset,
          revision: 3,
        },
      );

      const epoch = "synthetic-source-withdrawal-recovery-epoch";
      try {
        await replayIdentityRestrictions(owner.db, journal, epoch, checkpoint);
        const restored = application(epoch);
        const reviewer = {
          ...organiser,
          cookie: await signIn(organiser.email, restored),
        };
        const sourceOwner = {
          ...contributor,
          cookie: await signIn(contributor.email, restored),
        };
        for (const sourceId of [older, missing, alreadyWithdrawn.sourceId]) {
          const path = reviewPath(first, sourceId);
          expect((await read(path, reviewer, restored)).status).toBe(404);
          expect(
            await (await read(path, sourceOwner, restored)).json(),
          ).toEqual({
            sourceId,
            scope: "only_me",
            revision: 2,
          });
          expect(
            (await post(path, share, sourceOwner, undefined, restored)).status,
          ).toBe(409);
        }
        expect(
          (await read(reviewPath(first, newer), reviewer, restored)).status,
        ).toBe(200);
        expect(
          (await read(reviewPath(second, older), reviewer, restored)).status,
        ).toBe(200);
        const { rows: exports } = await owner.pool.query(
          "select id, revoked_at from kairn.original_export_grants where id = any($1::uuid[])",
          [[legacyExport, unaffectedExport]],
        );
        expect(exports).toEqual(
          expect.arrayContaining([
            { id: legacyExport, revoked_at: expect.any(Date) },
            { id: unaffectedExport, revoked_at: null },
          ]),
        );
      } finally {
        await owner.pool.query(
          "update kairn_auth.identity_recovery set epoch_digest = $1 where id = 'current'",
          [identityEpoch(localRecoveryEpoch)],
        );
      }
    }, 25_000);
    it("assigns and revokes editorial roles independently and retries a pending revocation", async () => {
      const [organiser, memberAccount, participant] = await Promise.all([
        member(),
        member(),
        member(),
      ]);
      const journeyId = await createJourney(organiser);
      const generation = await addMember(journeyId, memberAccount);
      await addMember(journeyId, participant);
      const { sourceId } = await personalSource(organiser);
      const path = reviewPath(journeyId, sourceId);
      expect(
        (await post(path, { action: "share", expectedRevision: 0 }, organiser))
          .status,
      ).toBe(200);
      expect((await read(path, memberAccount)).status).toBe(404);

      const assignCoauthor = () =>
        changeRole(
          journeyId,
          organiser,
          memberAccount.id,
          generation,
          "coauthor",
          0,
          true,
        );
      expect(
        (
          await changeRole(
            journeyId,
            participant,
            memberAccount.id,
            generation,
            "coauthor",
            0,
            true,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await post(
            `${journeys}/${journeyId}/members/${memberAccount.id}/editorial-capability`,
            {
              membershipGeneration: generation,
              capability: "administrator",
              expectedRevision: 0,
              enabled: true,
            },
            organiser,
          )
        ).status,
      ).toBe(400);
      for (const result of await Promise.all([
        assignCoauthor(),
        assignCoauthor(),
      ])) {
        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({ enabled: true, revision: 1 });
      }
      expect((await read(path, memberAccount)).status).toBe(200);
      const publisher = await changeRole(
        journeyId,
        organiser,
        memberAccount.id,
        generation,
        "publisher",
        0,
        true,
      );
      expect(await publisher.json()).toEqual({ enabled: true, revision: 1 });
      const { rows: audits } = await owner.pool.query(
        "select action from kairn.audit_events where journey_id = $1 and target_id = $2 order by action",
        [journeyId, memberAccount.id],
      );
      expect(audits).toEqual([
        { action: "coauthor_assigned" },
        { action: "publisher_assigned" },
      ]);

      const revokeCoauthor = () =>
        changeRole(
          journeyId,
          organiser,
          memberAccount.id,
          generation,
          "coauthor",
          1,
          false,
        );
      dropAcknowledgment = true;
      let eventId: string;
      try {
        const response = await revokeCoauthor();
        expect(response.status).toBe(202);
        const result = editorialCapabilityRemoval.parse(await response.json());
        eventId = result.eventId;
        expect(result).toMatchObject({
          enabled: false,
          revision: 2,
          confirmation: "pending",
        });
        expect((await read(path, memberAccount)).status).toBe(200);
        const roster = journeyPeoplePage.parse(
          await (
            await read(`${journeys}/${journeyId}/people`, organiser)
          ).json(),
        );
        expect(
          roster.items.find(({ accountId }) => accountId === memberAccount.id),
        ).toMatchObject({
          capabilities: ["publisher"],
          editorialRevisions: { coauthor: 2, publisher: 1 },
        });
      } finally {
        dropAcknowledgment = false;
      }
      await expect(
        boss.getJobById(restrictionQueue, eventId),
      ).resolves.toMatchObject({ id: eventId });
      await confirmRestriction(runtime.db, journal, eventId);
      const confirmed = await revokeCoauthor();
      expect(confirmed.status).toBe(200);
      expect(await confirmed.json()).toEqual({
        enabled: false,
        revision: 2,
        confirmation: "confirmed",
        eventId,
      });
      expect(records.filter(({ event }) => event.id === eventId)).toHaveLength(
        1,
      );
      expect((await assignCoauthor()).status).toBe(409);
      expect(
        (
          await changeRole(
            journeyId,
            organiser,
            memberAccount.id,
            generation,
            "publisher",
            1,
            false,
          )
        ).status,
      ).toBe(200);
      expect((await read(path, memberAccount)).status).toBe(404);
      expect(
        (await read(`${journeys}/${journeyId}`, memberAccount)).status,
      ).toBe(200);
      expect((await leave(journeyId, memberAccount, generation)).status).toBe(
        200,
      );
      const stale = await changeRole(
        journeyId,
        organiser,
        memberAccount.id,
        generation,
        "coauthor",
        2,
        true,
      );
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ code: "membership_changed" });
    }, 25_000);

    it("replays an editorial revocation on the matching membership and preserves newer grants", async () => {
      const [organiser, recipient] = await Promise.all([member(), member()]);
      const [older, newer, rejoined] = await Promise.all(
        Array.from({ length: 3 }, () => createJourney(organiser)),
      );
      const [olderGeneration, newerGeneration, originalGeneration] =
        await Promise.all(
          [older, newer, rejoined].map((journeyId) =>
            addMember(journeyId, recipient),
          ),
        );
      const events: string[] = [];
      for (const [journeyId, generation] of [
        [older, olderGeneration],
        [newer, newerGeneration],
        [rejoined, originalGeneration],
      ]) {
        expect(
          (
            await changeRole(
              journeyId,
              organiser,
              recipient.id,
              generation,
              "coauthor",
              0,
              true,
            )
          ).status,
        ).toBe(200);
        expect(
          (
            await changeRole(
              journeyId,
              organiser,
              recipient.id,
              generation,
              "publisher",
              0,
              true,
            )
          ).status,
        ).toBe(200);
        const response = await changeRole(
          journeyId,
          organiser,
          recipient.id,
          generation,
          "coauthor",
          1,
          false,
        );
        expect(response.status).toBe(200);
        events.push(
          editorialCapabilityRemoval.parse(await response.json()).eventId,
        );
      }
      expect(
        (
          await changeRole(
            newer,
            organiser,
            recipient.id,
            newerGeneration,
            "coauthor",
            2,
            true,
          )
        ).status,
      ).toBe(200);
      const rejoinedGeneration = randomUUID();
      await owner.pool.query(
        "delete from kairn.restriction_events where id = any($1::uuid[])",
        [events],
      );
      await owner.pool.query(
        "delete from kairn.audit_events where id = any($1::uuid[])",
        [events],
      );
      await owner.pool.query(
        "update kairn.journey_memberships set coauthor_revision = 1 where journey_id in ($1, $2) and account_id = $3",
        [older, rejoined, recipient.id],
      );
      await owner.pool.query(
        "update kairn.journey_memberships set generation = $3 where journey_id = $1 and account_id = $2",
        [rejoined, recipient.id, rejoinedGeneration],
      );
      await owner.pool.query(
        "insert into kairn.journey_capabilities (journey_id, account_id, capability) values ($1, $3, 'coauthor'), ($2, $3, 'coauthor')",
        [older, rejoined, recipient.id],
      );
      const checkpoint = records.at(-1)?.receipt;
      if (!checkpoint) throw new Error("Fixture checkpoint missing");
      expect(records.at(-1)?.event).toMatchObject({
        version: 4,
        operation: "capability_removal",
        capability: "coauthor",
        journeyId: rejoined,
        accountId: recipient.id,
        membershipGeneration: originalGeneration,
        generation: 2,
      });
      const epoch = "synthetic-editorial-revocation-recovery-epoch";
      try {
        await replayIdentityRestrictions(owner.db, journal, epoch, checkpoint);
        const restored = application(epoch);
        const admin = {
          ...organiser,
          cookie: await signIn(organiser.email, restored),
        };
        for (const [journeyId, generation, revision, capabilities] of [
          [older, olderGeneration, 2, ["publisher"]],
          [newer, newerGeneration, 3, ["coauthor", "publisher"]],
          [rejoined, rejoinedGeneration, 1, ["coauthor", "publisher"]],
        ] as const) {
          const result = await read(
            `${journeys}/${journeyId}/people`,
            admin,
            restored,
          );
          expect(result.status).toBe(200);
          const roster = journeyPeoplePage.parse(await result.json());
          expect(
            roster.items.find(({ accountId }) => accountId === recipient.id),
          ).toMatchObject({
            membershipGeneration: generation,
            capabilities,
            editorialRevisions: { coauthor: revision, publisher: 1 },
          });
        }
      } finally {
        await owner.pool.query(
          "update kairn_auth.identity_recovery set epoch_digest = $1 where id = 'current'",
          [identityEpoch(localRecoveryEpoch)],
        );
      }
    }, 25_000);
    it("waits for an older membership removal before confirming a rejoined member’s role revocation", async () => {
      const [organiser, recipient] = await Promise.all([member(), member()]);
      const journeyId = await createJourney(organiser);
      const original = await addMember(journeyId, recipient);
      expect(
        (
          await changeRole(
            journeyId,
            organiser,
            recipient.id,
            original,
            "coauthor",
            0,
            true,
          )
        ).status,
      ).toBe(200);
      const headBefore = await journal.head();
      const rejoined = randomUUID();
      let membershipEvent: string;
      appendAvailable = false;
      try {
        const response = await remove(
          journeyId,
          organiser,
          recipient,
          original,
        );
        expect(response.status).toBe(202);
        membershipEvent = membershipRestrictionResult.parse(
          await response.json(),
        ).eventId;
        // Mirror the new generation created by accepting a fresh invitation.
        await owner.pool.query(
          "update kairn.journey_memberships set revoked_at = null, generation = $3 where journey_id = $1 and account_id = $2",
          [journeyId, recipient.id, rejoined],
        );
        expect(
          (
            await changeRole(
              journeyId,
              organiser,
              recipient.id,
              rejoined,
              "coauthor",
              1,
              true,
            )
          ).status,
        ).toBe(200);
      } finally {
        appendAvailable = true;
      }
      const revokeCurrent = () =>
        changeRole(
          journeyId,
          organiser,
          recipient.id,
          rejoined,
          "coauthor",
          2,
          false,
        );
      const blocked = await revokeCurrent();
      expect(blocked.status).toBe(202);
      const { eventId: roleEvent } = editorialCapabilityRemoval.parse(
        await blocked.json(),
      );
      expect(await journal.head()).toBe(headBefore);
      await confirmRestriction(runtime.db, journal, membershipEvent);
      const confirmed = await revokeCurrent();
      expect(confirmed.status).toBe(200);
      expect(await confirmed.json()).toMatchObject({
        eventId: roleEvent,
        confirmation: "confirmed",
      });
      expect(records.slice(-2).map(({ event }) => event.id)).toEqual([
        membershipEvent,
        roleEvent,
      ]);

      await restoreMembership(journeyId, recipient, original, [
        membershipEvent,
        roleEvent,
      ]);
      await owner.pool.query(
        "update kairn.journey_memberships set coauthor_revision = 1 where journey_id = $1 and account_id = $2",
        [journeyId, recipient.id],
      );
      await owner.pool.query(
        "insert into kairn.journey_capabilities (journey_id, account_id, capability) values ($1, $2, 'coauthor')",
        [journeyId, recipient.id],
      );
      const checkpoint = records.at(-1)?.receipt;
      if (!checkpoint) throw new Error("Fixture checkpoint missing");
      const epoch = "synthetic-rejoined-editorial-recovery-epoch";
      try {
        await replayIdentityRestrictions(owner.db, journal, epoch, checkpoint);
        const restored = application(epoch);
        const signedIn = {
          ...recipient,
          cookie: await signIn(recipient.email, restored),
        };
        expect(
          (await read(`${journeys}/${journeyId}`, signedIn, restored)).status,
        ).toBe(404);
      } finally {
        await owner.pool.query(
          "update kairn_auth.identity_recovery set epoch_digest = $1 where id = 'current'",
          [identityEpoch(localRecoveryEpoch)],
        );
      }
    }, 25_000);
    it("requires owner consent for publication reuse and narrows a grant even after the owner leaves", async () => {
      const [publisher, contributor] = await Promise.all([member(), member()]);
      const journeyId = await createJourney(publisher);
      const membershipGeneration = await addMember(journeyId, contributor);
      const asset = await personalSource(contributor);
      const path = reviewPath(journeyId, asset.sourceId);
      await owner.pool.query(
        "insert into kairn.source_grants (journey_id, source_id, owner_id, scope) values ($1, $2, $3, 'publication_reuse')",
        [journeyId, asset.sourceId, contributor.id],
      );
      expect(await (await read(path, publisher)).json()).toEqual({
        sourceId: asset.sourceId,
        scope: "journey_review",
        revision: 1,
      });
      expect((await allowPublication(path, publisher, 1)).status).toBe(404);
      for (const consent of [undefined, "members_only"]) {
        const rejected = await post(
          path,
          { action: "allow_publication_reuse", consent, expectedRevision: 1 },
          contributor,
        );
        expect(rejected.status).toBe(400);
      }
      const granted = {
        sourceId: asset.sourceId,
        scope: "publication_reuse",
        revision: 2,
      };
      for (const response of await Promise.all([
        allowPublication(path, contributor, 1),
        allowPublication(path, contributor, 1),
      ])) {
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(granted);
      }
      expect(await (await read(path, publisher)).json()).toEqual(granted);
      expect(
        (
          await post(
            path,
            { action: "share", expectedRevision: 2 },
            contributor,
          )
        ).status,
      ).toBe(409);
      const {
        rows: [before],
      } = await owner.pool.query(
        "select policy_generation from kairn.journeys where id = $1",
        [journeyId],
      );
      const affected = await originalExport(journeyId, contributor, publisher, {
        ...asset,
        revision: 2,
      });
      const otherAsset = await personalSource(contributor);
      const otherPath = reviewPath(journeyId, otherAsset.sourceId);
      expect(
        (
          await post(
            otherPath,
            { action: "share", expectedRevision: 0 },
            contributor,
          )
        ).status,
      ).toBe(200);
      const unaffected = await originalExport(
        journeyId,
        contributor,
        publisher,
        { ...otherAsset, revision: 1 },
      );
      expect(
        (await leave(journeyId, contributor, membershipGeneration)).status,
      ).toBe(200);
      expect((await allowPublication(path, contributor, 2)).status).toBe(404);

      const narrow = { action: "narrow_to_review", expectedRevision: 2 };
      appendAvailable = false;
      let eventId: string;
      try {
        const denied = await post(path, narrow, contributor);
        expect(denied.status).toBe(202);
        const receipt = sourceReviewNarrowing.parse(await denied.json());
        eventId = receipt.eventId;
        expect(receipt).toMatchObject({
          scope: "journey_review",
          revision: 3,
          confirmation: "pending",
        });
        expect(await (await read(path, publisher)).json()).toEqual({
          ...granted,
          scope: "journey_review",
          revision: 3,
        });
        const { rows } = await owner.pool.query(
          "select id, revoked_at from kairn.original_export_grants where id = any($1::uuid[])",
          [[affected, unaffected]],
        );
        expect(rows).toEqual(
          expect.arrayContaining([
            { id: affected, revoked_at: expect.any(Date) },
            { id: unaffected, revoked_at: null },
          ]),
        );
      } finally {
        appendAvailable = true;
      }
      await expect(
        boss.getJobById(restrictionQueue, eventId),
      ).resolves.toMatchObject({ id: eventId });
      await confirmRestriction(runtime.db, journal, eventId);
      const confirmed = await post(path, narrow, contributor);
      expect(confirmed.status).toBe(200);
      expect(await confirmed.json()).toEqual({
        eventId,
        scope: "journey_review",
        revision: 3,
        confirmation: "confirmed",
      });
      const {
        rows: [after],
      } = await owner.pool.query(
        "select policy_generation from kairn.journeys where id = $1",
        [journeyId],
      );
      expect(after.policy_generation).toBe(before.policy_generation + 3);
      const { rows: audit } = await owner.pool.query(
        "select action from kairn.audit_events where journey_id = $1 and target_id = $2 order by action",
        [journeyId, asset.sourceId],
      );
      expect(audit).toEqual([
        { action: "source_grant_narrowing" },
        { action: "source_publication_reuse_allowed_v1" },
      ]);
    }, 25_000);

    it("replays source narrowing without opening review access or undoing later consent", async () => {
      const [publisher, contributor] = await Promise.all([member(), member()]);
      const journeyId = await createJourney(publisher);
      await addMember(journeyId, contributor);
      const [older, missing, newer, withdrawn] = await Promise.all(
        Array.from({ length: 4 }, () => personalSource(contributor)),
      );
      const events: string[] = [];
      for (const { sourceId } of [older, missing, newer, withdrawn]) {
        const path = reviewPath(journeyId, sourceId);
        expect((await allowPublication(path, contributor, 0)).status).toBe(200);
        const narrowed = await post(
          path,
          { action: "narrow_to_review", expectedRevision: 1 },
          contributor,
        );
        expect(narrowed.status).toBe(200);
        events.push(sourceReviewNarrowing.parse(await narrowed.json()).eventId);
        expect((await allowPublication(path, contributor, 1)).status).toBe(409);
      }
      expect(
        (
          await allowPublication(
            reviewPath(journeyId, newer.sourceId),
            contributor,
            2,
          )
        ).status,
      ).toBe(200);
      const dependent = await originalExport(
        journeyId,
        contributor,
        publisher,
        { ...older, revision: 1 },
      );
      await owner.pool.query(
        "delete from kairn.restriction_events where id = any($1::uuid[])",
        [events],
      );
      await owner.pool.query(
        "delete from kairn.audit_events where id = any($1::uuid[])",
        [events],
      );
      await owner.pool.query(
        "update kairn.source_grants set revision = 1, scope = 'publication_reuse', publication_consent = $3 where journey_id = $1 and source_id = $2",
        [journeyId, older.sourceId, publicationConsent],
      );
      await owner.pool.query(
        "delete from kairn.source_grants where journey_id = $1 and source_id = $2",
        [journeyId, missing.sourceId],
      );
      await owner.pool.query(
        "update kairn.source_grants set revision = 1, withdrawn_at = now() where journey_id = $1 and source_id = $2",
        [journeyId, withdrawn.sourceId],
      );
      const checkpoint = records.at(-1)?.receipt;
      if (!checkpoint) throw new Error("Fixture checkpoint missing");
      expect(records.at(-1)?.event).toMatchObject({
        version: 5,
        operation: "source_grant_narrowing",
        accountId: contributor.id,
        sourceId: withdrawn.sourceId,
        journeyId,
        generation: 2,
      });
      const epoch = "synthetic-source-narrowing-recovery-epoch";
      try {
        await replayIdentityRestrictions(owner.db, journal, epoch, checkpoint);
        const restored = application(epoch);
        const editor = {
          ...publisher,
          cookie: await signIn(publisher.email, restored),
        };
        const sourceOwner = {
          ...contributor,
          cookie: await signIn(contributor.email, restored),
        };
        for (const [sourceId, scope, revision] of [
          [older.sourceId, "journey_review", 2],
          [newer.sourceId, "publication_reuse", 3],
          [missing.sourceId, "only_me", 2],
          [withdrawn.sourceId, "only_me", 2],
        ] as const) {
          const path = reviewPath(journeyId, sourceId);
          const own = await read(path, sourceOwner, restored);
          expect(await own.json()).toEqual({ sourceId, scope, revision });
          const visible = await read(path, editor, restored);
          expect(visible.status).toBe(scope === "only_me" ? 404 : 200);
        }
        await expect(
          owner.pool.query(
            "select revoked_at from kairn.original_export_grants where id = $1",
            [dependent],
          ),
        ).resolves.toMatchObject({ rows: [{ revoked_at: expect.any(Date) }] });
      } finally {
        await owner.pool.query(
          "update kairn_auth.identity_recovery set epoch_digest = $1 where id = 'current'",
          [identityEpoch(localRecoveryEpoch)],
        );
      }
    }, 25_000);

    it("confirms a pending source withdrawal before a later narrowing of the same grant", async () => {
      const [publisher, contributor] = await Promise.all([member(), member()]);
      const journeyId = await createJourney(publisher);
      await addMember(journeyId, contributor);
      const { sourceId } = await personalSource(contributor);
      const path = reviewPath(journeyId, sourceId);
      expect((await allowPublication(path, contributor, 0)).status).toBe(200);
      const headBefore = await journal.head();
      appendAvailable = false;
      let withdrawalId: string;
      try {
        const removed = await post(
          path,
          { action: "withdraw", expectedRevision: 1 },
          contributor,
        );
        expect(removed.status).toBe(202);
        withdrawalId = sourceReviewWithdrawal.parse(
          await removed.json(),
        ).eventId;
        expect((await allowPublication(path, contributor, 2)).status).toBe(200);
      } finally {
        appendAvailable = true;
      }
      const narrow = { action: "narrow_to_review", expectedRevision: 3 };
      const pending = await post(path, narrow, contributor);
      expect(pending.status).toBe(202);
      const { eventId } = sourceReviewNarrowing.parse(await pending.json());
      expect(await journal.head()).toBe(headBefore);
      expect(await (await read(path, publisher)).json()).toEqual({
        sourceId,
        scope: "journey_review",
        revision: 4,
      });
      await confirmRestriction(runtime.db, journal, withdrawalId);
      const confirmed = await post(path, narrow, contributor);
      expect(confirmed.status).toBe(200);
      expect(await confirmed.json()).toMatchObject({
        eventId,
        confirmation: "confirmed",
      });
      expect(records.slice(-2).map(({ event }) => event.id)).toEqual([
        withdrawalId,
        eventId,
      ]);
      const checkpoint = records.at(-1)?.receipt;
      if (!checkpoint) throw new Error("Fixture checkpoint missing");
      await owner.pool.query(
        "update kairn.source_grants set scope = 'publication_reuse', publication_consent = $3, revision = 1 where journey_id = $1 and source_id = $2",
        [journeyId, sourceId, publicationConsent],
      );
      const epoch = "synthetic-withdrawal-before-narrowing-recovery-epoch";
      try {
        await replayIdentityRestrictions(owner.db, journal, epoch, checkpoint);
        const restored = application(epoch);
        const editor = {
          ...publisher,
          cookie: await signIn(publisher.email, restored),
        };
        const sourceOwner = {
          ...contributor,
          cookie: await signIn(contributor.email, restored),
        };
        expect((await read(path, editor, restored)).status).toBe(404);
        expect(await (await read(path, sourceOwner, restored)).json()).toEqual({
          sourceId,
          scope: "only_me",
          revision: 4,
        });
      } finally {
        await owner.pool.query(
          "update kairn_auth.identity_recovery set epoch_digest = $1 where id = 'current'",
          [identityEpoch(localRecoveryEpoch)],
        );
      }
    });

    it("requires an exact contribution request and the owner's explicit approval", async () => {
      const [organiser, contributor, recipient, outsider] = await Promise.all(
        Array.from({ length: 4 }, () => member()),
      );
      const journeyId = await createJourney(organiser);
      const otherJourney = await createJourney(organiser);
      await addMember(journeyId, contributor);
      await addMember(journeyId, recipient);
      const [first, second, privateAsset] = await Promise.all(
        Array.from({ length: 3 }, () => personalSource(contributor)),
      );
      for (const { sourceId } of [first, second]) {
        expect(
          (
            await post(
              reviewPath(journeyId, sourceId),
              { action: "share", expectedRevision: 0 },
              contributor,
            )
          ).status,
        ).toBe(200);
      }
      const collection = exportPath(journeyId);
      const body = {
        ownerId: contributor.id,
        assetIds: [first.assetId, second.assetId],
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      };
      expect((await post(collection, body, recipient)).status).toBe(400);
      expect(
        (await post(collection, body, outsider, randomUUID())).status,
      ).toBe(404);
      expect(
        (
          await post(
            collection,
            body,
            recipient,
            randomUUID(),
            app,
            "https://external.test",
          )
        ).status,
      ).toBe(403);
      for (const expiresAt of [
        "2020-01-01T00:00:00Z",
        "2030-01-01T00:00:00+24:00",
        "9999-12-31T23:59:59-01:00",
      ]) {
        expect(
          (
            await post(
              collection,
              { ...body, expiresAt },
              recipient,
              randomUUID(),
            )
          ).status,
        ).toBe(400);
      }
      expect(
        (
          await post(
            collection,
            { ...body, assetIds: [first.assetId, first.assetId.toUpperCase()] },
            recipient,
            randomUUID(),
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await post(
            collection,
            { ...body, assetIds: [first.assetId, privateAsset.assetId] },
            recipient,
            randomUUID(),
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await post(
            collection,
            { ...body, ownerId: organiser.id },
            recipient,
            randomUUID(),
          )
        ).status,
      ).toBe(404);
      const key = randomUUID();
      const indiaExpiry = new Date(Date.parse(body.expiresAt) + 330 * 60_000)
        .toISOString()
        .replace("Z", "+05:30");
      const responses = await Promise.all([
        post(collection, body, recipient, key),
        post(
          collection,
          {
            ...body,
            assetIds: [...body.assetIds].reverse(),
            expiresAt: indiaExpiry,
          },
          recipient,
          key,
        ),
      ]);
      expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
      const [request, retry] = await Promise.all(
        responses.map(async (response) =>
          originalExportRequest.parse(await response.json()),
        ),
      );
      expect(retry).toEqual(request);
      expect(request).toMatchObject({
        ownerId: contributor.id,
        recipient: {
          accountId: recipient.id,
          displayName: "Membership fixture",
        },
        assetIds: [...body.assetIds].sort(),
        state: "pending",
        metadataNotice: expect.stringContaining("private metadata"),
      });
      expect(request.expiresAt).toBe(body.expiresAt);
      expect(
        (
          await post(
            collection,
            { ...body, assetIds: [first.assetId] },
            recipient,
            key,
          )
        ).status,
      ).toBe(409);
      const path = exportPath(journeyId, request.grantId);
      for (const actor of [contributor, recipient]) {
        const list = await read(collection, actor);
        expect(list.headers.get("cache-control")).toBe("private, no-store");
        expect(originalExportPage.parse(await list.json())).toEqual({
          items: [request],
          nextCursor: null,
        });
      }
      expect(await (await read(collection, organiser)).json()).toEqual({
        items: [],
        nextCursor: null,
      });
      expect(
        (await read(exportPath(otherJourney, request.grantId), contributor))
          .status,
      ).toBe(404);
      expect((await read(path, organiser)).status).toBe(404);
      expect((await read(`${path}/authorization`, recipient)).status).toBe(404);
      expect(
        (await post(`${path}/decision`, { decision: "approve" }, contributor))
          .status,
      ).toBe(400);
      for (const actor of [organiser, recipient]) {
        expect((await post(`${path}/decision`, approval, actor)).status).toBe(
          404,
        );
      }
      await Promise.all([
        approveExport(journeyId, contributor, request.grantId),
        approveExport(journeyId, contributor, request.grantId),
      ]);
      expect((await read(`${path}/authorization`, organiser)).status).toBe(404);
      expect((await read(`${path}/authorization`, contributor)).status).toBe(
        404,
      );
      const authorization = await read(`${path}/authorization`, recipient);
      expect(authorization.status).toBe(200);
      expect(
        originalExportAuthorization.parse(await authorization.json()),
      ).toEqual({
        grantId: request.grantId,
        assetIds: request.assetIds,
        expiresAt: request.expiresAt,
      });
      await expect(
        owner.pool.query(
          "select source_grant_revision from kairn.export_grant_assets where grant_id = $1",
          [request.grantId],
        ),
      ).resolves.toMatchObject({
        rows: [{ source_grant_revision: 1 }, { source_grant_revision: 1 }],
      });
      await expect(
        owner.pool.query(
          "select action from kairn.audit_events where target_id = $1 order by action",
          [request.grantId],
        ),
      ).resolves.toMatchObject({
        rows: [
          { action: "original_export_approved" },
          { action: "original_export_requested" },
        ],
      });
      await expect(
        runtime.pool.query("select id from kairn.original_export_grants"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        runtime.pool.query(
          "select kairn.apply_original_export_revocation($1, $2, $3)",
          [journeyId, request.grantId, contributor.id],
        ),
      ).rejects.toMatchObject({ code: "42501" });

      const declined = await requestExport(journeyId, contributor, recipient, [
        first.assetId,
      ]);
      const declinePath = exportPath(journeyId, declined.grantId);
      const decline = () =>
        post(`${declinePath}/decision`, { decision: "decline" }, contributor);
      const decision = await decline();
      expect(decision.status).toBe(200);
      expect(originalExportRequest.parse(await decision.json()).state).toBe(
        "declined",
      );
      expect(
        (
          await post(
            reviewPath(journeyId, first.sourceId),
            { action: "withdraw", expectedRevision: 1 },
            contributor,
          )
        ).status,
      ).toBe(200);
      const repeatedDecline = await decline();
      expect(repeatedDecline.status).toBe(200);
      expect(
        originalExportRequest.parse(await repeatedDecline.json()).state,
      ).toBe("declined");
      expect(
        (await post(`${declinePath}/decision`, approval, contributor)).status,
      ).toBe(409);
      expect(
        (await read(`${declinePath}/authorization`, recipient)).status,
      ).toBe(404);
    }, 25_000);

    it("limits new export requests while accepting retries at the limit", async () => {
      const [contributor, recipient, anotherRecipient] = await Promise.all([
        member(),
        member(),
        member(),
      ]);
      const journeyId = await createJourney(contributor);
      await addMember(journeyId, recipient);
      await addMember(journeyId, anotherRecipient);
      const { sourceId, assetId } = await personalSource(contributor);
      expect(
        (
          await post(
            reviewPath(journeyId, sourceId),
            { action: "share", expectedRevision: 0 },
            contributor,
          )
        ).status,
      ).toBe(200);
      const collection = exportPath(journeyId);
      const body = {
        ownerId: contributor.id,
        assetIds: [assetId],
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      };
      const originalKey = randomUUID();
      const first = await post(collection, body, recipient, originalKey);
      expect(first.status).toBe(201);
      const request = originalExportRequest.parse(await first.json());
      for (let index = 0; index < 19; index += 1) {
        expect(
          (await post(collection, body, recipient, randomUUID())).status,
        ).toBe(201);
      }
      expect(
        (await post(collection, body, recipient, randomUUID())).status,
      ).toBe(429);
      const retry = await post(collection, body, recipient, originalKey);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(request);
      expect(
        (await post(collection, body, anotherRecipient, randomUUID())).status,
      ).toBe(201);
    }, 25_000);

    it("denies the entire export after expiry, deletion, source narrowing or recipient departure", async () => {
      const [contributor, recipient] = await Promise.all([member(), member()]);
      const journeyId = await createJourney(contributor);
      const membershipGeneration = await addMember(journeyId, recipient);
      const [first, second] = await Promise.all([
        personalSource(contributor),
        personalSource(contributor),
      ]);
      for (const { sourceId } of [first, second]) {
        expect(
          (
            await allowPublication(
              reviewPath(journeyId, sourceId),
              contributor,
              0,
            )
          ).status,
        ).toBe(200);
      }
      const ids = [first.assetId, second.assetId];
      const expired = await requestExport(
        journeyId,
        contributor,
        recipient,
        ids,
      );
      const expiredPath = await approveExport(
        journeyId,
        contributor,
        expired.grantId,
      );
      await owner.pool.query(
        "update kairn.original_export_grants set created_at = now() - interval '2 days', expires_at = now() where id = $1",
        [expired.grantId],
      );
      expect(
        (await read(`${expiredPath}/authorization`, recipient)).status,
      ).toBe(404);
      expect(
        originalExportRequest.parse(
          await (await read(expiredPath, contributor)).json(),
        ).state,
      ).toBe("expired");

      const current = await requestExport(
        journeyId,
        contributor,
        recipient,
        ids,
      );
      const currentPath = await approveExport(
        journeyId,
        contributor,
        current.grantId,
      );
      const pending = await requestExport(
        journeyId,
        contributor,
        recipient,
        ids,
      );
      const pendingPath = exportPath(journeyId, pending.grantId);
      await owner.pool.query(
        "update kairn.source_assets set deleted_at = now() where id = $1",
        [first.assetId],
      );
      expect(
        (await read(`${currentPath}/authorization`, recipient)).status,
      ).toBe(404);
      expect(
        (await post(`${pendingPath}/decision`, approval, contributor)).status,
      ).toBe(409);
      await owner.pool.query(
        "update kairn.source_assets set deleted_at = null where id = $1",
        [first.assetId],
      );
      await owner.pool.query(
        "update kairn.sources set deleted_at = now() where id = $1",
        [first.sourceId],
      );
      expect(
        (await read(`${currentPath}/authorization`, recipient)).status,
      ).toBe(404);
      await owner.pool.query(
        "update kairn.sources set deleted_at = null where id = $1",
        [first.sourceId],
      );
      expect(
        (
          await post(
            reviewPath(journeyId, first.sourceId),
            { action: "narrow_to_review", expectedRevision: 1 },
            contributor,
          )
        ).status,
      ).toBe(200);
      expect(
        (await read(`${currentPath}/authorization`, recipient)).status,
      ).toBe(404);
      expect(
        (await post(`${pendingPath}/decision`, approval, contributor)).status,
      ).toBe(409);

      const previousMembership = await requestExport(
        journeyId,
        contributor,
        recipient,
        ids,
      );
      const previousPath = await approveExport(
        journeyId,
        contributor,
        previousMembership.grantId,
      );
      expect(
        (await read(`${previousPath}/authorization`, recipient)).status,
      ).toBe(200);
      expect(
        (await leave(journeyId, recipient, membershipGeneration)).status,
      ).toBe(200);
      expect(
        (await read(`${previousPath}/authorization`, recipient)).status,
      ).toBe(404);
      await owner.pool.query(
        "update kairn.journey_memberships set revoked_at = null, generation = gen_random_uuid() where journey_id = $1 and account_id = $2",
        [journeyId, recipient.id],
      );
      expect((await read(previousPath, recipient)).status).toBe(404);
      expect(
        (await read(`${previousPath}/authorization`, recipient)).status,
      ).toBe(404);
      const next = await requestExport(journeyId, contributor, recipient, ids);
      const nextPath = await approveExport(
        journeyId,
        contributor,
        next.grantId,
      );
      expect((await read(`${nextPath}/authorization`, recipient)).status).toBe(
        200,
      );
      expect(
        (
          await post(
            reviewPath(journeyId, second.sourceId),
            { action: "withdraw", expectedRevision: 1 },
            contributor,
          )
        ).status,
      ).toBe(200);
      expect((await read(`${nextPath}/authorization`, recipient)).status).toBe(
        404,
      );
      expect(
        (
          await post(
            reviewPath(journeyId, second.sourceId),
            { action: "share", expectedRevision: 2 },
            contributor,
          )
        ).status,
      ).toBe(200);
      expect((await read(`${nextPath}/authorization`, recipient)).status).toBe(
        404,
      );
      const legacy = await originalExport(journeyId, contributor, recipient, {
        ...first,
        revision: 2,
      });
      expect(
        (
          await read(
            `${exportPath(journeyId, legacy)}/authorization`,
            recipient,
          )
        ).status,
      ).toBe(404);
    }, 25_000);

    it("revokes a specific grant immediately and replays it over approved and pending backups", async () => {
      const [organiser, contributor, recipient] = await Promise.all([
        member(),
        member(),
        member(),
      ]);
      const journeyId = await createJourney(organiser);
      const sourceOwnerGeneration = await addMember(journeyId, contributor);
      await addMember(journeyId, recipient);
      const { sourceId, assetId } = await personalSource(contributor);
      expect(
        (
          await post(
            reviewPath(journeyId, sourceId),
            { action: "share", expectedRevision: 0 },
            contributor,
          )
        ).status,
      ).toBe(200);
      const grants = await Promise.all(
        Array.from({ length: 3 }, () =>
          requestExport(journeyId, contributor, recipient, [assetId]),
        ),
      );
      const [approved, pending, unaffected] = grants;
      const [approvedPath, pendingPath, unaffectedPath] = await Promise.all(
        grants.map(({ grantId }) =>
          approveExport(journeyId, contributor, grantId),
        ),
      );
      expect(
        (await leave(journeyId, contributor, sourceOwnerGeneration)).status,
      ).toBe(200);
      expect((await post(`${approvedPath}/revoke`, {}, organiser)).status).toBe(
        404,
      );
      expect((await post(`${approvedPath}/revoke`, {}, recipient)).status).toBe(
        404,
      );
      let eventId: string;
      appendAvailable = false;
      try {
        const response = await post(`${approvedPath}/revoke`, {}, contributor);
        expect(response.status).toBe(202);
        const result = membershipRestrictionResult.parse(await response.json());
        eventId = result.eventId;
        expect(result.confirmation).toBe("pending");
        expect(
          (await read(`${approvedPath}/authorization`, recipient)).status,
        ).toBe(404);
        expect(
          (await read(`${unaffectedPath}/authorization`, recipient)).status,
        ).toBe(200);
        await expect(
          boss.getJobById(restrictionQueue, eventId),
        ).resolves.toMatchObject({ id: eventId });
      } finally {
        appendAvailable = true;
      }
      await confirmRestriction(runtime.db, journal, eventId);
      const confirmed = await post(`${approvedPath}/revoke`, {}, contributor);
      expect(confirmed.status).toBe(200);
      expect(await confirmed.json()).toEqual({
        eventId,
        confirmation: "confirmed",
      });
      expect(records.at(-1)?.event).toEqual({
        version: 6,
        id: eventId,
        operation: "original_export_revocation",
        accountId: contributor.id,
        journeyId,
        grantId: approved.grantId,
        generation: 1,
      });
      const secondRevocation = await post(
        `${pendingPath}/revoke`,
        {},
        contributor,
      );
      expect(secondRevocation.status).toBe(200);
      const secondEvent = membershipRestrictionResult.parse(
        await secondRevocation.json(),
      );
      const checkpoint = records.at(-1)?.receipt;
      if (!checkpoint) throw new Error("Fixture checkpoint missing");
      await owner.pool.query(
        "delete from kairn.restriction_events where id = any($1::uuid[])",
        [[eventId, secondEvent.eventId]],
      );
      await owner.pool.query(
        "delete from kairn.audit_events where id = any($1::uuid[])",
        [[eventId, secondEvent.eventId]],
      );
      await owner.pool.query(
        "update kairn.original_export_grants set revoked_at = null where id = $1",
        [approved.grantId],
      );
      await owner.pool.query(
        "update kairn.original_export_grants set revoked_at = null, decision = 'pending' where id = $1",
        [pending.grantId],
      );

      const epoch = "synthetic-original-export-revocation-recovery-epoch";
      try {
        await replayIdentityRestrictions(owner.db, journal, epoch, checkpoint);
        const restored = application(epoch);
        const viewer = {
          ...recipient,
          cookie: await signIn(recipient.email, restored),
        };
        const sourceOwner = {
          ...contributor,
          cookie: await signIn(contributor.email, restored),
        };
        for (const [path, restoredEventId] of [
          [approvedPath, eventId],
          [pendingPath, secondEvent.eventId],
        ]) {
          expect(
            (await read(`${path}/authorization`, viewer, restored)).status,
          ).toBe(404);
          expect(
            originalExportRequest.parse(
              await (await read(path, sourceOwner, restored)).json(),
            ).state,
          ).toBe("revoked");
          expect(
            (
              await post(
                `${path}/decision`,
                approval,
                sourceOwner,
                undefined,
                restored,
              )
            ).status,
          ).toBe(409);
          const retry = await post(
            `${path}/revoke`,
            {},
            sourceOwner,
            undefined,
            restored,
          );
          expect(retry.status).toBe(200);
          expect(await retry.json()).toEqual({
            eventId: restoredEventId,
            confirmation: "confirmed",
          });
        }
        expect(await journal.head()).toBe(checkpoint.sequence);
        const allowed = await read(
          `${unaffectedPath}/authorization`,
          viewer,
          restored,
        );
        expect(allowed.status).toBe(200);
        expect(
          originalExportAuthorization.parse(await allowed.json()).grantId,
        ).toBe(unaffected.grantId);
      } finally {
        await owner.pool.query(
          "update kairn_auth.identity_recovery set epoch_digest = $1 where id = 'current'",
          [identityEpoch(localRecoveryEpoch)],
        );
      }
    }, 25_000);
  },
);
