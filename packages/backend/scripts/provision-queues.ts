import { z } from "zod";
import { openJobQueue, workerCheckQueue } from "../src/jobs.js";
import { identityMailQueue } from "../src/modules/identity/email.js";
import { journeyInvitationMailQueue } from "../src/modules/journeys/invitation-mail.js";
import { restrictionQueue } from "../src/modules/lifecycle/identity-restrictions.js";

import {
  recordingInspectionQueue,
  recordingReclaimQueue,
} from "../src/modules/recordings/job-queue.js";

const databaseUrl = z
  .url({ protocol: /^postgres(?:ql)?$/ })
  .parse(process.env.PGBOSS_DATABASE_URL);
const boss = openJobQueue(databaseUrl);

try {
  await boss.start();
  await boss.createQueue(workerCheckQueue);
  await boss.createQueue(identityMailQueue);
  await boss.createQueue(journeyInvitationMailQueue);
  await boss.createQueue(restrictionQueue);
  await boss.createQueue(recordingInspectionQueue);
  await boss.createQueue(recordingReclaimQueue);
} finally {
  await boss.stop();
}
