import { createHash } from "node:crypto";
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../../db/index.js";
import type { createAuth, VerifiedSession } from "../identity/auth.js";
import {
  createHistoryCursorCodec,
  type HistoryCursor,
  type HistorySection,
} from "./history-cursor.js";
import { journeyAccess, type Membership } from "./permissions.js";
import { resolveJourneySchedule } from "./schedule.js";
import {
  journeyCapabilities,
  journeyCreationReceipts,
  journeyMemberships,
  journeys,
} from "./schema.js";

type CreateInput = Parameters<typeof resolveJourneySchedule>[0] & {
  title: string;
  intendedEnd: string | null;
};
type HistoryQuery = { section?: HistorySection; cursor?: string };

const pageSize = 25;

function activeMembership(accountId: string) {
  return and(
    eq(journeyMemberships.journeyId, journeys.id),
    eq(journeyMemberships.accountId, accountId),
    isNull(journeyMemberships.revokedAt),
  );
}

function selectMemberJourneys(tx: DatabaseTransaction, accountId: string) {
  return tx
    .select({
      id: journeys.id,
      title: journeys.title,
      archivedAt: journeys.archivedAt,
      timeZone: journeys.timeZone,
      intendedStartLocal: journeys.intendedStartLocal,
      intendedStartAt: journeys.intendedStartAt,
      startOffset: journeys.startOffset,
      intendedEndLocal: journeys.intendedEndLocal,
      intendedEndAt: journeys.intendedEndAt,
      endOffset: journeys.endOffset,
      accountId: journeyMemberships.accountId,
      revokedAt: journeyMemberships.revokedAt,
      capabilities: sql<Membership["capabilities"][number][]>`array(
        select ${journeyCapabilities.capability}::text
        from ${journeyCapabilities}
        where ${journeyCapabilities.journeyId} = ${journeys.id}
          and ${journeyCapabilities.accountId} = ${journeyMemberships.accountId}
        order by ${journeyCapabilities.capability}
      )`,
      sortAt: sql<string>`to_char(
        coalesce(${journeys.intendedStartAt}, ${journeys.createdAt}) at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )`,
    })
    .from(journeys)
    .innerJoin(journeyMemberships, activeMembership(accountId));
}

type JourneyRow = Awaited<ReturnType<typeof selectMemberJourneys>>[number];

function projectedMinute(
  local: string | null,
  instant: Date | null,
  offset: string | null,
) {
  return local !== null && instant !== null && offset !== null
    ? { local, instant: instant.toISOString(), offset }
    : null;
}

function projectedSchedule(
  row: Pick<
    JourneyRow,
    | "timeZone"
    | "intendedStartLocal"
    | "intendedStartAt"
    | "startOffset"
    | "intendedEndLocal"
    | "intendedEndAt"
    | "endOffset"
  >,
) {
  const start = projectedMinute(
    row.intendedStartLocal,
    row.intendedStartAt,
    row.startOffset,
  );
  if (row.timeZone === null || !start) return null;
  return {
    timeZone: row.timeZone,
    intendedStart: start,
    intendedEnd: projectedMinute(
      row.intendedEndLocal,
      row.intendedEndAt,
      row.endOffset,
    ),
  };
}

function privateJourney(row: JourneyRow, accountId: string) {
  const membership = { ...row, journeyId: row.id };
  if (
    !journeyAccess({ accountId, restrictedAt: null }, row.id, membership)
      .isActiveMember
  ) {
    throw new Error("Journey membership scope does not match the actor.");
  }
  return {
    id: row.id,
    title: row.title,
    state: row.archivedAt ? ("archived" as const) : ("draft" as const),
    capabilities: row.capabilities,
    schedule: projectedSchedule(row),
  };
}

async function findJourney(
  tx: DatabaseTransaction,
  accountId: string,
  id: string,
) {
  const [row] = await selectMemberJourneys(tx, accountId)
    .where(eq(journeys.id, id))
    .limit(1);
  return row ? privateJourney(row, accountId) : undefined;
}

