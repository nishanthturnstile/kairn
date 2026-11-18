import { serve } from "@hono/node-server";
import {
  checkDatabaseReadiness,
  createAuth,
  initializeLocalIdentity,
  localRecoveryEpoch,
  logger,
  openDatabase,
  openJobQueue,
  openRestrictionJournal,
  parseServerEnvironment,
} from "@kairn/backend";
import { createApp } from "./app.js";
import { loadReader } from "./reader.js";

const {
  HOST,
  PORT,
  DATABASE_URL,
  BETTER_AUTH_URL,
  BETTER_AUTH_SECRET,
  AUTH_MAIL_KEY,
  AUTH_RECOVERY_EPOCH,
  AUTH_JOURNAL_URL,
  AUTH_JOURNAL_CREDENTIAL,
  NODE_ENV,
  READER_BUILD_DIR,
} = parseServerEnvironment(process.env);
const { db } = openDatabase(DATABASE_URL);
const boss = openJobQueue(DATABASE_URL);
await boss.start();
const epoch = AUTH_RECOVERY_EPOCH ?? localRecoveryEpoch;
if (NODE_ENV !== "production" && !AUTH_RECOVERY_EPOCH)
  await initializeLocalIdentity(db, epoch);
const journal =
  AUTH_JOURNAL_URL &&
  AUTH_JOURNAL_CREDENTIAL &&
  openRestrictionJournal(AUTH_JOURNAL_URL, AUTH_JOURNAL_CREDENTIAL);
const reader = READER_BUILD_DIR
  ? await loadReader(READER_BUILD_DIR)
  : undefined;
const auth = createAuth(db, {
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  epoch,
  boss,
  mailKey: AUTH_MAIL_KEY,
  journal: journal || undefined,
});
const app = createApp({
  authHandler:
    NODE_ENV === "production" && (!AUTH_RECOVERY_EPOCH || !journal)
      ? async () =>
          Response.json(
            {
              code: "RECOVERY_REQUIRED",
              message: "Account access is temporarily unavailable.",
            },
            {
              status: 503,
              headers: { "Cache-Control": "private, no-store" },
            },
          )
      : auth.handler,
  checkReadiness: () => checkDatabaseReadiness(db),
  renderUnavailableReader: reader && (() => reader(null)),
});
serve({ fetch: app.fetch, hostname: HOST, port: PORT }, ({ port }) => {
  logger.info({ host: HOST, port }, "Kairn server listening");
});
