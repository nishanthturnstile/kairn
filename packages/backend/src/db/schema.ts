import { timestamp, uuid } from "drizzle-orm/pg-core";
import { kairn } from "./namespaces.js";

export * from "../modules/identity/auth-schema.js";
export * from "../modules/identity/schema.js";
export * from "../modules/journeys/schema.js";
export * from "../modules/lifecycle/schema.js";
export * from "../modules/sources/schema.js";
export { kairn, kairnAuth } from "./namespaces.js";

export const workerChecks = kairn.table("worker_checks", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});
