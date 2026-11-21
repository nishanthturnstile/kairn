# Deployment and recovery

Kairn uses one Linux VPS per environment or separate Compose projects on a reviewed shared host. Caddy serves HTTPS and routes the browser to the web and Node server. PostgreSQL, SeaweedFS and the worker have no published ports. Use different volumes, keys, credentials, repository locations and journal namespaces for staging and production.

## CI and release artifacts

[Foundation CI](../.github/workflows/ci.yml) runs the pinned Node and pnpm toolchain, checks generated contracts, typechecks, tests, and builds the production bundles. Chromium checks the creator and reader with axe. The integration tests run against PostgreSQL with PostGIS and pgvector, SeaweedFS, and Mailpit. The release smoke runs the Docker images, migrates a disposable database, and drills recovery.

On the VPS, record `uname -m`, OS, CPU, available RAM, Docker disk, region and existing workloads. Match `x86_64` to `amd64` and `aarch64` to `arm64`. Install Docker with Compose 2.30 or newer, Bash, curl and jq. Use the [official Docker installation instructions](https://docs.docker.com/engine/install/).

In GitHub, require the `foundation` and `release-smoke` checks before merging. Create protected `staging` and `production` environments. Restrict deployment branches and configure reviewers as supported by the repository plan. Merge the release and uptime workflow files into the default branch before dispatching a release or enabling the schedule. Dispatch [Build VPS release](../.github/workflows/release.yml) from the reviewed commit for the VPS architecture. The workflow builds and tests on a native Linux runner, publishes the same tested images to GHCR, and uploads a manifest with their digests. Use a read-only registry credential on the VPS when the packages are private. Keep the prior manifest and its images available. [Workflow triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) · [Protected environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

## Environment setup

Check out the reviewed deployment files on the host. Store the following files outside the checkout with access restricted to the deployment operator. Use absolute paths and plain `KEY=value` lines without shell quoting inside service environment files. Percent-encode reserved characters when embedding secrets in database or SMTP URLs.

```dotenv
# /etc/kairn/production/settings.env
KAIRN_PROJECT=kairn-production
KAIRN_SITE_ADDRESS=kairn.example.com
KAIRN_DB_ENV=/etc/kairn/production/db.env
KAIRN_STORAGE_ENV=/etc/kairn/production/storage.env
KAIRN_SERVER_ENV=/etc/kairn/production/server.env
KAIRN_WORKER_ENV=/etc/kairn/production/worker.env
KAIRN_MIGRATION_ENV=/etc/kairn/production/migration.env
KAIRN_RESTIC_ENV=/etc/kairn/production/restic.env
```

| File | Required configuration |
| --- | --- |
| `db.env` | `POSTGRES_PASSWORD`, `KAIRN_MIGRATOR_PASSWORD`, `KAIRN_RUNTIME_PASSWORD`. Set `PGBACKREST_REPO1_TYPE=s3`, `PGBACKREST_REPO1_PATH` to an environment-specific absolute prefix, plus `PGBACKREST_REPO1_S3_BUCKET`, `PGBACKREST_REPO1_S3_ENDPOINT`, `PGBACKREST_REPO1_S3_REGION`, `PGBACKREST_REPO1_S3_KEY` and `PGBACKREST_REPO1_S3_KEY_SECRET`. Set `PGBACKREST_REPO1_CIPHER_TYPE=aes-256-cbc` and `PGBACKREST_REPO1_CIPHER_PASS`. Use `PGBACKREST_REPO1_S3_URI_STYLE=path` if the provider requires path-style access. |
| `storage.env` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` for the private SeaweedFS store. |
| `server.env` | Runtime `DATABASE_URL` using `kairn_runtime` at `db:5432/kairn`, HTTPS `BETTER_AUTH_URL` matching Caddy, `BETTER_AUTH_SECRET`, `AUTH_MAIL_KEY`, `AUTH_JOURNAL_URL`, `AUTH_JOURNAL_CREDENTIAL`, and `AUTH_RECOVERY_EPOCH`. |
| `worker.env` | Runtime `DATABASE_URL`, `AUTH_JOURNAL_URL`, `AUTH_JOURNAL_CREDENTIAL`, `SMTP_URL`, `AUTH_FROM_EMAIL`, and the server's `AUTH_MAIL_KEY` and `AUTH_RECOVERY_EPOCH`. |
| `migration.env` | `MIGRATION_DATABASE_URL` and `PGBOSS_DATABASE_URL` using the `kairn_migrator` role at `db:5432/kairn`. For first setup or a restore also configure `AUTH_JOURNAL_URL`, a read credential in `AUTH_JOURNAL_CREDENTIAL`, the new `AUTH_RECOVERY_EPOCH`, and the independently retained JSON `AUTH_JOURNAL_CHECKPOINT`. |
| `restic.env` | `RESTIC_REPOSITORY=s3:https://<provider>/<bucket>/<environment-prefix>` and `RESTIC_PASSWORD`, plus that repository's `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and region or session settings as needed. |

Keep both encrypted repositories and their key recovery outside the VPS. Scope credentials to their environment and repository prefix. The application's journal credentials can append and verify events. Journal administration, retention and recovery keys belong to the independent operator. Set the new epoch in the migration, server and worker files together and keep it outside the restored volumes. Use independent secrets for authentication, mail encryption and backups. [pgBackRest S3 repository configuration](https://pgbackrest.org/configuration.html) · [restic repository setup](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)

### Packaged invitation links

Qualify the associations against the canonical staging HTTPS domain with the signed packages intended for device testing. Build with `KAIRN_APP_VARIANT=staging`, `KAIRN_ENABLE_INVITATION_APP_LINKS=1`, and `EXPO_PUBLIC_API_ORIGIN` set to that domain's HTTPS origin. Regenerate native files for these build settings before signing. Use the corresponding `production` variant for the production domain once the staged associations pass. Each build handles only the configured host, and the association points to `/journey-invitations`. [Expo universal links](https://docs.expo.dev/linking/ios-universal-links/) · [Expo Android App Links](https://docs.expo.dev/linking/android-app-links/)

Set `KAIRN_INVITATION_APP_LINKS_VARIANT` in `server.env` to match the packaged variant. Set `KAIRN_INVITATION_IOS_APP_ID_PREFIX` to the Apple App ID prefix in the signed package's application identifier. Set `KAIRN_INVITATION_ANDROID_SHA256` to the colon-separated SHA-256 fingerprint of the certificate that signs the installed Android app. Use the distribution signing certificate for Play-distributed builds. Multiple certificate fingerprints can be comma-separated during a transition. An omitted platform value leaves its association endpoint disabled. Leaving all association settings unset keeps the browser flow available from the same email URL. [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains) · [Android website associations](https://developer.android.com/training/app-links/configure-assetlinks)

From a public network, fetch `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` on the exact host and verify direct HTTP 200 JSON for each enabled platform. Compare the identifiers to the signed artifacts and confirm the Android domain is verified after install. Tap a real Mailpit invitation on the supported physical devices with the signed app installed. Cover cold launch, warm re-entry, signed-out and wrong-account paths, and the browser fallback with the app absent. Also open an ordinary account or journey URL and verify it remains in the browser. Use the invite fragment only in the device's link interaction. [Apple verification guidance](https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links) · [Android verification guidance](https://developer.android.com/training/app-links/verify-applinks)

### Provision the first environment

For provisioning, use a fresh project and point DNS to the chosen host. The example uses HTTPS on 443 and ACME on 80. Confirm the new journal is empty with its independent operator, then set `AUTH_JOURNAL_CHECKPOINT={"sequence":0,"independentlyVerifiedEmpty":true}` in the migration environment file. Set the Compose variables below in the operator shell. The commands refer to the repositories configured in the files above.

```bash
settings=/etc/kairn/production/settings.env
release=/etc/kairn/production/release.env
compose() {
  docker compose --env-file "$settings" --env-file "$release" -f infra/compose/deploy.yml "$@"
}

compose --profile ops --profile restore pull
compose up -d --wait db storage
compose exec -T -u postgres db pgbackrest --stanza=kairn stanza-create
compose exec -T -u postgres db pgbackrest --stanza=kairn check
compose run --rm --no-deps -T object-backup init
compose run --rm --no-deps -T ops pnpm --filter @kairn/backend db:migrate
compose run --rm --no-deps -T ops pnpm --filter @kairn/backend db:queue
compose run --rm --no-deps -T ops pnpm --filter @kairn/backend identity:replay
```

Before admitting traffic, take the first paired checkpoint. The `backup` command below makes it and opens the edge after checking the recovery epoch and the HTTPS readiness endpoint. For any existing repositories, locate and verify them with the given credentials before proceeding.

```bash
bash infra/operations/deploy.sh backup "$settings" "$release"
```

## Deploy and roll back

Review the candidate Drizzle SQL, pg-boss changes, and data image changes. Rehearse with staging and record which prior app image set works against the migrated database. Schedule the maintenance window with the operator and transfer both manifests to the target host. Run the following from the reviewed deployment checkout.

```bash
bash infra/operations/deploy.sh deploy "$settings" "$release" /etc/kairn/production/candidate.env
```

The command pulls the candidate first. It stops ingress and both application writer processes before pairing a database backup and named WAL restore point with a cold snapshot of SeaweedFS data and metadata. It then applies migrations, tests app and worker health privately, checks the identity recovery gate, and verifies the public readiness response over HTTPS. Record the active manifest after successful deployment. Preserve the recovery checkpoint and the old manifest.

If it fails, keep ingress closed while checking the migration, schema and container logs. When the prior app images support the current schema and queue version, copy the prior manifest and retain the current compatible database image digest and platform in that copy. Stop the candidate edge, server and worker, select the rollback manifest and run `bash infra/operations/deploy.sh open "$settings" "$release"` with `release` pointing at that copy. For an incompatible schema, prefer a forward repair. Restoring an older paired checkpoint discards later data and requires the recovery procedure and explicit incident approval.

## Paired checkpoints

Use `bash infra/operations/deploy.sh backup "$settings" "$release"` for scheduled checkpoints in a maintenance window. Stop any additional external writer, uploader, lifecycle job or object maintenance procedure before the checkpoint. The current Compose deployment has no external write ports. The command waits for the worker to stop before it records the PostgreSQL point and copies the stopped SeaweedFS volume through restic. Caddy, the app and worker stay stopped when the checkpoint fails so an operator can investigate and decide when to restore service.

The restic snapshot tagged `kairn-checkpoint` includes `/checkpoint.env` with the PostgreSQL backup label, named recovery target, WAL segment and release references. Record its snapshot ID and copy the required deployment configuration into independent, encrypted configuration storage. pgBackRest archives WAL continuously. A later WAL position can include references to objects outside a recoverable object snapshot. Use the paired point for recovery and track separate transactional and media recovery windows.

Align pgBackRest expiration, restic retention, registry digest retention and journal retention. Verify a newer paired restore before expiring an older generation. Automatic pgBackRest expiration is disabled so an object snapshot can be retired before its database backup expires. Maintain the journal through the oldest permission state that can still be restored, plus the agreed recovery window. Measure the backup outage and the time to restore using representative volume sizes. [pgBackRest backup and PITR](https://pgbackrest.org/user-guide.html) · [restic restore](https://restic.readthedocs.io/en/stable/050_restore.html)

## Restore with application access closed

1. Fence the earlier host and all writers. Obtain the latest confirmed journal receipt from the independent operator's retained records. Keep the journal checkpoint outside database and object restore volumes and record any confirmation acknowledged since the prior checkpoint. If the latest confirmed receipt cannot be established, keep traffic closed. Prepare a new project, fresh Docker volumes, the same recovery repository credentials, and the matched release from the checkpoint. Keep the edge, server and worker absent. Use a separate hostname or deny public traffic at the host firewall during validation.
2. List candidate snapshots with `compose run --rm --no-deps -T object-restore snapshots --tag kairn-checkpoint`. Read the chosen snapshot's `/checkpoint.env` via `object-restore dump <snapshot-id> /checkpoint.env`. Review the recorded manifest and set `release` to its recovered release references. Pull those images.
3. Set `backup_label`, `checkpoint` and `snapshot` to the matching values and restore both stores into the new project.

   ```bash
   compose run --rm --no-deps -T -u postgres db pgbackrest --stanza=kairn \
     --set="$backup_label" --type=name --target="$checkpoint" --target-action=promote restore
   compose run --rm --no-deps -T object-restore restore "$snapshot" --target /restore --verify
   compose up -d --wait db storage
   ```

4. Verify that PostgreSQL promoted at the named point and that the restored schema matches the checkpoint. Reconcile database references against storage and verify checksums while the app stays closed. Verify that anonymous access to private objects fails. Review the restored job state and keep writers stopped until in-flight jobs and restored credentials have been reconciled. For a checkpoint taken before receipt-gated replay was introduced, retain the checkpoint's data images for the restore, then select a reviewed application release with receipt-gated replay. Pull its operations image and apply its migrations while the server, worker and edge remain stopped. Use that release for replay and reopening.
5. Choose a new `AUTH_RECOVERY_EPOCH` and update the server, worker and migration files. Set `AUTH_JOURNAL_CHECKPOINT` in the migration file to the independently retained receipt JSON with `sequence`, `eventId`, `digest` and `receipt`. Run `compose run --rm --no-deps -T ops pnpm --filter @kairn/backend identity:replay`. The journal uses one ordered sequence for version 1 identity events and version 2 journey membership events. Replay verifies the trusted head and receipts before installing the new epoch. Verify that old sessions, links, superseded credentials and revoked memberships remain denied. Check that the member can still reach an unrelated journey after signing in again.
6. After the object and identity checks pass and the operator approves reopening, run `bash infra/operations/deploy.sh open "$settings" "$release"` against the restored project. Verify HTTPS, account and worker checks, then resume traffic. Take and verify a new paired checkpoint on the promoted timeline.

### Recover a locked account

Use the verified identity evidence retained by the independent operator to confirm the account ID and current mailbox. Record the approval and its evidence in the incident record. Set `AUTH_RECOVERY_ACCOUNT_ID` and `AUTH_RECOVERY_VERIFIED_EMAIL` temporarily in the protected migration environment, with the current recovery epoch, and run:

```bash
compose run --rm --no-deps -T ops pnpm --filter @kairn/backend identity:approve-recovery
```

The command clears the old password, sessions and reset links and records the approval. The account stays locked until the user completes a fresh password reset sent to the approved mailbox. Remove the temporary approval variables after use. A general account restriction requires its own authorized review. A subsequent restore invalidates outstanding mailbox approvals.

## Monitoring and verification before public access

Schedule `bash infra/operations/deploy.sh status "$settings" "$release" <maximum-checkpoint-age-seconds>` through the host's monitor. It checks worker startup, WAL archive health, the newest paired checkpoint's age, and HTTPS readiness. Send failures to the operator. Configure host alerts for disk space and inodes on the Docker data and WAL mounts, memory and restarts, and offsite storage quota and backup failures. Configure provider usage alerts for backups, email and any enabled metered integration. Set thresholds after inspecting the allocated VPS and agreed recovery windows.

Set the repository variable `KAIRN_PUBLIC_URL` to the production HTTPS origin to activate the [external availability workflow](../.github/workflows/uptime.yml). Enable and test failure notifications, or use the existing external uptime provider and verify delivery by making a staging probe fail. Track restore exercises regularly and record time, checkpoint age, restored object checks, journal verification and the operator who reopened access.

For a disposable synthetic drill, run the same build and smoke commands as CI with an architecture supported by the local Docker engine.

```bash
bash infra/operations/build-images.sh linux/arm64 kairn-local /tmp/kairn-release.env
bash tests/operations/release.sh /tmp/kairn-release.env
```

Use `linux/amd64` on a native x86-64 Docker host. The drill uses temporary repositories and volumes. `pnpm test:identity:recovery` exercises receipt replay and closed access on a missing tail in a separate disposable database with local Mailpit.
