import { openDatabase } from "../src/db/index.js";
import { user } from "../src/modules/identity/auth-schema.js";
import { accounts } from "../src/modules/identity/schema.js";
import {
  journeyCapabilities,
  journeyMemberships,
  journeys,
} from "../src/modules/journeys/schema.js";

const url = URL.parse(process.env.MIGRATION_DATABASE_URL ?? "");
if (
  process.env.NODE_ENV === "production" ||
  !url ||
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  url.hostname !== "127.0.0.1" ||
  url.username !== "kairn_migrator" ||
  url.pathname !== "/kairn"
) {
  throw new Error(
    "Synthetic seed requires the loopback Kairn development migration database.",
  );
}

const person = "bc855bfe-2496-44cc-ab12-1a515f4d86f1";
const journey = "0eab9ba7-9c9c-48bd-a1d4-cc848725bfaa";
const database = openDatabase(url.href);
try {
  await database.db.transaction(async (tx) => {
    await tx
      .insert(user)
      .values({
        id: person,
        name: "Synthetic Kairn member",
        email: "development-seed@example.test",
      })
      .onConflictDoNothing({ target: user.id });
    await tx.insert(accounts).values({ id: person }).onConflictDoNothing();
    await tx
      .insert(journeys)
      .values({
        id: journey,
        createdBy: person,
        title: "Synthetic foothills walk",
      })
      .onConflictDoNothing();
    await tx
      .insert(journeyMemberships)
      .values({ journeyId: journey, accountId: person })
      .onConflictDoNothing();
    await tx
      .insert(journeyCapabilities)
      .values({
        journeyId: journey,
        accountId: person,
        capability: "administrator",
      })
      .onConflictDoNothing();
  });
  console.log(
    "Synthetic account and journey are available in the local database.",
  );
} finally {
  await database.pool.end();
}
