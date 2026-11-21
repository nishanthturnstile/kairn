import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { createApp } from "../../apps/server/src/app";
import { createJourneyOperations } from "../../apps/server/src/journey-operations";
import {
  checkJourneyReadiness,
  createAuth,
  createCompanionSetupService,
  createOnboardingService,
  createProfileService,
  initializeLocalIdentity,
  localRecoveryEpoch,
  openDatabase,
  openJobQueue,
  openMailTransport,
  registerIdentityMail,
  registerJourneyInvitationMail,
} from "../../packages/backend/src/index";
import { identityEpoch } from "../../packages/backend/src/modules/identity/state";
import { journeyInvitationMailQueue } from "../../packages/backend/src/modules/journeys/invitation-mail";
import {
  journeyInvitationBatchResult,
  journeyInvitationContinuation,
  journeyInvitationPage,
  journeyInvitationReview,
  journeyInviteeMatches,
} from "../../packages/contracts/src/journeys";

const origin = "http://kairn.test";
const invitePath = "/api/v1/journey-invitations";
const journeysPath = "/api/v1/journeys";
const subject = "Join a journey on Kairn";
const password = "Synthetic-invitation-password";
const organiserName = "Morgan <&>\nLee";
const title = "Private weekend by the sea";
const disposableEmail = () => `invite-${randomUUID()}@example.test`;
type Account = { id: string; email: string; cookie: string };

