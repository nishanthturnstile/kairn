import type { BetterAuthOptions } from "better-auth";

export const authOptions = {
  appName: "Kairn",
  basePath: "/api/auth",
  emailAndPassword: { enabled: false },
  session: { cookieCache: { enabled: false } },
  advanced: { database: { generateId: "uuid" } },
  telemetry: { enabled: false },
} satisfies BetterAuthOptions;
