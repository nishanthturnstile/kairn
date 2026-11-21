import {
  type createAuth,
  createJourneyInvitationService,
  createJourneyMembershipService,
  createJourneyService,
} from "@kairn/backend";
import type { JourneyOperations } from "./http/journeys.js";

export function createJourneyOperations(
  auth: ReturnType<typeof createAuth>,
  config: Parameters<typeof createJourneyInvitationService>[1] & {
    now?: () => Date;
  } & Parameters<typeof createJourneyMembershipService>[1],
) {
  return {
    writeOrigins: [new URL(config.baseURL).origin],
    verifySession: auth.verifySession,
    invitations: createJourneyInvitationService(auth, config),
    restrictMembership: createJourneyMembershipService(auth, config),
    ...createJourneyService(auth, config),
  } satisfies JourneyOperations;
}
