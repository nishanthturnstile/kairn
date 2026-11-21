import { timestamp, uuid } from "drizzle-orm/pg-core";
import { kairn } from "../../db/namespaces.js";
import { journeys } from "../journeys/schema.js";
import { accounts } from "./schema.js";

export const companionSetupState = kairn.enum("companion_setup_state", [
  "open",
  "skipped",
  "done",
  "expired",
]);

export const companionSetups = kairn
  .table("companion_setups", {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    state: companionSetupState("state").default("open").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    selectedJourneyId: uuid("selected_journey_id").references(
      () => journeys.id,
      {
        onDelete: "set null",
      },
    ),
  })
  .enableRLS();
