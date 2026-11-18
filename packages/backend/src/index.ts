import { z } from "zod";

export { checkDatabaseReadiness, openDatabase } from "./db/index.js";
export {
  enqueueWorkerCheck,
  openJobQueue,
  registerWorkerChecks,
} from "./jobs.js";
export { openMailTransport } from "./mail.js";
export { createAuth } from "./modules/identity/auth.js";
export { openObjectStore } from "./storage.js";

const databaseUrl = z.url({ protocol: /^postgres(?:ql)?$/ });
const authOrigin = z
  .url({ protocol: /^https?$/ })
  .refine((value) => value.replace(/\/$/, "") === URL.parse(value)?.origin, {
    error: "Expected an HTTP origin without a path or credentials",
  });
const serverEnvironment = z
  .object({
    HOST: z.string().trim().min(1).default("127.0.0.1"),
    PORT: z
      .string()
      .regex(/^\d+$/, "Expected a port number")
      .transform(Number)
      .pipe(z.int().min(1).max(65535))
      .default(3000),
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: authOrigin,
    BETTER_AUTH_SECRET: z.string().min(32),
    READER_BUILD_DIR: z.string().min(1).optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .refine(
    (environment) =>
      environment.NODE_ENV !== "production" ||
      environment.BETTER_AUTH_URL.startsWith("https://"),
    { path: ["BETTER_AUTH_URL"], error: "Expected HTTPS in production" },
  );

const workerEnvironment = z.object({
  DATABASE_URL: databaseUrl,
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export function parseServerEnvironment(input: NodeJS.ProcessEnv) {
  return serverEnvironment.parse(input);
}

export function parseWorkerEnvironment(input: NodeJS.ProcessEnv) {
  return workerEnvironment.parse(input);
}
