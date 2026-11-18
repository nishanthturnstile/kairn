import { z } from "zod";

const publicEnvironment = z.object({
  appName: z.string().trim().min(1).default("Kairn"),
});

export function parsePublicEnvironment(input: { appName: unknown }) {
  return publicEnvironment.parse(input);
}
