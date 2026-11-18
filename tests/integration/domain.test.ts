import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import {
  accounts,
  auditEvents,
  exportGrantAssets,
  journeyCapabilities,
  journeyMemberships,
  journeys,
  originalExportGrants,
  restrictionEvents,
  sourceAssets,
  sourceGrants,
  sources,
  user,
} from "../../packages/backend/src/db/schema";
import {
  checkDatabaseReadiness,
  openDatabase,
} from "../../packages/backend/src/index";

const runtimeUrl =
  process.env.KAIRN_TEST_DATABASE_URL ??
  "postgresql://kairn_runtime:local-runtime-only@127.0.0.1:55432/kairn";
const migrationUrl =
  process.env.KAIRN_TEST_MIGRATION_DATABASE_URL ??
  "postgresql://kairn_migrator:local-migrator-only@127.0.0.1:55432/kairn";

describe.runIf(process.env.KAIRN_INTEGRATION === "1")(
  "domain database foundations",
  () => {
    it("uses the migrated database for readiness and keeps private domain access closed", async () => {
      const { db, pool } = openDatabase(runtimeUrl);
      try {
        await expect(checkDatabaseReadiness(db)).resolves.toBeUndefined();
        await expect(
          pool.query("SELECT id FROM kairn.accounts"),
        ).resolves.toMatchObject({ rows: [] });
        for (const query of [
          "SELECT id FROM kairn.journeys",
          "SELECT revision FROM kairn.source_grants",
        ]) {
          await expect(pool.query(query)).rejects.toMatchObject({
            code: "42501",
          });
        }
      } finally {
        await pool.end();
      }
    });

    it("enforces canonical membership, owner and original export scope, and journal confirmation constraints", async () => {
      const { db, pool } = openDatabase(migrationUrl);
      const ownerId = randomUUID();
      const recipientId = randomUUID();
      const journeyId = randomUUID();
      const sourceId = randomUUID();
      const assetId = randomUUID();
      const exportGrantId = randomUUID();
      const auditEventId = randomUUID();

      try {
        await expect(
          db.transaction(async (transaction) => {
            await transaction.insert(user).values(
              [ownerId, recipientId].map((id) => ({
                id,
                email: `${id}@example.test`,
                name: "Synthetic user",
              })),
            );
            await transaction
              .insert(accounts)
              .values([{ id: ownerId }, { id: recipientId }]);
            await transaction.insert(journeys).values({
              id: journeyId,
              title: "Synthetic journey",
              createdBy: ownerId,
            });
            const recipient = { journeyId, accountId: recipientId };
            await transaction.insert(journeyMemberships).values(recipient);
            await expect(
              transaction.transaction(async (nested) =>
                nested.insert(journeyMemberships).values(recipient),
              ),
            ).rejects.toMatchObject({ cause: { code: "23505" } });
            await expect(
              transaction.transaction(async (nested) =>
                nested.insert(journeyCapabilities).values({
                  journeyId,
                  accountId: ownerId,
                  capability: "publisher",
                }),
              ),
            ).rejects.toMatchObject({
              cause: { constraint: "journey_capabilities_membership_fk" },
            });

            await transaction.insert(sources).values({ id: sourceId, ownerId });
            await transaction
              .insert(sourceAssets)
              .values({ id: assetId, sourceId });
            const contribution = {
              journeyId,
              sourceId,
              ownerId,
              scope: "journey_review",
            } as const;
            await expect(
              transaction.transaction(async (nested) =>
                nested
                  .insert(sourceGrants)
                  .values({ ...contribution, ownerId: recipientId }),
              ),
            ).rejects.toMatchObject({
              cause: { constraint: "source_grants_owner_fk" },
            });
            await transaction.insert(sourceGrants).values(contribution);

            const grant = {
              id: exportGrantId,
              journeyId,
              ownerId,
              recipientId,
              expiresAt: new Date(Date.now() + 60_000),
            };
            await expect(
              transaction.transaction(async (nested) =>
                nested
                  .insert(originalExportGrants)
                  .values({ ...grant, recipientId: randomUUID() }),
              ),
            ).rejects.toMatchObject({
              cause: { constraint: "original_export_grants_recipient_fk" },
            });
            await transaction.insert(originalExportGrants).values(grant);
            const selection = {
              grantId: exportGrantId,
              assetId,
              journeyId,
              sourceId,
              ownerId,
              sourceGrantRevision: 1,
            };
            await expect(
              transaction.transaction(async (nested) =>
                nested
                  .insert(exportGrantAssets)
                  .values({ ...selection, assetId: randomUUID() }),
              ),
            ).rejects.toMatchObject({
              cause: { constraint: "export_grant_assets_source_asset_fk" },
            });
            await transaction.insert(exportGrantAssets).values(selection);

            await transaction.insert(auditEvents).values({
              id: auditEventId,
              actorId: ownerId,
              action: "source_withdrawal",
              targetKind: "source",
              targetId: sourceId,
              journeyId,
            });
            const restriction = {
              id: randomUUID(),
              auditEventId,
              operation: "source_withdrawal",
              policyGeneration: 2,
              integrityDigest: "a".repeat(64),
            } as const;
            await expect(
              transaction.transaction(async (nested) =>
                nested
                  .insert(restrictionEvents)
                  .values({ ...restriction, journalSequence: 1n }),
              ),
            ).rejects.toMatchObject({
              cause: { constraint: "restriction_events_receipt_pair" },
            });
            const [pending] = await transaction
              .insert(restrictionEvents)
              .values(restriction)
              .returning();
            expect(pending).toMatchObject({
              journalSequence: null,
              journalReceipt: null,
            });
            transaction.rollback();
          }),
        ).rejects.toThrow(/^Rollback$/);
      } finally {
        await pool.end();
      }
    });
  },
);
