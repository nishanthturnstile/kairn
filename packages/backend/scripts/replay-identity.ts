import { z } from "zod";
import {
  journalCheckpoint,
  openDatabase,
  openRestrictionJournal,
  replayIdentityRestrictions,
} from "../src/index.js";

const configuration = z
  .object({
    MIGRATION_DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    AUTH_JOURNAL_URL: z.url({ protocol: /^https$/ }),
    AUTH_JOURNAL_CREDENTIAL: z.string().min(24),
    AUTH_RECOVERY_EPOCH: z.string().min(32),
    AUTH_JOURNAL_CHECKPOINT: z.string(),
  })
  .parse(process.env);

const checkpoint = journalCheckpoint.parse(
  JSON.parse(configuration.AUTH_JOURNAL_CHECKPOINT),
);
const database = openDatabase(configuration.MIGRATION_DATABASE_URL);
try {
  const journal = openRestrictionJournal(
    configuration.AUTH_JOURNAL_URL,
    configuration.AUTH_JOURNAL_CREDENTIAL,
  );
  await replayIdentityRestrictions(
    database.db,
    journal,
    configuration.AUTH_RECOVERY_EPOCH,
    checkpoint,
  );
  console.log(
    "Verified identity restrictions and installed the new recovery epoch.",
  );
} finally {
  await database.pool.end();
}
