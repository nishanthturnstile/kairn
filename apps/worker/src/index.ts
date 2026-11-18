import {
  openDatabase,
  openJobQueue,
  openMailTransport,
  openRestrictionJournal,
  parseWorkerEnvironment,
  registerIdentityMail,
  registerIdentityRestrictions,
  registerWorkerChecks,
} from "@kairn/backend";

const environment = parseWorkerEnvironment(process.env);
const { db, pool } = openDatabase(environment.DATABASE_URL);
const boss = openJobQueue(environment.DATABASE_URL, true);
const transport = environment.SMTP_URL
  ? openMailTransport(environment.SMTP_URL)
  : undefined;
const journal =
  environment.AUTH_JOURNAL_URL && environment.AUTH_JOURNAL_CREDENTIAL
    ? openRestrictionJournal(
        environment.AUTH_JOURNAL_URL,
        environment.AUTH_JOURNAL_CREDENTIAL,
      )
    : undefined;

const shutdown = Promise.withResolvers<void>();
const requestShutdown = () => shutdown.resolve();
process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);

try {
  await boss.start();
  await registerWorkerChecks(boss, db);
  if (transport && environment.AUTH_MAIL_KEY && environment.AUTH_FROM_EMAIL) {
    await registerIdentityMail(boss, db, {
      key: environment.AUTH_MAIL_KEY,
      from: environment.AUTH_FROM_EMAIL,
      transport,
    });
  }
  await registerIdentityRestrictions(boss, db, journal);
  console.log("Kairn worker is listening for jobs.");
  await shutdown.promise;
} finally {
  process.off("SIGINT", requestShutdown);
  process.off("SIGTERM", requestShutdown);
  try {
    await boss.stop({ graceful: true, timeout: 30_000 });
  } finally {
    transport?.close();
    await pool.end();
  }
}
