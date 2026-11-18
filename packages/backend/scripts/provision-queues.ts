import { z } from "zod";
import { openJobQueue, workerCheckQueue } from "../src/jobs.js";

const databaseUrl = z
  .url({ protocol: /^postgres(?:ql)?$/ })
  .parse(process.env.PGBOSS_DATABASE_URL);
const boss = openJobQueue(databaseUrl);

try {
  await boss.start();
  await boss.createQueue(workerCheckQueue);
} finally {
  await boss.stop();
}
