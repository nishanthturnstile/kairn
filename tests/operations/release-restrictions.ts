import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createApp } from "../../apps/server/src/app";
import { createJourneyOperations } from "../../apps/server/src/journey-operations";
import {
  createAuth,
  createCompanionSetupService,
  createOnboardingService,
  createProfileService,
  initializeLocalIdentity,
  logger,
  openDatabase,
  openJobQueue,
  registerJourneyInvitationMail,
  replayIdentityRestrictions,
} from "../../packages/backend/src/index";
import { identityEpoch } from "../../packages/backend/src/modules/identity/state";
import {
  type RestrictionEvent,
  type RestrictionJournal,
  restrictionDigest,
} from "../../packages/backend/src/modules/lifecycle/restriction-journal";
import { unsealPayload } from "../../packages/backend/src/sealed-payload";

const origin = "https://kairn.invalid";
const oldEpoch = "synthetic-release-before-recovery-epoch";
const newEpoch = "synthetic-release-restored-recovery-epoch";
const secret = "synthetic-release-test-authentication-secret";
const mailKey = "ab".repeat(32);
const password = "Synthetic-release-password";
const journeys = "/api/v1/journeys";
const invitations = "/api/v1/journey-invitations";
const stage = process.argv[2];
assert(stage === "before" || stage === "after" || stage === "restore");

const runtimeUrl = process.env.FIXTURE_RUNTIME_DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
assert(runtimeUrl && migrationUrl);
const runtime = openDatabase(runtimeUrl);
const owner = openDatabase(migrationUrl);
const boss = openJobQueue(runtimeUrl);
logger.level = "silent";

type Record = Awaited<ReturnType<RestrictionJournal["read"]>>;
type Account = { id: string; email: string; cookie: string };
type Fixture = {
  organiser: Account;
  participant: Account;
  invitee: Account;
  revokedCookie: string;
  first: string;
  second: string;
  operationId: string;
  unrelatedOperationId: string;
  queued: { id: string; token: string; continuation: string };
  records: Record[];
};
const saved: Fixture | undefined =
  stage === "before" ? undefined : JSON.parse(readFileSync(0, "utf8"));
const records = saved?.records ?? [];
const journal: RestrictionJournal = {
  async append(event) {
    const digest = restrictionDigest(event);
    const existing = records.find((entry) => entry.event.id === event.id);
    if (existing) {
      assert.equal(existing.receipt.digest, digest);
      return existing.receipt;
    }
    const receipt = {
      eventId: event.id,
      sequence: records.length + 1,
      digest,
      receipt: `fixture/${event.id}`,
    };
    records.push({ event, receipt });
    return receipt;
  },
  async head() {
    return records.length;
  },
  async read(sequence) {
    const entry = records[sequence - 1];
    assert(entry);
    return entry;
  },
};

