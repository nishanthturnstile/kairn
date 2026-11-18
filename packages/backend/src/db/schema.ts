import { pgSchema, timestamp, uuid } from "drizzle-orm/pg-core";

export const kairn = pgSchema("kairn");

export const workerChecks = kairn.table("worker_checks", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});