function afterCursor(cursor?: HistoryCursor) {
  if (!cursor) return;
  const at = sql`${cursor.at}::timestamptz`;
  const afterId = gt(journeys.id, cursor.journeyId);
  if (cursor.undated) {
    return and(
      isNull(journeys.intendedStartAt),
      or(
        sql`${journeys.createdAt} < ${at}`,
        and(sql`${journeys.createdAt} = ${at}`, afterId),
      ),
    );
  }
  const sameTime = and(sql`${journeys.intendedStartAt} = ${at}`, afterId);
  if (cursor.section === "upcoming") {
    return or(sql`${journeys.intendedStartAt} > ${at}`, sameTime);
  }
  return or(
    isNull(journeys.intendedStartAt),
    sql`${journeys.intendedStartAt} < ${at}`,
    sameTime,
  );
}

async function createPrivateJourney(
  tx: DatabaseTransaction,
  accountId: string,
  key: string,
  input: CreateInput,
) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        "journey-create-v1",
        input.title,
        input.intendedStart,
        input.intendedEnd,
        input.timeZone,
        input.startOffset ?? null,
        input.endOffset ?? null,
      ]),
    )
    .digest("hex");
  const receipts = journeyCreationReceipts;
  const [receipt] = await tx
    .select({
      journeyId: receipts.journeyId,
      payloadDigest: receipts.payloadDigest,
    })
    .from(receipts)
    .where(and(eq(receipts.accountId, accountId), eq(receipts.key, key)));
  if (receipt) {
    if (!(await findJourney(tx, accountId, receipt.journeyId)))
      return { status: 404 } as const;
    if (receipt.payloadDigest !== fingerprint) return { status: 409 } as const;
    return { status: 200, id: receipt.journeyId } as const;
  }

  // Resolve only fresh attempts. A replay uses the committed schedule.
  const resolved = resolveJourneySchedule(input);
  if (resolved.issue) return { status: 400, issue: resolved.issue } as const;
  const {
    intendedStart: start,
    intendedEnd: end,
    timeZone,
  } = resolved.schedule;
  const { rows } = await tx.execute<{ id: string }>(sql`
    select kairn.create_private_journey(
      ${key}::uuid, ${fingerprint}, ${input.title}, ${timeZone},
      ${start.local}, ${start.instant}::timestamptz, ${start.offset},
      ${end?.local ?? null}, ${end?.instant ?? null}::timestamptz, ${end?.offset ?? null}
    ) as id
  `);
  const created = rows[0];
  if (!created) throw new Error("Journey creation did not return an ID.");
  return { status: 201, id: created.id } as const;
}

