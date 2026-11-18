import {
  openDatabase,
  openJobQueue,
  parseWorkerEnvironment,
  registerWorkerChecks,
} from "@kairn/backend";

const environment = parseWorkerEnvironment(process.env);
const { db, pool } = openDatabase(environment.DATABASE_URL);
const boss = openJobQueue(environment.DATABASE_URL, true);

const shutdown = Promise.withResolvers<void>();
const requestShutdown = () => shutdown.resolve();
process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);

try {
  await boss.start();
  await registerWorkerChecks(boss, db);
  console.log("Kairn worker is listening for jobs.");
  await shutdown.promise;
} finally {
  process.off("SIGINT", requestShutdown);
  process.off("SIGTERM", requestShutdown);
  try {
    await boss.stop({ graceful: true, timeout: 30_000 });
  } finally {
    await pool.end();
  }
}
