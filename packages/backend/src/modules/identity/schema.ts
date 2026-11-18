import { sql } from "drizzle-orm";
import { check, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { kairn } from "../../db/namespaces.js";
import { user } from "./auth-schema.js";

export const accounts = kairn
  .table(
    "accounts",
    {
      id: uuid("id")
        .primaryKey()
        .references(() => user.id),
      createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
      restrictedAt: timestamp("restricted_at", { withTimezone: true }),
      securityGeneration: integer("security_generation").default(1).notNull(),
    },
    (account) => [
      check(
        "accounts_security_generation_positive",
        sql`${account.securityGeneration} > 0`,
      ),
    ],
  )
  .enableRLS();
