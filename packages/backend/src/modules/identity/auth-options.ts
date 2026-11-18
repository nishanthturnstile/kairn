import type { BetterAuthOptions } from "better-auth";

export const authOptions = {
  appName: "Kairn",
  basePath: "/api/auth",
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    minPasswordLength: 12,
    resetPasswordTokenExpiresIn: 1800,
    revokeSessionsOnPasswordReset: true,
  },
  session: { cookieCache: { enabled: false }, freshAge: 10 * 60 },
  rateLimit: { enabled: true },
  logger: { disabled: true },
  advanced: { database: { generateId: "uuid" }, disableOriginCheck: false },
  telemetry: { enabled: false },
} satisfies BetterAuthOptions;