export function createJourneyService(
  auth: Pick<ReturnType<typeof createAuth>, "withCurrentSession">,
  {
    secret,
    epoch,
    now = () => new Date(),
  }: { secret: string; epoch: string; now?: () => Date },
) {
  const cursors = createHistoryCursorCodec(secret, epoch);

  function withJourneyScope<Result>(
    session: VerifiedSession,
    operation: (tx: DatabaseTransaction, accountId: string) => Promise<Result>,
  ) {
    return auth.withCurrentSession(session, async (tx) => {
      await tx.execute(
        sql`select set_config('kairn.journey_account', ${session.accountId}, true)`,
      );
      return operation(tx, session.accountId);
    });
  }

  async function historyPage(
    tx: DatabaseTransaction,
    accountId: string,
    asOf: string,
    section: HistorySection,
    cursor?: HistoryCursor,
  ) {
    const start = journeys.intendedStartAt;
    const asOfDate = new Date(asOf);
    const rows = await selectMemberJourneys(tx, accountId)
      .where(
        and(
          section === "upcoming"
            ? gt(start, asOfDate)
            : or(lte(start, asOfDate), isNull(start)),
          afterCursor(cursor),
        ),
      )
      .orderBy(
        ...(section === "upcoming"
          ? [asc(start)]
          : [
              sql`${start} desc nulls last`,
              sql`case when ${start} is null then ${journeys.createdAt} end desc`,
            ]),
        asc(journeys.id),
      )
      .limit(pageSize + 1);

    const page = rows.slice(0, pageSize);
    const last = page.at(-1);
    return {
      items: page.map((row) => privateJourney(row, accountId)),
      nextCursor:
        last && rows.length > pageSize
          ? cursors.encode(accountId, {
              version: 1,
              section,
              asOf,
              at: last.sortAt,
              journeyId: last.id,
              undated: last.intendedStartAt === null,
            })
          : null,
    };
  }

  return {
    dashboard(session: VerifiedSession) {
      return withJourneyScope(session, async (tx, accountId) => {
        const asOf = now().toISOString();
        const result = await tx.execute<
          Pick<
            JourneyRow,
            | "title"
            | "archivedAt"
            | "timeZone"
            | "intendedStartLocal"
            | "startOffset"
            | "intendedEndLocal"
            | "endOffset"
          > & {
            id: string | null;
            upcoming: boolean | null;
            intendedStartAt: string | null;
            intendedEndAt: string | null;
            journeyCount: string;
            upcomingCount: string;
          }
        >(sql`
          with eligible as (
            select ${journeys}.*, (${journeys.archivedAt} is null and
              ${journeys.intendedStartAt} > ${asOf}::timestamptz) as upcoming
            from ${journeys}
            join ${journeyMemberships} on ${activeMembership(accountId)}
          ), stats as (
            select count(*) as journey_count,
              count(*) filter (where upcoming) as upcoming_count
            from eligible
          ), picks as (
            (select * from eligible where upcoming
             order by intended_start_at, id limit 1)
            union all
            (select * from eligible where intended_start_at <= ${asOf}::timestamptz or intended_start_at is null
             order by intended_start_at desc nulls last,
               case when intended_start_at is null then created_at end desc, id limit 3)
          )
          select picks.id, picks.title, picks.upcoming, picks.archived_at as "archivedAt",
            picks.time_zone as "timeZone", picks.intended_start_local as "intendedStartLocal",
            picks.intended_start_at as "intendedStartAt", picks.start_offset as "startOffset",
            picks.intended_end_local as "intendedEndLocal", picks.intended_end_at as "intendedEndAt",
            picks.end_offset as "endOffset", stats.journey_count as "journeyCount",
            stats.upcoming_count as "upcomingCount"
          from stats left join picks on true
          order by (picks.upcoming is true) desc, picks.intended_start_at desc nulls last,
            case when picks.intended_start_at is null then picks.created_at end desc, picks.id
        `);
        const first = result.rows[0];
        if (!first) throw new Error("Dashboard totals are missing.");
        const selected = result.rows.flatMap((row) =>
          row.id
            ? [
                {
                  upcoming: row.upcoming === true,
                  journey: {
                    id: row.id,
                    title: row.title,
                    state: row.archivedAt
                      ? ("archived" as const)
                      : ("draft" as const),
                    schedule: projectedSchedule({
                      ...row,
                      intendedStartAt: row.intendedStartAt
                        ? new Date(row.intendedStartAt)
                        : null,
                      intendedEndAt: row.intendedEndAt
                        ? new Date(row.intendedEndAt)
                        : null,
                    }),
                  },
                },
              ]
            : [],
        );
        return {
          status: 200,
          summary: {
            asOf,
            journeyCount: Number(first.journeyCount),
            upcomingCount: Number(first.upcomingCount),
            nextJourney: selected.find((row) => row.upcoming)?.journey ?? null,
            recentJourneys: selected
              .filter((row) => !row.upcoming)
              .map((row) => row.journey),
          },
        } as const;
      });
    },
    create(session: VerifiedSession, key: string, input: CreateInput) {
      return withJourneyScope(session, (tx, accountId) =>
        createPrivateJourney(tx, accountId, key, input),
      );
    },
    history(session: VerifiedSession, query: HistoryQuery) {
      return withJourneyScope(session, async (tx, accountId) => {
        if (query.section && query.cursor) {
          const cursor = cursors.decode(accountId, query.section, query.cursor);
          if (!cursor) return { status: 400 } as const;
          const page = await historyPage(
            tx,
            accountId,
            cursor.asOf,
            query.section,
            cursor,
          );
          return {
            status: 200,
            history: { asOf: cursor.asOf, section: query.section, page },
          } as const;
        }
        const asOf = now().toISOString();
        const upcoming = await historyPage(tx, accountId, asOf, "upcoming");
        const recent = await historyPage(tx, accountId, asOf, "recent");
        return { status: 200, history: { asOf, upcoming, recent } } as const;
      });
    },
    detail(session: VerifiedSession, journeyId: string) {
      return withJourneyScope(session, async (tx, accountId) => {
        const journey = await findJourney(tx, accountId, journeyId);
        return journey
          ? ({ status: 200, journey } as const)
          : ({ status: 404 } as const);
      });
    },
  };
}
