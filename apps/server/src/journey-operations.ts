import { type createAuth, createJourneyService } from "@kairn/backend";
import type { JourneyOperations } from "./http/journeys.js";

export function createJourneyOperations(
  auth: ReturnType<typeof createAuth>,
  config: { baseURL: string; secret: string; epoch: string; now?: () => Date },
): JourneyOperations {
  return {
    writeOrigins: [new URL(config.baseURL).origin],
    verifySession: auth.verifySession,
    ...createJourneyService(auth, config),
  };
}