describe.runIf(process.env.KAIRN_JOURNEY_TEST === "isolated")(
  "journey invitations through PostgreSQL and Mailpit",
  () => {
    const runtime = openDatabase(process.env.KAIRN_TEST_DATABASE_URL ?? "");
    const owner = openDatabase(
      process.env.KAIRN_TEST_MIGRATION_DATABASE_URL ?? "",
    );
    const boss = openJobQueue(process.env.KAIRN_TEST_DATABASE_URL ?? "");
    const transport = openMailTransport(
      process.env.KAIRN_TEST_SMTP_URL ?? "smtp://127.0.0.1:51025",
    );
    const inbox = process.env.KAIRN_TEST_MAILPIT_URL;
    const mailConfig = {
      transport,
      key: randomBytes(32).toString("hex"),
      from: "kairn@example.test",
    };
    const config = {
      baseURL: origin,
      epoch: localRecoveryEpoch,
      secret: randomBytes(32).toString("hex"),
      mailKey: mailConfig.key,
      boss,
    };
    const auth = createAuth(runtime.db, config);
    const journeys = createJourneyOperations(auth, config);
    const app = makeApp(config);
    let requests = 0;
    let invitationWorker: Promise<() => void> | undefined;

    function startInvitationWorker() {
      invitationWorker ??= registerJourneyInvitationMail(boss, runtime.db, {
        ...mailConfig,
        epoch: config.epoch,
      });
      return invitationWorker;
    }

    function makeApp(settings: typeof config) {
      const currentAuth =
        settings === config ? auth : createAuth(runtime.db, settings);
      const operations =
        settings === config
          ? journeys
          : createJourneyOperations(currentAuth, settings);
      return createApp({
        authHandler: currentAuth.handler,
        checkReadiness: async () => {},
        journeys: operations,
        workspace: {
          ...operations,
          profile: createProfileService(currentAuth),
          onboarding: createOnboardingService(currentAuth),
          companionSetup: createCompanionSetupService(currentAuth),
        },
      });
    }

    function post(
      path: string,
      body?: object,
      account?: Account,
      key?: string,
      target = app,
    ) {
      const headers = new Headers({
        Origin: origin,
        "X-Forwarded-For": `198.51.100.${++requests}`,
      });
      if (body) headers.set("Content-Type", "application/json");
      if (account) {
        headers.set("Cookie", account.cookie);
        headers.set("X-Expected-Account", account.id);
      }
      if (key) headers.set("Idempotency-Key", key);
      return target.request(`${origin}${path}`, {
        method: "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    }

    function read(path: string, account: Account) {
      return app.request(`${origin}${path}`, {
        headers: { Cookie: account.cookie, "X-Expected-Account": account.id },
      });
    }

    function invitationList(journeyId: string) {
      return `${journeysPath}/${journeyId}/invitations`;
    }

    async function findMail(
      email: string,
      expectedSubject: string,
      eventId?: string,
    ) {
      let received: { html: string; text: string } | undefined;
      await expect
        .poll(
          async () => {
            const query = encodeURIComponent(`to:${email}`);
            const result = await fetch(
              `${inbox}/api/v1/search?query=${query}`,
            ).then((response) => response.json());
            for (const item of result.messages ?? []) {
              if (item.Subject !== expectedSubject) continue;
              if (eventId) {
                const headers = await fetch(
                  `${inbox}/api/v1/message/${item.ID}/headers`,
                ).then((response) => response.json());
                if (headers["Message-Id"]?.[0] !== `<${eventId}@example.test>`)
                  continue;
                expect(headers["Resend-Idempotency-Key"]).toEqual([
                  `journey-invitation-mail/${eventId}`,
                ]);
              }
              const message = await fetch(
                `${inbox}/api/v1/message/${item.ID}`,
              ).then((response) => response.json());
              received = {
                html: String(message.HTML),
                text: String(message.Text),
              };
              return true;
            }
            return false;
          },
          { timeout: 24_000 },
        )
        .toBe(true);
      if (!received) throw new Error("Fixture mail is missing");
      return received;
    }

    async function sendInvite(
      account: Account,
      journeyId: string,
      email: string,
      key = randomUUID(),
    ) {
      const response = await post(
        invitationList(journeyId),
        { emails: [email] },
        account,
        key,
      );
      expect(response.status).toBe(200);
      const [item] = journeyInvitationBatchResult.parse(
        await response.json(),
      ).items;
      expect(item.status).toBe("queued");
      if (!("invitationId" in item))
        throw new Error("No invitation was queued");
      return item.invitationId;
    }

    async function inviteToken(email: string, id: string) {
      await startInvitationWorker();
      const message = await findMail(email, subject, id);
      expect(message.text).toContain("Participant");
      expect(message.text).not.toContain(title);
      expect(message.html).not.toContain(title);
      const link = message.text.match(
        /http:\/\/kairn\.test\/journey-invitations#[A-Za-z0-9_-]+/,
      )?.[0];
      if (!link) throw new Error("Fixture invitation link is missing");
      const url = new URL(link);
      expect(url.search).toBe("");
      return { token: url.hash.slice(1), message };
    }

    async function continueInvitation(token: string) {
      const result = await post(`${invitePath}/continue`, { token });
      expect(result.status).toBe(200);
      expect(result.headers.get("Cache-Control")).toBe("private, no-store");
      expect(result.headers.get("Referrer-Policy")).toBe("no-referrer");
      return journeyInvitationContinuation.parse(await result.json())
        .continuation;
    }

    async function review(account: Account, continuation: string) {
      const result = await post(
        `${invitePath}/review`,
        { continuation },
        account,
      );
      expect(result.status).toBe(200);
      return journeyInvitationReview.parse(await result.json());
    }

    async function ready(account: Account, token: string) {
      const result = await review(account, await continueInvitation(token));
      if (result.state !== "ready")
        throw new Error(`Unexpected invitation state: ${result.state}`);
      return result;
    }

    function accept(
      account: Account,
      continuation: string,
      operationId: string,
    ) {
      return post(
        `${invitePath}/accept`,
        { continuation, operationId },
        account,
      );
    }

    function status(account: Account, operationId: string) {
      return post(`${invitePath}/acceptance-status`, { operationId }, account);
    }

    async function signup(email: string, name = "Synthetic participant") {
      const result = await post("/api/auth/sign-up/email", {
        email,
        password,
        name,
      });
      expect(result.status).toBe(200);
      return String((await result.json()).user.id);
    }

    async function signIn(email: string, target = app) {
      const result = await post(
        "/api/auth/sign-in/email",
        { email, password },
        undefined,
        undefined,
        target,
      );
      expect(result.status).toBe(200);
      const cookie = result.headers
        .getSetCookie()
        .find((value) => value.includes("session_token="))
        ?.split(";")[0];
      if (!cookie)
        throw new Error("Verification did not create a sign-in session");
      return cookie;
    }

    async function account(
      email = disposableEmail(),
      name?: string,
    ): Promise<Account> {
      const id = await signup(email, name);
      await owner.pool.query(
        'update kairn_auth."user" set email_verified = true where id = $1',
        [id],
      );
      return { id, email, cookie: await signIn(email) };
    }

    async function createJourney(account: Account) {
      const result = await post(
        journeysPath,
        {
          title,
          intendedStart: "2030-06-14T07:30",
          timeZone: "Asia/Kolkata",
        },
        account,
        randomUUID(),
      );
      expect(result.status).toBe(201);
      return String((await result.json()).id);
    }

    async function orderedRace(
      journeyId: string,
      first: () => Promise<Response>,
      second: () => Promise<Response>,
    ) {
      const connection = await owner.pool.connect();
      const pending: Promise<Response>[] = [];
      try {
        await connection.query("begin");
        const {
          rows: [holder],
        } = await connection.query(
          "select pg_backend_pid() as pid from kairn.journeys where id = $1 for update",
          [journeyId],
        );
        async function waiting() {
          const {
            rows: [result],
          } = await owner.pool.query(
            `
            with recursive blocked(pid) as (
              select $1::int
              union
              select activity.pid
              from pg_stat_activity as activity
              join blocked on blocked.pid = any(pg_blocking_pids(activity.pid))
              where activity.usename = 'kairn_runtime'
            )
            select count(*)::int - 1 as count from blocked
            `,
            [holder.pid],
          );
          return result.count;
        }
        pending.push(first());
        await expect.poll(waiting, { timeout: 4_000 }).toBe(1);
        pending.push(second());
        await expect.poll(waiting, { timeout: 4_000 }).toBe(2);
        await connection.query("commit");
        return await Promise.all(pending);
      } finally {
        await connection.query("rollback");
        connection.release();
        await Promise.allSettled(pending);
      }
    }

    beforeAll(async () => {
      await initializeLocalIdentity(runtime.db, localRecoveryEpoch);
      await boss.start();
      await registerIdentityMail(boss, runtime.db, mailConfig);
    });

    afterAll(async () => {
      await invitationWorker?.then((stop) => stop());
      await boss.stop();
      transport.close();
      await Promise.all([runtime.pool.end(), owner.pool.end()]);
    });

    it("requires the invitation routines before Journey readiness passes", async () => {
      const rollback = new Error("Roll back the missing-function fixture");
      await expect(
        owner.db.transaction(async (tx) => {
          await tx.execute(
            "drop function kairn.resolve_journey_invitation(text, text)",
          );
          await expect(checkJourneyReadiness(tx)).rejects.toThrow(
            "Journey invitations are unavailable.",
          );
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      await expect(checkJourneyReadiness(runtime.db)).resolves.toBeUndefined();
    });

    it("queues a partial batch once and joins four verified invitees to one canonical journey", async () => {
      const organiser = await account(disposableEmail(), organiserName);
      const people = await Promise.all(
        Array.from({ length: 3 }, () => account()),
      );
      const newEmail = disposableEmail();
      const addresses = [...people.map((person) => person.email), newEmail];
      const journeyId = await createJourney(organiser);
      const path = invitationList(journeyId);
      const key = randomUUID();
      const batch = {
        emails: [
          addresses[0].toUpperCase(),
          ...addresses.slice(1),
          addresses[0],
          "invalid",
          organiser.email,
        ],
      };
      const issued = await Promise.all([
        post(path, batch, organiser, key),
        post(path, batch, organiser, key),
      ]);
      for (const response of issued) expect(response.status).toBe(200);
      const [result, replay] = await Promise.all(
        issued.map((res) =>
          res.json().then(journeyInvitationBatchResult.parse),
        ),
      );
      expect(replay).toEqual(result);
      expect(result.items.map((row) => row.status)).toEqual([
        "queued",
        "queued",
        "queued",
        "queued",
        "duplicate",
        "invalid_email",
        "already_member",
      ]);
      expect(
        (await post(path, { emails: [newEmail] }, organiser, key)).status,
      ).toBe(409);
      expect(
        (await post(path, { emails: [newEmail] }, people[0], randomUUID()))
          .status,
      ).toBe(404);
      expect((await read(path, people[0])).status).toBe(404);
      const queued = journeyInvitationPage.parse(
        await (await read(path, organiser)).json(),
      );
      expect(queued.items.map(({ email }) => email).sort()).toEqual(
        [...addresses].sort(),
      );
      expect(queued.items.every(({ delivery }) => delivery === "queued")).toBe(
        true,
      );
      const ids = result.items.flatMap((item) =>
        "invitationId" in item ? [item.invitationId] : [],
      );
      const { rows: jobs } = await owner.pool.query(
        "select data from pgboss.job where name = $1 and id = any($2::uuid[])",
        [journeyInvitationMailQueue, ids],
      );
      expect(jobs.map(({ data }) => data)).toEqual(
        expect.arrayContaining(ids.map((id) => ({ id }))),
      );
      expect(jobs).toHaveLength(4);
      await expect(
        runtime.pool.query("select * from kairn.journey_invitations"),
      ).rejects.toMatchObject({ code: "42501" });

      const links = await Promise.all(
        addresses.map((address, index) => inviteToken(address, ids[index])),
      );
      expect(links[0].message.html).toContain("Morgan &lt;&amp;&gt; Lee");
      expect(links[0].message.text).toContain("Morgan <&> Lee invited");
      const preview = await continueInvitation(links[0].token);
      expect(
        (await read(`${journeysPath}/${journeyId}`, people[0])).status,
      ).toBe(404);
      expect(
        (await post(`${invitePath}/review`, { continuation: preview })).status,
      ).toBe(401);
      expect(await review(people[1], preview)).toEqual({
        state: "wrong_account",
      });
      expect((await accept(people[0], preview, randomUUID())).status).toBe(404);

      const newContinuation = await continueInvitation(links[3].token);
      const newId = await signup(newEmail);
      expect(
        (await post("/api/auth/sign-in/email", { email: newEmail, password }))
          .status,
      ).toBe(403);
      const verification = await findMail(newEmail, "Verify your Kairn email");
      const verificationLink = verification.text.match(
        /http:\/\/kairn\.test\/api\/auth\/\S+/,
      )?.[0];
      if (!verificationLink)
        throw new Error("Verification message has no link");
      expect((await app.request(verificationLink)).status).toBe(302);
      people.push({
        id: newId,
        email: newEmail,
        cookie: await signIn(newEmail),
      });

      for (const [index, person] of people.entries()) {
        const reviewResult =
          index === 3
            ? await review(person, newContinuation)
            : await ready(person, links[index].token);
        if (reviewResult.state !== "ready")
          throw new Error("Expected a review for the recipient");
        expect(reviewResult).toMatchObject({
          title,
          inviter: organiserName,
          scope: "participant",
          schedule: {
            timeZone: "Asia/Kolkata",
            intendedStart: { local: "2030-06-14T07:30" },
          },
        });
        const operationId = randomUUID();
        const concurrent = await Promise.all([
          accept(person, reviewResult.continuation, operationId),
          accept(person, reviewResult.continuation, operationId),
        ]);
        for (const response of concurrent) {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({ id: journeyId });
        }
        expect(await (await status(person, operationId)).json()).toEqual({
          id: journeyId,
        });
        expect((await status(organiser, operationId)).status).toBe(404);
        expect(
          await (await read(`${journeysPath}/${journeyId}`, person)).json(),
        ).toMatchObject({ id: journeyId, capabilities: [] });
        expect(
          await (await read("/api/v1/dashboard", person)).json(),
        ).toMatchObject({ journeyCount: 1 });
        const history = await (
          await read(`${journeysPath}?view=timeline`, person)
        ).json();
        expect(
          history.timeline.upcoming.items.map(
            (item: { id: string }) => item.id,
          ),
        ).toEqual([journeyId]);
        const redundantOperation = randomUUID();
        const alreadyAccepted = await accept(
          person,
          reviewResult.continuation,
          redundantOperation,
        );
        expect(alreadyAccepted.status).toBe(409);
        expect(await alreadyAccepted.json()).toMatchObject({
          code: "invitation_accepted",
        });
        expect((await status(person, redundantOperation)).status).toBe(404);
        expect(await review(person, reviewResult.continuation)).toEqual({
          state: "joined",
          journeyId,
        });
      }
      const later = await post(
        `${path}/${ids[0]}/cancel`,
        undefined,
        organiser,
        randomUUID(),
      );
      expect(later.status).toBe(409);
      expect(await later.json()).toMatchObject({ code: "invitation_accepted" });
      expect(await (await read(path, organiser)).json()).toEqual({
        items: [],
        nextCursor: null,
      });
      const { rows } = await owner.pool.query(
        "select action, count(*)::int from kairn.audit_events where journey_id = $1 group by action",
        [journeyId],
      );
      expect(rows).toEqual(
        expect.arrayContaining([
          { action: "journey_invitation_issued", count: 4 },
          { action: "journey_invitation_accepted", count: 4 },
        ]),
      );
    }, 60_000);

    it("replaces and cancels only the scoped invitation and makes its previous links unusable", async () => {
      const organiser = await account();
      const recipient = await account();
      const journeyId = await createJourney(organiser);
      const otherJourneyId = await createJourney(organiser);
      const id = await sendInvite(organiser, journeyId, recipient.email);
      const { token } = await inviteToken(recipient.email, id);
      const handle = (await ready(recipient, token)).continuation;
      const admin = invitationList(journeyId);
      const resend = `${admin}/${id}/resend`;
      expect(
        (
          await post(
            `${invitationList(otherJourneyId)}/${id}/cancel`,
            undefined,
            organiser,
            randomUUID(),
          )
        ).status,
      ).toBe(404);
      expect(
        await (await post(resend, undefined, organiser, randomUUID())).json(),
      ).toEqual({ items: [{ status: "rate_limited" }] });
      await owner.pool.query(
        "update kairn.journey_invitations set created_at = now() - interval '2 minutes' where id = $1",
        [id],
      );
      const key = randomUUID();
      const [result, replay] = await Promise.all([
        post(resend, undefined, organiser, key),
        post(resend, undefined, organiser, key),
      ]);
      expect(result.status).toBe(200);
      const replacement = await result.json();
      expect(await replay.json()).toEqual(replacement);
      expect(replacement.items[0].status).toBe("queued");
      const newId = replacement.items[0].invitationId as string;
      expect(newId).not.toBe(id);
      expect((await post(`${invitePath}/continue`, { token })).status).toBe(
        404,
      );
      expect((await accept(recipient, handle, randomUUID())).status).toBe(404);
      const next = await inviteToken(recipient.email, newId);
      const bound = await ready(recipient, next.token);
      const cancel = await post(
        `${admin}/${newId}/cancel`,
        undefined,
        organiser,
        randomUUID(),
      );
      expect(await cancel.json()).toEqual({
        items: [{ status: "cancelled", invitationId: newId }],
      });
      expect(await review(recipient, bound.continuation)).toEqual({
        state: "cancelled",
      });
      expect(
        (await accept(recipient, bound.continuation, randomUUID())).status,
      ).toBe(404);
      expect(
        (await read(`${journeysPath}/${journeyId}`, recipient)).status,
      ).toBe(404);
    }, 35_000);

    it.each([
      ["cancel", true],
      ["cancel", false],
      ["resend", true],
      ["resend", false],
    ] as const)(
      "serializes acceptance and %s with acceptance first = %s",
      async (action, acceptFirst) => {
        const organiser = await account();
        const recipient = await account();
        const journeyId = await createJourney(organiser);
        const id = await sendInvite(organiser, journeyId, recipient.email);
        const { token } = await inviteToken(recipient.email, id);
        const bound = await ready(recipient, token);
        if (action === "resend") {
          await owner.pool.query(
            "update kairn.journey_invitations set created_at = now() - interval '2 minutes' where id = $1",
            [id],
          );
        }
        const operation = randomUUID();
        const join = () => accept(recipient, bound.continuation, operation);
        const change = () =>
          post(
            `${invitationList(journeyId)}/${id}/${action}`,
            undefined,
            organiser,
            randomUUID(),
          );
        const outcomes = acceptFirst
          ? await orderedRace(journeyId, join, change)
          : await orderedRace(journeyId, change, join);
        expect(outcomes.map(({ status }) => status)).toEqual(
          acceptFirst ? [200, 409] : [200, 404],
        );
        expect((await status(recipient, operation)).status).toBe(
          acceptFirst ? 200 : 404,
        );
        if (acceptFirst) {
          expect(await outcomes[1].json()).toMatchObject({
            code: "invitation_accepted",
          });
        } else {
          const result = journeyInvitationBatchResult.parse(
            await outcomes[0].json(),
          );
          expect(result.items[0].status).toBe(
            action === "cancel" ? "cancelled" : "queued",
          );
          expect((await post(`${invitePath}/continue`, { token })).status).toBe(
            404,
          );
        }
      },
      40_000,
    );

    it("enforces mailbox-wide quotas across journeys and bounds repeated command records", async () => {
      const [historyOwner, first, second] = await Promise.all([
        account(),
        account(),
        account(),
      ]);
      const [historicalJourney, firstJourney, secondJourney] =
        await Promise.all([historyOwner, first, second].map(createJourney));
      const address = disposableEmail();
      const epoch = identityEpoch(config.epoch);
      await owner.pool.query(
        `
        insert into kairn.journey_invitations (
          id, journey_id, issued_by, issuer_generation, recipient, epoch_digest, created_at, expires_at, decision
        )
        select gen_random_uuid(), $1, $2, member.generation, $3, $4,
          now() - interval '5 minutes', now() + interval '6 days', 'cancelled'
        from kairn.journey_memberships as member
        cross join generate_series(1, 11)
        where member.journey_id = $1 and member.account_id = $2
        `,
        [historicalJourney, historyOwner.id, address, epoch],
      );
      const key = randomUUID();
      const commands = await Promise.all([
        post(invitationList(firstJourney), { emails: [address] }, first, key),
        post(
          invitationList(secondJourney),
          { emails: [address] },
          second,
          randomUUID(),
        ),
      ]);
      const outcomes = await Promise.all(
        commands.map((response) =>
          response.json().then(journeyInvitationBatchResult.parse),
        ),
      );
      expect(
        outcomes
          .flatMap((outcome) => outcome.items.map((row) => row.status))
          .sort(),
      ).toEqual(["queued", "rate_limited"]);
      await owner.pool.query(
        `
        insert into kairn.journey_invitation_attempts (
          journey_id, account_id, key, epoch_digest, payload_digest, result
        )
        select $1, $2, gen_random_uuid(), $3, '', '{"items":[]}'::jsonb
        from generate_series(1, 119)
        `,
        [firstJourney, first.id, epoch],
      );
      expect(
        (
          await post(
            invitationList(firstJourney),
            { emails: ["invalid"] },
            first,
            randomUUID(),
          )
        ).status,
      ).toBe(429);
      const retry = await post(
        invitationList(firstJourney),
        { emails: [address] },
        first,
        key,
      );
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual(outcomes[0]);
      await owner.pool.query(
        "update kairn.journey_invitation_attempts set recorded_at = now() - interval '15 days' where journey_id = $1 and key <> $2",
        [firstJourney, key],
      );
      await runtime.pool.query(
        "select kairn.purge_journey_invitation_data($1)",
        [epoch],
      );
      const { rows } = await owner.pool.query(
        "select count(*)::int from kairn.journey_invitation_attempts where journey_id = $1",
        [firstJourney],
      );
      expect(rows).toEqual([{ count: 1 }]);
    }, 30_000);

    it.each([true, false])(
      "serializes acceptance and removal with acceptance first = %s",
      async (acceptFirst) => {
        const organiser = await account();
        const recipient = await account();
        const journeyId = await createJourney(organiser);
        const id = await sendInvite(organiser, journeyId, recipient.email);
        const token = (await inviteToken(recipient.email, id)).token;
        const { continuation } = await ready(recipient, token);
        const {
          rows: [membership],
        } = await owner.pool.query(
          "insert into kairn.journey_memberships (journey_id, account_id) values ($1, $2) returning generation",
          [journeyId, recipient.id],
        );
        const operation = randomUUID();
        const join = () => accept(recipient, continuation, operation);
        const remove = () =>
          post(
            `${journeysPath}/${journeyId}/members/${recipient.id}/remove`,
            { membershipGeneration: membership.generation },
            organiser,
            randomUUID(),
          );
        const outcomes = acceptFirst
          ? await orderedRace(journeyId, join, remove)
          : await orderedRace(journeyId, remove, join);
        expect(outcomes.map(({ status }) => status)).toEqual(
          acceptFirst ? [200, 202] : [202, 404],
        );
        expect((await status(recipient, operation)).status).toBe(404);
        expect(
          (await read(`${journeysPath}/${journeyId}`, recipient)).status,
        ).toBe(404);
        expect(
          (await (await read("/api/v1/dashboard", recipient)).json())
            .journeyCount,
        ).toBe(0);
      },
      40_000,
    );

    it("rechecks email, expiry and membership generation, and resets old roles on fresh rejoin", async () => {
      const organiser = await account();
      const recipient = await account();
      const journeyId = await createJourney(organiser);
      const id = await sendInvite(organiser, journeyId, recipient.email);
      const { token } = await inviteToken(recipient.email, id);
      const first = await ready(recipient, token);
      const operation = randomUUID();
      await owner.pool.query(
        'update kairn_auth."user" set email = $2 where id = $1',
        [recipient.id, disposableEmail()],
      );
      expect(await review(recipient, first.continuation)).toEqual({
        state: "wrong_account",
      });
      expect(
        (await accept(recipient, first.continuation, operation)).status,
      ).toBe(404);
      await owner.pool.query(
        'update kairn_auth."user" set email = $2 where id = $1',
        [recipient.id, recipient.email],
      );
      expect(
        (await accept(recipient, first.continuation, operation)).status,
      ).toBe(200);

      await owner.pool.query(
        "insert into kairn.journey_capabilities (journey_id, account_id, capability) values ($1, $2, 'coauthor')",
        [journeyId, recipient.id],
      );
      const { rows: before } = await owner.pool.query(
        "select generation from kairn.journey_memberships where journey_id = $1 and account_id = $2",
        [journeyId, recipient.id],
      );
      const removalKey = randomUUID();
      const removePath = `${journeysPath}/${journeyId}/members/${recipient.id}/remove`;
      const removalBody = {
        membershipGeneration: before[0].generation as string,
      };
      const removed = await post(
        removePath,
        removalBody,
        organiser,
        removalKey,
      );
      expect(removed.status).toBe(202);
      const originalRemoval = await removed.json();
      expect((await status(recipient, operation)).status).toBe(404);
      expect(await review(recipient, first.continuation)).toEqual({
        state: "unavailable",
      });
      await owner.pool.query(
        "update kairn.journey_invitations set created_at = now() - interval '2 minutes' where id = $1",
        [id],
      );
      const newId = await sendInvite(organiser, journeyId, recipient.email);
      const next = await inviteToken(recipient.email, newId);
      const fresh = await ready(recipient, next.token);
      expect(
        (await accept(recipient, fresh.continuation, randomUUID())).status,
      ).toBe(200);
      expect((await status(recipient, operation)).status).toBe(404);
      expect(
        (await accept(recipient, first.continuation, operation)).status,
      ).toBe(404);
      expect(
        await (await read(`${journeysPath}/${journeyId}`, recipient)).json(),
      ).toMatchObject({ capabilities: [] });
      const { rows: after } = await owner.pool.query(
        "select generation from kairn.journey_memberships where journey_id = $1 and account_id = $2",
        [journeyId, recipient.id],
      );
      const late = await post(removePath, removalBody, organiser, removalKey);
      expect(late.status).toBe(202);
      expect(await late.json()).toEqual(originalRemoval);
      const stale = await post(
        removePath,
        removalBody,
        organiser,
        randomUUID(),
      );
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ code: "membership_changed" });
      expect(
        (await read(`${journeysPath}/${journeyId}`, recipient)).status,
      ).toBe(200);
      expect(after[0].generation).not.toBe(before[0].generation);
    }, 35_000);

    it("finds only opted-in members and binds opaque selections to the organiser and journey", async () => {
      const displayName = `Mira ${randomUUID()}`;
      const [organiser, other, person, namesake] = await Promise.all([
        account(),
        account(),
        account(disposableEmail(), displayName),
        account(disposableEmail(), displayName),
      ]);
      const journeyId = await createJourney(organiser);
      const otherJourney = await createJourney(organiser);
      const another = await createJourney(other);
      const search = (id: string, actor: Account, query: string) =>
        post(`${journeysPath}/${id}/invitees/search`, { query }, actor);
      async function discoverable(value: boolean, target = person) {
        const response = await app.request("/api/v1/profile", {
          method: "PATCH",
          headers: {
            Origin: origin,
            Cookie: target.cookie,
            "Content-Type": "application/json",
            "X-Expected-Account": target.id,
          },
          body: JSON.stringify({ inviteDiscoverable: value }),
        });
        expect(response.status).toBe(200);
      }
      expect((await search(journeyId, other, "Mira")).status).toBe(404);
      expect(
        await (await search(journeyId, organiser, person.email)).json(),
      ).toEqual({ items: [] });
      await discoverable(true);
      await discoverable(true, namesake);
      const byName = journeyInviteeMatches.parse(
        await (await search(journeyId, organiser, displayName)).json(),
      );
      expect(byName.items.map(({ ambiguous }) => ambiguous)).toEqual([
        true,
        true,
      ]);
      const response = await search(
        journeyId,
        organiser,
        person.email.toUpperCase(),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const raw = await response.json();
      const matches = journeyInviteeMatches.parse(raw);
      expect(matches.items).toHaveLength(1);
      const [match] = matches.items;
      expect(raw).toEqual(matches);
      expect(match.displayName).toBe(displayName);
      expect(match.ambiguous).toBe(false);
      expect(JSON.stringify(raw)).not.toContain(person.email);
      async function issue(id: string, actor: Account) {
        const result = await post(
          invitationList(id),
          { recipients: [{ selection: match.selection }] },
          actor,
          randomUUID(),
        );
        return journeyInvitationBatchResult.parse(await result.json()).items[0]
          .status;
      }
      expect(await issue(another, other)).toBe("invalid_email");
      expect(await issue(otherJourney, organiser)).toBe("invalid_email");
      await discoverable(false);
      expect(await issue(journeyId, organiser)).toBe("invalid_email");
      await discoverable(true);
      // An opt-out that commits during the journey lock wait must take effect for this send.
      const connection = await owner.pool.connect();
      let sending: Promise<string> | undefined;
      try {
        await connection.query("begin");
        const {
          rows: [holder],
        } = await connection.query(
          "select pg_backend_pid() as pid from kairn.journeys where id = $1 for update",
          [journeyId],
        );
        sending = issue(journeyId, organiser);
        await expect
          .poll(
            async () => {
              const {
                rows: [result],
              } = await owner.pool.query(
                "select exists (select 1 from pg_stat_activity where $1::int = any(pg_blocking_pids(pid))) as blocked",
                [holder.pid],
              );
              return result.blocked;
            },
            { timeout: 4_000 },
          )
          .toBe(true);
        await discoverable(false);
        await connection.query("commit");
        expect(await sending).toBe("invalid_email");
      } finally {
        await connection.query("rollback");
        connection.release();
        await Promise.allSettled(sending ? [sending] : []);
      }
      await discoverable(true);
      expect(await issue(journeyId, organiser)).toBe("queued");
      await sendInvite(organiser, otherJourney, person.email);
      const otherMatches = journeyInviteeMatches.parse(
        await (await search(otherJourney, organiser, person.email)).json(),
      );
      const duplicate = await post(
        invitationList(otherJourney),
        {
          recipients: [{ selection: otherMatches.items[0].selection }],
        },
        organiser,
        randomUUID(),
      );
      expect(await duplicate.json()).toEqual({
        items: [{ status: "already_pending" }],
      });
      const pending = journeyInvitationPage.parse(
        await (await read(invitationList(journeyId), organiser)).json(),
      );
      expect(pending.items[0]).toMatchObject({
        displayName: match.displayName,
      });
      expect(pending.items[0].email).toBeUndefined();
    });

    it("retries a transient SMTP failure with the same rendered link and message ID", async () => {
      const organiser = await account();
      const journeyId = await createJourney(organiser);
      const address = disposableEmail();
      const send = transport.send;
      const attempts: Parameters<typeof send>[0][] = [];
      const delivery = vi
        .spyOn(transport, "send")
        .mockImplementation(async (message) => {
          if (message.to === address) {
            attempts.push(message);
            if (attempts.length === 1)
              throw new Error("Synthetic transient SMTP error");
          }
          return send(message);
        });
      try {
        const id = await sendInvite(organiser, journeyId, address);
        await inviteToken(address, id);
        expect(attempts).toHaveLength(2);
        expect(attempts[1]).toEqual(attempts[0]);
        await expect
          .poll(async () => {
            const page = journeyInvitationPage.parse(
              await (await read(invitationList(journeyId), organiser)).json(),
            );
            return page.items[0].delivery;
          })
          .toBe("sent");
        const { rows } = await owner.pool.query(
          "select ciphertext from kairn.journey_invitation_mail where id = $1",
          [id],
        );
        expect(rows).toEqual([{ ciphertext: null }]);
      } finally {
        delivery.mockRestore();
      }
    }, 40_000);

    it("rolls back a failed queue write and denies invitation access while recovery is closed", async () => {
      const organiser = await account();
      const journeyId = await createJourney(organiser);
      const key = randomUUID();
      const address = disposableEmail();
      const send = vi
        .spyOn(boss, "send")
        .mockRejectedValueOnce(new Error("synthetic pg-boss failure"));
      try {
        const failure = await post(
          invitationList(journeyId),
          { emails: [address] },
          organiser,
          key,
        );
        expect(failure.status).toBe(503);
      } finally {
        send.mockRestore();
      }
      const { rows } = await owner.pool.query(
        "select count(*)::int as count from kairn.audit_events where journey_id = $1 and action = 'journey_invitation_issued'",
        [journeyId],
      );
      expect(rows).toEqual([{ count: 0 }]);
      expect(
        await (await read(invitationList(journeyId), organiser)).json(),
      ).toEqual({ items: [], nextCursor: null });
      const id = await sendInvite(organiser, journeyId, address, key);
      const { token } = await inviteToken(address, id);
      const staleApp = makeApp({
        ...config,
        epoch: "synthetic-recovery-epoch-without-replay",
      });
      const response = await staleApp.request(
        `${origin}${invitePath}/continue`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ token }),
        },
      );
      expect(response.status).toBe(503);
      await owner.pool.query(
        "update kairn.journey_invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 second' where id = $1",
        [id],
      );
      expect((await post(`${invitePath}/continue`, { token })).status).toBe(
        404,
      );
      expect(
        journeyInvitationPage.parse(
          await (await read(invitationList(journeyId), organiser)).json(),
        ).items[0],
      ).toMatchObject({
        id,
        decision: "expired",
        delivery: "sent",
      });
    }, 35_000);
    it("rejects old links and continuations and discards queued mail after a recovery epoch rotation", async () => {
      const organiser = await account();
      const recipient = await account();
      const journeyId = await createJourney(organiser);
      const sentId = await sendInvite(organiser, journeyId, recipient.email);
      const { token } = await inviteToken(recipient.email, sentId);
      const handle = (await ready(recipient, token)).continuation;
      await boss.offWork(journeyInvitationMailQueue);
      await invitationWorker?.then((stop) => stop());
      invitationWorker = undefined;
      const pendingEmail = disposableEmail();
      const queuedId = await sendInvite(organiser, journeyId, pendingEmail);
      const rotation = {
        ...config,
        epoch: "synthetic-restored-invitation-epoch",
      };
      const restored = makeApp(rotation);
      const rotatedDigest = identityEpoch(rotation.epoch);
      let stopRotationWorker: (() => void) | undefined;
      try {
        await owner.pool.query(
          "update kairn_auth.identity_recovery set epoch_digest = $1 where id = 'current'",
          [rotatedDigest],
        );
        stopRotationWorker = await registerJourneyInvitationMail(
          boss,
          runtime.db,
          {
            ...mailConfig,
            epoch: rotation.epoch,
          },
        );
        const rotated = {
          ...recipient,
          cookie: await signIn(recipient.email, restored),
        };
        expect(
          (
            await post(
              `${invitePath}/continue`,
              { token },
              undefined,
              undefined,
              restored,
            )
          ).status,
        ).toBe(404);
        const review = await post(
          `${invitePath}/review`,
          { continuation: handle },
          rotated,
          undefined,
          restored,
        );
        expect(review.status).toBe(200);
        expect(await review.json()).toEqual({ state: "unavailable" });
        const acceptance = await post(
          `${invitePath}/accept`,
          {
            continuation: handle,
            operationId: randomUUID(),
          },
          rotated,
          undefined,
          restored,
        );
        expect(acceptance.status).toBe(404);
        await expect
          .poll(
            async () => {
              const { rows } = await owner.pool.query(
                `
            select mail.delivery, mail.ciphertext, job.state
            from kairn.journey_invitation_mail as mail
            join pgboss.job as job on job.id = mail.id
            where mail.id = $1 and job.name = $2
            `,
                [queuedId, journeyInvitationMailQueue],
              );
              return rows;
            },
            { timeout: 10_000 },
          )
          .toEqual([
            { delivery: "expired", ciphertext: null, state: "completed" },
          ]);
        const query = encodeURIComponent(`to:${pendingEmail}`);
        const mailbox = await fetch(
          `${inbox}/api/v1/search?query=${query}`,
        ).then((response) => response.json());
        expect(mailbox.messages ?? []).toEqual([]);
      } finally {
        stopRotationWorker?.();
        await boss.offWork(journeyInvitationMailQueue);
        await owner.pool.query(
          "update kairn_auth.identity_recovery set epoch_digest = $1 where id = 'current'",
          [identityEpoch(config.epoch)],
        );
      }
    }, 35_000);
  },
);
