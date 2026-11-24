import {
  type createAuth,
  createJourneyDeletionService,
  createJourneyEditorialService,
  createJourneyInvitationService,
  createJourneyMembershipService,
  createJourneyService,
  createOriginalExportService,
  createOwnerRecordingService,
  createRecordingAttachmentService,
  createRecordingImportService,
  createRecordingUploadService,
  createSourceReviewService,
  type openRecordingStore,
} from "@kairn/backend";
import type { JourneyOperations } from "./http/journeys.js";

export function createJourneyOperations(
  auth: ReturnType<typeof createAuth>,
  config: Parameters<typeof createJourneyInvitationService>[1] & {
    now?: () => Date;
    recordingDeletionEnabled?: boolean;
    recordingStore?: ReturnType<typeof openRecordingStore>;
  } & Parameters<typeof createJourneyMembershipService>[1],
) {
  return {
    writeOrigins: [new URL(config.baseURL).origin],
    verifySession: auth.verifySession,
    deleteJourney: createJourneyDeletionService(auth, config),
    invitations: createJourneyInvitationService(auth, config),
    restrictMembership: createJourneyMembershipService(auth, config),
    updateEditorialCapability: createJourneyEditorialService(auth, config),
    sourceReview: createSourceReviewService(auth, config),
    originalExport: createOriginalExportService(auth, config),
    ...(config.recordingStore &&
      config.boss && {
        recordingUploads: createRecordingUploadService(
          auth,
          config.boss,
          config.recordingStore,
        ),
        recordingImports: createRecordingImportService(auth, config.boss),
        recordingAttachments: createRecordingAttachmentService(auth, {
          boss: config.boss,
          journal: config.journal,
        }),
        ownerRecordings: createOwnerRecordingService(
          auth,
          config.recordingStore,
          {
            boss: config.boss,
            journal: config.journal,
            deletionEnabled: config.recordingDeletionEnabled,
          },
        ),
      }),
    ...createJourneyService(auth, config),
  } satisfies JourneyOperations;
}
