import { z } from "zod";
import { openDatabase } from "../src/db/index.js";
import { approveCredentialRecovery } from "../src/modules/identity/recovery.js";

const settings = z
  .object({
    MIGRATION_DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    AUTH_RECOVERY_EPOCH: z.string().min(32),
    AUTH_RECOVERY_ACCOUNT_ID: z.uuid(),
    AUTH_RECOVERY_VERIFIED_EMAIL: z.email(),
  })
  .parse(process.env);
const { db, pool } = openDatabase(settings.MIGRATION_DATABASE_URL);
try {
  await approveCredentialRecovery(db, {
    accountId: settings.AUTH_RECOVERY_ACCOUNT_ID,
    verifiedEmail: settings.AUTH_RECOVERY_VERIFIED_EMAIL,
    epoch: settings.AUTH_RECOVERY_EPOCH,
  });
  console.log(
    "Account is eligible for a fresh password reset at its verified address.",
  );
} catch {
  console.error(
    "Recovery approval failed. Check the current epoch, account lock and verified address.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