function application(epoch: string) {
  const config = { baseURL: origin, secret, epoch, mailKey, boss, journal };
  const auth = createAuth(runtime.db, config);
  const operations = createJourneyOperations(auth, config);
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

const app = application(stage === "restore" ? newEpoch : oldEpoch);
let requestNumber = 0;
function request(
  path: string,
  {
    account,
    body,
    key,
    target = app,
  }: {
    account?: Account;
    body?: object;
    key?: string;
    target?: typeof app;
  } = {},
) {
  const headers = new Headers({
    Origin: origin,
    "X-Forwarded-For": `198.51.100.${++requestNumber}`,
  });
  if (account) {
    headers.set("Cookie", account.cookie);
    headers.set("X-Expected-Account", account.id);
  }
  if (body) headers.set("Content-Type", "application/json");
  if (key) headers.set("Idempotency-Key", key);
  return target.request(origin + path, {
    method: body ? "POST" : "GET",
    body: JSON.stringify(body),
    headers,
  });
}

async function expectStatus(
  response: Response | Promise<Response>,
  status: number,
  label: string,
) {
  const result = await response;
  assert.equal(result.status, status, label);
  return result;
}

async function signIn(email: string) {
  const response = await expectStatus(
    request("/api/auth/sign-in/email", {
      body: { email, password },
    }),
    200,
    "Sign in to the fixture account",
  );
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="))
    ?.split(";")[0];
  assert(cookie);
  return cookie;
}

async function member() {
  const email = `release-recovery-${randomUUID()}@example.test`;
  const response = await expectStatus(
    request("/api/auth/sign-up/email", {
      body: { name: "Recovery fixture", email, password },
    }),
    200,
    "Create a fixture account",
  );
  const id: string = (await response.json()).user.id;
  await owner.pool.query(
    'update kairn_auth."user" set email_verified = true where id = $1',
    [id],
  );
  return { id, email, cookie: await signIn(email) };
}

async function createJourney(account: Account) {
  const response = await expectStatus(
    request(journeys, {
      account,
      key: randomUUID(),
      body: {
        title: "Recovery fixture",
        timeZone: "UTC",
        intendedStart: "2090-01-01T10:00",
      },
    }),
    201,
    "Create a fixture journey",
  );
  return String((await response.json()).id);
}

async function invite(
  organiser: Account,
  recipient: Account,
  journeyId: string,
) {
  const issued = await expectStatus(
    request(`${journeys}/${journeyId}/invitations`, {
      account: organiser,
      key: randomUUID(),
      body: { recipients: [{ email: recipient.email }] },
    }),
    200,
    "Issue a backup-era invitation",
  );
  const { status, invitationId: id } = (await issued.json()).items[0];
  assert.equal(status, "queued");
  const {
    rows: [mail],
  } = await owner.pool.query(
    "select ciphertext from kairn.journey_invitation_mail where id = $1",
    [id],
  );
  const payload = unsealPayload(
    Buffer.from(mailKey, "hex"),
    `journey-invitation-mail:${id}`,
    mail.ciphertext,
  ) as { url: string };
  const token = new URL(payload.url).hash.slice(1);
  const exchanged = await expectStatus(
    request(`${invitations}/continue`, { body: { token } }),
    200,
    "Exchange the backup-era link",
  );
  return {
    id: String(id),
    token,
    continuation: String((await exchanged.json()).continuation),
  };
}

async function accept(
  account: Account,
  continuation: string,
  operationId: string,
  journeyId: string,
) {
  const review = await expectStatus(
    request(`${invitations}/review`, { account, body: { continuation } }),
    200,
    "Review the invitation",
  );
  const ready = await review.json();
  assert.equal(ready.state, "ready");
  const joined = await expectStatus(
    request(`${invitations}/accept`, {
      account,
      body: { continuation: ready.continuation, operationId },
    }),
    200,
    "Accept the invitation",
  );
  assert.equal((await joined.json()).id, journeyId);
}

async function beforeCheckpoint(): Promise<Fixture> {
  await initializeLocalIdentity(runtime.db, oldEpoch);
  const organiser = await member();
  const participant = await member();
  const invitee = await member();
  const revokedCookie = await signIn(participant.email);
  const first = await createJourney(organiser);
  const second = await createJourney(organiser);
  const operationId = randomUUID();
  const unrelatedOperationId = randomUUID();
  await accept(
    participant,
    (await invite(organiser, participant, first)).continuation,
    operationId,
    first,
  );
  await accept(
    participant,
    (await invite(organiser, participant, second)).continuation,
    unrelatedOperationId,
    second,
  );
  const queued = await invite(organiser, invitee, second);
  return {
    organiser,
    participant,
    invitee,
    revokedCookie,
    first,
    second,
    operationId,
    unrelatedOperationId,
    queued,
    records,
  };
}

async function afterCheckpoint(fixture: Fixture) {
  const { organiser, participant, first, second } = fixture;
  const devices = await expectStatus(
    request("/api/auth/devices", { account: participant }),
    200,
    "List backup-era sessions",
  );
  const { devices: rows, currentDeviceId } = await devices.json();
  const other = rows.find(
    (device: { id: string }) => device.id !== currentDeviceId,
  );
  assert(other);
  await expectStatus(
    request("/api/auth/devices/revoke", {
      account: participant,
      body: { id: other.id },
    }),
    200,
    "Confirm the identity restriction",
  );
  const {
    rows: [membership],
  } = await owner.pool.query(
    "select generation from kairn.journey_memberships where journey_id = $1 and account_id = $2",
    [first, participant.id],
  );
  const removed = await expectStatus(
    request(`${journeys}/${first}/members/${participant.id}/remove`, {
      account: organiser,
      key: randomUUID(),
      body: { membershipGeneration: membership.generation },
    }),
    200,
    "Confirm the membership restriction",
  );
  assert.equal((await removed.json()).confirmation, "confirmed");
  assert.deepEqual(
    records.map(({ event }) => event.version),
    [1, 2],
  );
  await expectStatus(
    request(`${journeys}/${second}`, { account: participant }),
    200,
    "Retain access to the unrelated journey",
  );
  return fixture;
}

async function restore(fixture: Fixture) {
  const {
    first,
    second,
    participant,
    invitee,
    queued,
    revokedCookie,
    operationId,
    unrelatedOperationId,
  } = fixture;
  const checkpoint = records.at(-1)?.receipt;
  const identity = records[0]?.event;
  assert(checkpoint && identity?.version === 1);
  assert.equal(identity.accountId, participant.id);
  async function securityGeneration() {
    const {
      rows: [account],
    } = await owner.pool.query(
      "select security_generation from kairn.accounts where id = $1",
      [participant.id],
    );
    return Number(account.security_generation);
  }
  const savedGeneration = await securityGeneration();
  assert(
    savedGeneration < identity.generation,
    "The backup predates the identity restriction",
  );
  const {
    rows: [membership],
  } = await owner.pool.query(
    "select revoked_at from kairn.journey_memberships where journey_id = $1 and account_id = $2",
    [first, participant.id],
  );
  assert.equal(membership.revoked_at, null, "The backup predates the removal");
  const {
    rows: [mail],
  } = await owner.pool.query(
    "select delivery from kairn.journey_invitation_mail where id = $1",
    [queued.id],
  );
  assert.equal(
    mail.delivery,
    "queued",
    "The backup contains outstanding invitation mail",
  );

  for (const unknownVersion of [true, false]) {
    const broken: RestrictionJournal = {
      ...journal,
      async read(sequence) {
        const entry = await journal.read(sequence);
        if (sequence !== checkpoint.sequence) return entry;
        return unknownVersion
          ? {
              ...entry,
              event: {
                ...entry.event,
                version: 99,
              } as unknown as RestrictionEvent,
            }
          : { ...entry, receipt: { ...entry.receipt, digest: "0".repeat(64) } };
      },
    };
    await assert.rejects(
      replayIdentityRestrictions(owner.db, broken, newEpoch, checkpoint),
    );
    await expectStatus(
      request("/api/auth/sign-in/email", {
        body: { email: participant.email, password },
      }),
      503,
      "Keep sign-in closed after invalid journal replay",
    );
    await expectStatus(
      request(`${journeys}/${first}`, {
        account: participant,
        target: application(oldEpoch),
      }),
      503,
      "Fence the previous epoch too",
    );
    const {
      rows: [stillRestored],
    } = await owner.pool.query(
      "select revoked_at from kairn.journey_memberships where journey_id = $1 and account_id = $2",
      [first, participant.id],
    );
    assert.equal(
      stillRestored.revoked_at,
      null,
      "A broken journal applies no partial membership replay",
    );
    assert.equal(
      await securityGeneration(),
      savedGeneration,
      "A broken journal applies no partial identity replay",
    );
  }

  await replayIdentityRestrictions(owner.db, journal, newEpoch, checkpoint);
  assert.equal(
    await securityGeneration(),
    identity.generation,
    "Replay the version 1 identity restriction",
  );
  await expectStatus(
    request(`${journeys}/${second}`, {
      account: { ...participant, cookie: revokedCookie },
    }),
    401,
    "Do not restore a revoked session",
  );
  const active = { ...participant, cookie: await signIn(participant.email) };
  await expectStatus(
    request(`${journeys}/${first}`, { account: active }),
    404,
    "Keep the removed journey closed",
  );
  await expectStatus(
    request(`${journeys}/${second}`, { account: active }),
    200,
    "Keep the unrelated journey accessible",
  );
  const dashboard = await expectStatus(
    request("/api/v1/dashboard", { account: active }),
    200,
    "Read restored Dashboard",
  );
  assert.equal((await dashboard.json()).journeyCount, 1);
  await expectStatus(
    request(`${invitations}/acceptance-status`, {
      account: active,
      body: { operationId },
    }),
    404,
    "Deny backup-era acceptance recovery",
  );
  await expectStatus(
    request(`${invitations}/acceptance-status`, {
      account: active,
      body: { operationId: unrelatedOperationId },
    }),
    404,
    "Deny the old receipt even when membership still grants access",
  );
  await expectStatus(
    request(`${invitations}/continue`, {
      body: { token: queued.token },
    }),
    404,
    "Deny a backup-era link",
  );
  const activeInvitee = { ...invitee, cookie: await signIn(invitee.email) };
  const review = await expectStatus(
    request(`${invitations}/review`, {
      account: activeInvitee,
      body: { continuation: queued.continuation },
    }),
    200,
    "Read a backup-era continuation",
  );
  assert.deepEqual(await review.json(), { state: "unavailable" });
  const claimProbe = await runtime.pool.connect();
  try {
    await claimProbe.query("BEGIN");
    const {
      rows: [claim],
    } = await claimProbe.query(
      "select kairn.claim_journey_invitation_mail($1::uuid, $2) as message",
      [queued.id, identityEpoch(newEpoch)],
    );
    assert.equal(
      claim.message,
      null,
      "A queued backup-era message cannot reach the transport",
    );
  } finally {
    // Leave the row queued so the worker's retention pass is exercised separately.
    await claimProbe.query("ROLLBACK").finally(() => claimProbe.release());
  }
  const stopRetention = await registerJourneyInvitationMail(boss, runtime.db, {
    key: mailKey,
    from: "fixture@example.test",
    epoch: newEpoch,
    transport: {
      async send() {
        throw new Error("Backup-era SMTP delivery is forbidden.");
      },
      close() {},
    },
  });
  try {
    const {
      rows: [expired],
    } = await owner.pool.query(
      "select delivery, ciphertext from kairn.journey_invitation_mail where id = $1",
      [queued.id],
    );
    assert.deepEqual(expired, { delivery: "expired", ciphertext: null });
  } finally {
    stopRetention();
  }
}

try {
  await boss.start();
  if (stage === "before") {
    process.stdout.write(JSON.stringify(await beforeCheckpoint()));
  } else {
    assert(saved);
    if (stage === "after")
      process.stdout.write(JSON.stringify(await afterCheckpoint(saved)));
    else {
      await restore(saved);
      console.log(
        "Replayed mixed restrictions and fenced backup-era invitations, receipts, and mail.",
      );
    }
  }
} finally {
  await boss.stop();
  await Promise.all([runtime.pool.end(), owner.pool.end()]);
}
