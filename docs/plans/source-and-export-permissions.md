# Source and export permissions

Build on the merged journey membership flow and the existing source, asset, source grant, and original-file export schemas. Before capture and sync introduce personal material, a verified owner must be able to control who can review it and revoke that access. [R1 implementation sequence](../core/product-requirements.md#182-dependency-aware-implementation-sequence) · [Source and capability rules](../core/product-requirements.md#23-source-sharing-scopes) · [Original-file export rules](../core/product-requirements.md#26-original-file-export-grants)

## 1. Owner-controlled journey review

- Use a synthetic source and original asset under `tests/` to exercise production endpoints through verified sessions and the runtime database role. Capture, upload, asset delivery, and the contributor interface follow when there is a real source entry point.
- An active journey member can share their own existing source for review. The owner can inspect and withdraw an existing grant after leaving. Later access depends on both the current grant and an active reviewer membership with coauthor or publisher capability. Participant and administrator-only memberships confer no review access. The API returns the source ID, scope, and revision with private caching headers. The original stays in the owner's library.
- Use the existing source grant row. Absence or withdrawal means **Only me**. Writes require the revision the owner saw. Initial share, explicit re-share, and withdrawal advance it. Retry of a matching current change is safe, and delayed retries cannot re-enable a withdrawn grant or withdraw a newer grant. Existing publication-reuse grants require their own scope-change workflow.
- Record owner actions in the audit log. In the same transaction as a withdrawal, record a versioned restriction event and enqueue independent confirmation. Journal failure returns pending confirmation while review remains denied. Recovery replays a withdrawal for the specific owner, source, and journey, advances the revision floor, and can retain a withdrawn row when the backup predates the grant. A more recent re-share survives an older event. Keep the runtime role off the source tables and expose only scoped database functions.

Source review uses `/api/v1/journeys/{journeyId}/sources/{sourceId}/review`. GET reads current review state. POST accepts `action` and `expectedRevision`. A withdrawal returns its event ID, revision, and confirmation status. A stale revision returns a conflict so the owner can reload the current state before retrying.

Acceptance covers private defaults, the role matrix, cross-journey denials, owner-only writes, simultaneous retries, pending confirmation and worker recovery, stale requests, membership removal, and a restored database with older source grants. Review requests never return asset IDs or object locations. Keep recovery tooling that can read the version 3 journal after the first source withdrawal. [Recovery requirements](../core/product-requirements.md#173-operations)

## 2. Capability management and publication reuse

Let administrators assign coauthor and designated-publisher capabilities independently in People. Show when an assignment changes the audience of contributed material. Audit assignments and confirm capability removal through the restriction journal. Preserve the owner's grant state through role changes and never restore old capabilities on rejoin.

Each change uses the member's current membership generation and the selected role's revision. Revocation immediately removes the role and records a version 4 restriction event. Confirmation waits for pending removals of other membership generations for that member and journey so a restore cannot bring back an earlier membership's authority. Replay applies a removal to the specific role and membership. A later explicit grant can survive an older removal.

Web and mobile People show the effect of each role before confirmation. Uncertain changes and pending revocations stay available separately for up to 24 hours in account- and journey-scoped storage. Retrying sends the original role revision and membership generation.

The source API accepts `allow_publication_reuse` with the explicit `members_unlisted_public_v1` consent and the owner's expected revision. Consent covers members-only, unlisted, and public audiences on this journey. Existing publication grants without that consent are review-only until the owner gives fresh consent. The owner can send `narrow_to_review` to keep editorial review access, or `withdraw` to end it. Both restrictions remain available after the owner leaves.

Each change advances the source revision and journey policy generation and invalidates dependent original-file export grants. Narrowing records a version 5 restriction and waits for any earlier pending withdrawal of that grant before confirmation. Replay applies the restriction to older restored data and preserves newer explicit consent. A missing or already withdrawn grant stays withdrawn during replay.

Show the consent and scope controls when the owner source library is available. Shared drafts and publications must check current rights, and projection jobs must compare policy generation before activation. Route the source audit events to editor repair notices and rebuild jobs as those surfaces are introduced. [Contribute and coauthor](../core/product-requirements.md#7-contribute-and-coauthor-with-explicit-rights)

## 3. Recipient-specific original-file export

Let an active member request exact contributed assets. The owner sees the requester, assets, expiry, and a reminder that original files can contain private metadata, then approves or declines. Store the source-grant revision for every approved asset. Verify live membership, asset state, grant expiry, and source revision at authorization, archive completion, and every managed download, including range requests.

An owner can revoke an export independently. Journal that restriction and invalidate affected managed archives and links. Source narrowing, withdrawal, asset deletion, and recipient departure must also block download. Owners retain export of their own originals. Prove grant and revocation with synthetic assets before starting capture. Verify expiry during archive generation, competing withdrawal and download, stale jobs, and restore once the archive storage flow is available.

`/api/v1/journeys/{journeyId}/original-exports` accepts a request for up to 50 known asset IDs from one owner and an explicit expiry timestamp, normalized to UTC at millisecond precision. An identical retry with the same idempotency key returns the existing request. Each recipient can create 20 requests per journey per hour. Retries do not use that allowance. The owner and current recipient can read the request or find it in their paginated list. Approval requires acknowledgement of the metadata notice and keeps the exact asset selection, expiry, source revisions, and recipient membership generation. A new membership needs a new request and approval. Legacy grants without a recorded membership do not authorize export.

`GET .../{grantId}/authorization` verifies the whole approved selection for the named recipient. It returns asset IDs and expiry for the current check. Archive generation, activation, and every download must run the live check at their own delivery boundary. Build those paths and the web and native controls when original object storage and the source library are available.

`POST .../{grantId}/revoke` denies access immediately and records a version 6 restriction. Replay revokes that exact grant and restores its confirmed receipt even when an older backup still shows it awaiting approval. A fresh request receives a new ID and requires a new owner decision.
