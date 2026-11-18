import { z } from "zod";

export { openDatabase } from "./db/index.js";
export {
  enqueueWorkerCheck,
  openJobQueue,
  registerWorkerChecks,
} from "./jobs.js";
export { openMailTransport } from "./mail.js";
export { openObjectStore } from "./storage.js";

const serverEnvironment = z.object({
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z
    .string()
    .regex(/^\d+$/, "Expected a port number")
    .transform(Number)
    .pipe(z.int().min(1).max(65535))
    .default(3000),
});

const workerEnvironment = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
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
