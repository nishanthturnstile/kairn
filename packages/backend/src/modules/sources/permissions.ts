import {
  type Actor,
  journeyAccess,
  type Membership,
} from "../journeys/permissions.js";
import type {
  exportGrantAssets,
  originalExportGrants,
  sourceAssets,
  sourceGrants,
  sources,
} from "./schema.js";

type Source = typeof sources.$inferSelect;
type Grant = typeof sourceGrants.$inferSelect;

interface SourceContext {
  actor: Actor;
  journeyId: string;
  membership?: Membership;
  source: Source;
  sourceGrant?: Grant;
}

function currentContribution({
  journeyId,
  source,
  sourceGrant,
}: SourceContext) {
  if (
    source.deletedAt === null &&
    sourceGrant?.journeyId === journeyId &&
    sourceGrant.sourceId === source.id &&
    sourceGrant.ownerId === source.ownerId &&
    sourceGrant.withdrawnAt === null
  ) {
    return sourceGrant;
  }
}

export function sourceAccess(context: SourceContext) {
  const { actor, journeyId, membership, source } = context;
  const access = journeyAccess(actor, journeyId, membership);
  const owner =
    actor.restrictedAt === null &&
    source.deletedAt === null &&
    actor.accountId === source.ownerId;
  const contribution = currentContribution(context);

  return {
    canReadOriginal: owner,
    canManageSourceGrant: owner,
    canReadReview: owner || (access.canReadDraft && contribution !== undefined),
    canApproveSourceReuse:
      access.canApprovePublication &&
      contribution?.scope === "publication_reuse",
  };
}

interface ExportContext extends SourceContext {
  asset: typeof sourceAssets.$inferSelect;
  exportGrant: typeof originalExportGrants.$inferSelect;
  selection: typeof exportGrantAssets.$inferSelect;
  now: Date;
}

export function canExportGrantedOriginal(context: ExportContext) {
  const {
    actor,
    asset,
    exportGrant,
    journeyId,
    membership,
    now,
    selection,
    source,
  } = context;
  const contribution = currentContribution(context);

  return (
    journeyAccess(actor, journeyId, membership).isActiveMember &&
    contribution !== undefined &&
    exportGrant.journeyId === journeyId &&
    exportGrant.recipientId === actor.accountId &&
    exportGrant.ownerId === source.ownerId &&
    exportGrant.revokedAt === null &&
    exportGrant.createdAt <= now &&
    now < exportGrant.expiresAt &&
    asset.sourceId === source.id &&
    asset.deletedAt === null &&
    selection.grantId === exportGrant.id &&
    selection.journeyId === journeyId &&
    selection.ownerId === source.ownerId &&
    selection.sourceId === source.id &&
    selection.assetId === asset.id &&
    selection.sourceGrantRevision === contribution.revision
  );
}
