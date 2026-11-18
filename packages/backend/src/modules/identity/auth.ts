import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import type { Database } from "../../db/index.js";
import { authOptions } from "./auth-options.js";
import * as authSchema from "./auth-schema.js";

export function createAuth(
  db: Database,
  config: { baseURL: string; secret: string },
) {
  return betterAuth({
    ...authOptions,
    ...config,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  });
}
